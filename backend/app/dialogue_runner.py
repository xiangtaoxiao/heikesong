from __future__ import annotations

import asyncio
import json
import logging
import random
import uuid
from datetime import timezone

from .config import MAX_READ_DOCS_PER_TURN, load_api_config
from .llm_client import LLMClient
from .schemas import DialogueMessage, ModelConfig, SessionInfo, StartSessionRequest
from .storage import append_message, list_agent_docs, load_manifest, load_models, load_rules, read_agent_docs, read_agent_md, utc_now, write_session_info


LOGGER = logging.getLogger(__name__)
MAX_MESSAGE_CHARS = 50
MAX_MESSAGE_RETRIES = 3
RELAXED_MESSAGE_CHARS = int(MAX_MESSAGE_CHARS * 1.2)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class DialogueRunner:
    def __init__(self) -> None:
        self.llm = LLMClient()

    async def stream_session(self, request: StartSessionRequest):
        is_new_session = not request.session_id
        session_id = request.session_id or str(uuid.uuid4())
        session = SessionInfo(
            session_id=session_id,
            topic=request.topic,
            agent_ids=request.agent_ids,
            rounds=request.rounds,
            system_prompt=request.system_prompt,
            mode=request.mode,
            status="running",
            created_at=utc_now(),
        )
        if is_new_session:
            write_session_info(session)
            LOGGER.info("Started session %s topic=%s agents=%s rounds=%s", session.session_id, request.topic, request.agent_ids, request.rounds)
            yield sse("session_started", session.model_dump(mode="json"))
        else:
            yield sse("session_resumed", {"session_id": session.session_id, "start_round": request.start_round})

        history = [
            DialogueMessage(
                id=str(uuid.uuid4()),
                session_id=session.session_id,
                agent_id=item.agent_id,
                agent_name=item.agent_name,
                role=item.role,
                content=item.content,
                round_index=item.round_index,
                model_id=item.model_id,
                read_docs=item.read_docs,
                created_at=utc_now(),
            )
            for item in request.history
        ]
        if not is_new_session:
            previous_round = request.start_round - 1
            user_messages = [item for item in history if item.role == "user" and item.round_index == previous_round]
            if user_messages:
                append_message(user_messages[-1])
        model_config = self._session_model_config(request)
        rules = load_rules()
        run_rounds = request.run_rounds or request.rounds
        last_round = min(request.rounds, request.start_round + run_rounds - 1)
        try:
            for round_index in range(request.start_round, last_round + 1):
                yield sse("round_started", {"session_id": session.session_id, "round_index": round_index})
                round_agent_ids = list(request.agent_ids)
                random.shuffle(round_agent_ids)
                yield sse("round_order", {"session_id": session.session_id, "round_index": round_index, "agent_ids": round_agent_ids})
                for agent_id in round_agent_ids:
                    manifest = load_manifest(agent_id)
                    agent_md = read_agent_md(agent_id)
                    available_docs = list_agent_docs(agent_id)
                    yield sse("agent_started", {"session_id": session.session_id, "agent_id": agent_id, "round_index": round_index})
                    should_speak = await asyncio.to_thread(
                        self._should_speak,
                        model_config,
                        rules,
                        request.system_prompt,
                        agent_md,
                        manifest.display_name,
                        request.topic,
                        round_index,
                        history,
                    )
                    if not should_speak:
                        yield sse("agent_skipped", {"session_id": session.session_id, "agent_id": agent_id, "agent_name": manifest.display_name, "round_index": round_index})
                        continue
                    selected_doc_names = await asyncio.to_thread(
                        self._select_docs,
                        model_config,
                        rules,
                        request.system_prompt,
                        agent_md,
                        manifest.display_name,
                        request.topic,
                        round_index,
                        history,
                        available_docs,
                    )
                    selected_docs = read_agent_docs(agent_id, selected_doc_names)
                    yield sse("docs_read", {"session_id": session.session_id, "agent_id": agent_id, "docs": list(selected_docs)})
                    content = await asyncio.to_thread(
                        self._generate_message,
                        model_config,
                        rules,
                        request.system_prompt,
                        agent_md,
                        selected_docs,
                        manifest.display_name,
                        request.topic,
                        round_index,
                        history,
                        None,
                        None,
                    )
                    if content is None:
                        yield sse("agent_skipped", {"session_id": session.session_id, "agent_id": agent_id, "agent_name": manifest.display_name, "round_index": round_index, "reason": f"连续超出字数限制，已放弃本轮发言（第3次上限 {RELAXED_MESSAGE_CHARS} 字）"})
                        continue
                    message = DialogueMessage(
                        id=str(uuid.uuid4()),
                        session_id=session.session_id,
                        agent_id=agent_id,
                        agent_name=manifest.display_name,
                        role="agent",
                        content=content,
                        round_index=round_index,
                        model_id=model_config.id,
                        read_docs=list(selected_docs),
                        created_at=utc_now(),
                    )
                    append_message(message)
                    history.append(message)
                    yield sse("message", message.model_dump(mode="json"))
                yield sse("round_completed", {"session_id": session.session_id, "round_index": round_index})
            if last_round >= request.rounds:
                yield sse("session_completed", {"session_id": session.session_id, "status": "completed"})
                LOGGER.info("Completed session %s messages=%s", session.session_id, len(history))
            else:
                yield sse("user_input_requested", {"session_id": session.session_id, "round_index": last_round})
        except Exception as exc:
            LOGGER.exception("Session %s failed", session.session_id)
            yield sse("error", {"session_id": session.session_id, "error": str(exc)})

    def _session_model_config(self, request: StartSessionRequest) -> ModelConfig:
        api_config = load_api_config()
        if request.llm_config:
            config = request.llm_config
            if config.provider == "openai_compatible" and api_config:
                return config.model_copy(update={
                    "api_base": api_config.get("api_base") or config.api_base,
                    "api_key": api_config.get("api_key") or config.api_key,
                    "model": api_config.get("model") or config.model,
                })
            return config
        models = load_models()
        config = models["mock-philosopher"]
        if api_config.get("api_key"):
            return config.model_copy(update={
                "provider": "openai_compatible",
                "api_base": api_config.get("api_base"),
                "api_key": api_config.get("api_key"),
                "model": api_config.get("model") or config.model,
            })
        return config

    def _should_speak(
        self,
        model_config: ModelConfig,
        rules: str,
        system_prompt: str,
        agent_md: str,
        display_name: str,
        topic: str,
        round_index: int,
        history: list[DialogueMessage],
    ) -> bool:
        prompt = "\n".join([
            f"你是 {display_name}，正在参加多 agent 哲学圆桌。",
            f"话题：{topic}",
            f"当前轮次：{round_index}",
            "以下是截至目前的完整对话历史：",
            self._history_text(history),
            "请判断你本轮是否应该抢答。只有在能具体回应、追问、反驳或推进其他人的观点时才发言；如果没有必要重复观点，可以暂不发言。只返回 JSON，不要输出其他内容：{\"speak\":true} 或 {\"speak\":false}。",
        ])
        try:
            response = self.llm.generate(model_config, self._base_messages(rules, system_prompt, agent_md, prompt), temperature=0, max_tokens=80)
            parsed = json.loads(response)
            return bool(parsed.get("speak", True))
        except Exception as exc:
            LOGGER.warning("Speak decision failed for %s; defaulting to speak: %s", display_name, exc)
            return True

    def _select_docs(
        self,
        model_config: ModelConfig,
        rules: str,
        system_prompt: str,
        agent_md: str,
        display_name: str,
        topic: str,
        round_index: int,
        history: list[DialogueMessage],
        available_docs: list[str],
    ) -> list[str]:
        if not available_docs:
            return []
        prompt = "\n".join(
            [
                f"你是 {display_name}。现在判断本轮是否需要读取资料。",
                f"话题：{topic}",
                f"轮次：{round_index}",
                f"可读取资料：{', '.join(available_docs)}",
                "最近对话：",
                self._history_text(history),
                f"最多选择 {MAX_READ_DOCS_PER_TURN} 个。请只返回 JSON，例如 {{\"read\":[\"ethics.md\"]}}；不需要资料则返回 {{\"read\":[]}}。",
            ]
        )
        try:
            response = self.llm.generate(model_config, self._base_messages(rules, system_prompt, agent_md, prompt), temperature=0, max_tokens=200)
        except Exception as exc:
            LOGGER.warning("Doc selection failed; continuing without docs: %s", exc)
            return []
        try:
            parsed = json.loads(response)
            selected = parsed.get("read", [])
        except json.JSONDecodeError:
            LOGGER.warning("Doc selection returned non-JSON: %s", response)
            return []
        allowed = set(available_docs)
        return [name for name in selected if name in allowed][:MAX_READ_DOCS_PER_TURN]

    def _generate_message(
        self,
        model_config: ModelConfig,
        rules: str,
        system_prompt: str,
        agent_md: str,
        selected_docs: dict[str, str],
        display_name: str,
        topic: str,
        round_index: int,
        history: list[DialogueMessage],
        temperature: float | None,
        max_tokens: int | None,
    ) -> str | None:
        docs_text = "\n\n".join(f"## {name}\n{content}" for name, content in selected_docs.items()) or "本轮未读取资料。"
        prompt = "\n".join(
            [
                f"你是 {display_name}，正在参加多 agent 哲学圆桌。",
                f"话题：{topic}",
                f"当前轮次：{round_index}",
                "最近对话：",
                self._history_text(history),
                "本轮已读取资料：",
                docs_text,
                f"请遵守 RULES.md：先回应上一位 agent 的具体观点，再提出你的推进。发言必须像现场讨论，且严格不超过 {MAX_MESSAGE_CHARS} 个字。只输出发言正文。",
            ]
        )
        last_length = 0
        for attempt in range(1, MAX_MESSAGE_RETRIES + 1):
            try:
                content = self.llm.generate(model_config, self._base_messages(rules, system_prompt, agent_md, prompt), temperature=temperature, max_tokens=max_tokens).strip()
            except RuntimeError as exc:
                if "empty content" not in str(exc) and "empty HTTP body" not in str(exc):
                    raise
                content = ""
            limit = RELAXED_MESSAGE_CHARS if attempt == MAX_MESSAGE_RETRIES else MAX_MESSAGE_CHARS
            last_length = len(content)
            if content and last_length <= limit:
                return content
            LOGGER.warning("Message rejected for %s attempt=%s chars=%s limit=%s; retrying", display_name, attempt, last_length, limit)
            if attempt < MAX_MESSAGE_RETRIES:
                prompt += f"\n\n上一次输出长度为 {last_length} 个字，未通过限制。请重新发言，严格控制在 {MAX_MESSAGE_CHARS} 个字以内，只输出正文。"
        LOGGER.warning("Skipping %s after %s oversized responses; final limit=%s chars=%s", display_name, MAX_MESSAGE_RETRIES, RELAXED_MESSAGE_CHARS, last_length)
        return None

    def _base_messages(self, rules: str, system_prompt: str, agent_md: str, user_prompt: str) -> list[dict[str, str]]:
        system = "\n\n".join(
            [
                "# RULES.md\n" + rules,
                "# 本次对话系统提示词\n" + (system_prompt or "无"),
                "# 当前 agent 的核心文档\n" + agent_md,
            ]
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}]

    def _history_text(self, history: list[DialogueMessage]) -> str:
        if not history:
            return "暂无前文。"
        return "\n".join(f"{item.agent_name}：{item.content}" for item in history)
