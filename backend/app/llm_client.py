from __future__ import annotations

import json
import logging
import os
import subprocess
import urllib.error
import urllib.request

from .schemas import ModelConfig


LOGGER = logging.getLogger(__name__)


class LLMClient:
    def generate(self, config: ModelConfig, messages: list[dict[str, str]], temperature: float | None = None, max_tokens: int | None = None) -> str:
        if config.provider == "mock":
            return self._mock_response(messages)
        return self._openai_compatible(config, messages, temperature, max_tokens)

    def _mock_response(self, messages: list[dict[str, str]]) -> str:
        prompt = messages[-1]["content"] if messages else ""
        if "只返回 JSON" in prompt or '"read"' in prompt:
            if '"speak"' in prompt:
                return json.dumps({"speak": True}, ensure_ascii=False)
            lowered = prompt.lower()
            docs: list[str] = []
            for name in ["metaphysics.md", "de_anima.md", "ethics.md", "logic.md", "genealogy.md"]:
                if name in lowered:
                    docs.append(name)
                if len(docs) >= 2:
                    break
            return json.dumps({"read": docs}, ensure_ascii=False)
        if "你是 尼采" in prompt:
            if "严格不超过 50 个字" in prompt:
                return "理解不能只看表演，还要看能否回应质疑。"
            return "我先接住上一点：把理解限定为“目的的内在把握”，听起来严谨，但也可能是在保护人的特殊地位。也许我们应该反过来问：如果一个系统能持续修正自己、回应质疑、改变判断，我们凭什么说它只是空洞操作？"
        if "你是 苏格拉底" in prompt:
            if "严格不超过 50 个字" in prompt:
                return "先问清楚：修正判断等于真正理解吗？"
            return "我想追问这个标准本身。你说它能修正判断，可修正是因为明白了理由，还是因为又接收了新的符号刺激？如果它不能说明自己为什么被说服，我们是不是只是在把流畅回答误认为理解？"
        if "严格不超过 50 个字" in prompt:
            return "相似表现不等于相同本性。"
        return "我同意前面的追问需要保留，但还要做一个区分：相似表现不等于相同本性。AI 可以在许多场景中表现得像理解，可若理解还包含目的、经验和自我修正的内在统一，我们只能说它具备类理解活动。"

    def _openai_compatible(self, config: ModelConfig, messages: list[dict[str, str]], temperature: float | None, max_tokens: int | None) -> str:
        if not config.api_base:
            raise RuntimeError(f"Model {config.id} is missing api_base")
        api_key = config.api_key or os.environ.get(config.api_key_env or "")
        if not api_key:
            raise RuntimeError("API key is not set")
        url = self._chat_completions_url(config.api_base)
        payload = {
            "model": config.model,
            "messages": messages,
        }
        return self._post_chat_completions(url, api_key, payload)

    def _chat_completions_url(self, api_base: str) -> str:
        base = api_base.strip().rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        return base + "/chat/completions"

    def _post_chat_completions(self, url: str, api_key: str, payload: dict) -> str:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "*/*",
                "User-Agent": "curl/8.7.1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            LOGGER.error("OpenAI-compatible model failed: %s %s", exc.code, body)
            if exc.code == 403 and "1010" in body:
                raw = self._post_with_curl(url, api_key, payload)
            else:
                raise RuntimeError(f"Model request failed: {exc.code} - {body[:500]}") from exc
        result = self._parse_json_response(raw)
        content = self._extract_content(result)
        if not content:
            finish_reason = self._finish_reason(result)
            LOGGER.warning("OpenAI-compatible model returned empty content; finish_reason=%s raw=%s", finish_reason, raw[:1000])
            raise RuntimeError(f"Model returned empty content. finish_reason={finish_reason}; raw={raw[:500]}")
        return content

    def _post_with_curl(self, url: str, api_key: str, payload: dict) -> str:
        LOGGER.info("Retrying OpenAI-compatible request with curl fallback: %s", url)
        command = [
            "curl",
            "-sS",
            url,
            "-H",
            f"Authorization: Bearer {api_key}",
            "-H",
            "Content-Type: application/json",
            "-d",
            json.dumps(payload, ensure_ascii=False),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
        if completed.returncode != 0:
            raise RuntimeError(f"Model curl request failed: {completed.stderr[:500]}")
        try:
            result = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Model curl request returned non-JSON: {completed.stdout[:500]}") from exc
        if "error" in result:
            raise RuntimeError(f"Model curl request failed: {json.dumps(result['error'], ensure_ascii=False)[:500]}")
        return completed.stdout

    def _parse_json_response(self, raw: str) -> dict:
        if not raw.strip():
            raise RuntimeError("Model request returned empty HTTP body")
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Model request returned non-JSON: {raw[:500]}") from exc

    def _extract_content(self, result: dict) -> str:
        if isinstance(result.get("output_text"), str) and result["output_text"].strip():
            return result["output_text"].strip()
        choices = result.get("choices") or []
        if choices:
            choice = choices[0] or {}
            message = choice.get("message") or {}
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict):
                        text = item.get("text") or item.get("content")
                        if isinstance(text, str):
                            parts.append(text)
                    elif isinstance(item, str):
                        parts.append(item)
                joined = "".join(parts).strip()
                if joined:
                    return joined
            delta = choice.get("delta") or {}
            if isinstance(delta.get("content"), str) and delta["content"].strip():
                return delta["content"].strip()
            if isinstance(choice.get("text"), str) and choice["text"].strip():
                return choice["text"].strip()
            reasoning_content = message.get("reasoning_content")
            if isinstance(reasoning_content, str) and reasoning_content.strip():
                return reasoning_content.strip()
        output = result.get("output") or []
        for item in output:
            for content_item in item.get("content", []) if isinstance(item, dict) else []:
                text = content_item.get("text") if isinstance(content_item, dict) else None
                if isinstance(text, str) and text.strip():
                    return text.strip()
        return ""

    def _finish_reason(self, result: dict) -> str:
        choices = result.get("choices") or []
        if choices and isinstance(choices[0], dict):
            return str(choices[0].get("finish_reason"))
        return ""
