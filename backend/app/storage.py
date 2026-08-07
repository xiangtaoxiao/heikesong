from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from .config import CUSTOM_AGENTS_DIR, DEFAULT_SKILL_AGENTS, MAX_DOC_BYTES, MODELS_PATH, RULES_PATH, SESSIONS_DIR, SKILLS_DIR
from .schemas import AgentManifest, AgentSummary, DialogueMessage, ModelConfig, SessionInfo


SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")
SKILL_AGENT_LOOKUP = {item["agent_id"]: item for item in DEFAULT_SKILL_AGENTS}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def safe_filename(name: str) -> str:
    base = Path(name).name
    if not base.endswith(".md") or not SAFE_NAME_RE.match(base):
        raise HTTPException(status_code=400, detail="Only safe .md filenames are allowed")
    return base


def safe_relative_doc_path(name: str) -> Path:
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or not name.endswith(".md"):
        raise HTTPException(status_code=400, detail="Only safe relative .md paths are allowed")
    if any(not SAFE_NAME_RE.match(part) for part in path.parts):
        raise HTTPException(status_code=400, detail="Only safe relative .md paths are allowed")
    return path


def custom_agent_dir(agent_id: str) -> Path:
    if not re.match(r"^[a-zA-Z0-9_-]+$", agent_id):
        raise HTTPException(status_code=400, detail="Invalid agent_id")
    return CUSTOM_AGENTS_DIR / agent_id


def skill_agent_dir(agent_id: str) -> Path:
    skill = SKILL_AGENT_LOOKUP.get(agent_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill agent not found")
    return SKILLS_DIR / skill["skill_dir"]


def agent_source_type(agent_id: str) -> str:
    return "skill" if agent_id in SKILL_AGENT_LOOKUP else "custom"


def agent_root(agent_id: str) -> Path:
    if agent_id in SKILL_AGENT_LOOKUP:
        return skill_agent_dir(agent_id)
    return custom_agent_dir(agent_id)


def agent_core_filename(agent_id: str) -> str:
    return "SKILL.md" if agent_id in SKILL_AGENT_LOOKUP else "AGENT.md"


def agent_display_name(agent_id: str) -> str:
    skill = SKILL_AGENT_LOOKUP.get(agent_id)
    if skill:
        return skill["display_name"]
    manifest = load_manifest(agent_id)
    return manifest.display_name


def manifest_path(agent_id: str) -> Path:
    return custom_agent_dir(agent_id) / "manifest.json"


def load_rules() -> str:
    if not RULES_PATH.exists():
        return ""
    return RULES_PATH.read_text(encoding="utf-8")


def save_rules(content: str) -> None:
    RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    RULES_PATH.write_text(content, encoding="utf-8")


def load_models() -> dict[str, ModelConfig]:
    if not MODELS_PATH.exists():
        return {"mock-philosopher": ModelConfig(id="mock-philosopher")}
    raw = json.loads(MODELS_PATH.read_text(encoding="utf-8"))
    return {item["id"]: ModelConfig(**item) for item in raw.get("models", [])}


def save_models(models: list[ModelConfig]) -> None:
    MODELS_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODELS_PATH.write_text(json.dumps({"models": [model.model_dump() for model in models]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_manifest(agent_id: str) -> AgentManifest:
    if agent_id in SKILL_AGENT_LOOKUP:
        skill = SKILL_AGENT_LOOKUP[agent_id]
        return AgentManifest(agent_id=agent_id, display_name=skill["display_name"], model_id="")
    path = manifest_path(agent_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentManifest(**json.loads(path.read_text(encoding="utf-8")))


def save_manifest(manifest: AgentManifest) -> None:
    path = manifest_path(manifest.agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upsert_agent(manifest: AgentManifest, agent_md: str) -> AgentSummary:
    directory = agent_root(manifest.agent_id)
    directory.mkdir(parents=True, exist_ok=True)
    if manifest.agent_id in SKILL_AGENT_LOOKUP:
        (directory / "SKILL.md").write_text(agent_md, encoding="utf-8")
    else:
        docs_dir = directory / "docs"
        docs_dir.mkdir(parents=True, exist_ok=True)
        save_manifest(manifest)
        (directory / "AGENT.md").write_text(agent_md, encoding="utf-8")
    return summarize_agent(manifest.agent_id)


def summarize_agent(agent_id: str) -> AgentSummary:
    manifest = load_manifest(agent_id)
    directory = agent_root(agent_id)
    docs = list_agent_docs(agent_id)
    return AgentSummary(
        agent_id=manifest.agent_id,
        display_name=manifest.display_name,
        model_id=manifest.model_id,
        source_type=agent_source_type(agent_id),
        core_filename=agent_core_filename(agent_id),
        has_agent_md=(directory / agent_core_filename(agent_id)).exists(),
        docs=docs,
        doc_count=len(docs),
    )


def list_agents() -> list[AgentSummary]:
    summaries = [summarize_agent(item["agent_id"]) for item in DEFAULT_SKILL_AGENTS if (SKILLS_DIR / item["skill_dir"] / "SKILL.md").exists()]
    if CUSTOM_AGENTS_DIR.exists():
        summaries.extend(
            summarize_agent(path.name)
            for path in sorted(CUSTOM_AGENTS_DIR.iterdir())
            if (path / "manifest.json").exists()
        )
    return summaries


def read_agent_md(agent_id: str) -> str:
    path = agent_root(agent_id) / agent_core_filename(agent_id)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Agent {agent_id} has no {agent_core_filename(agent_id)}")
    return path.read_text(encoding="utf-8")


def list_agent_docs(agent_id: str) -> list[str]:
    root = agent_root(agent_id)
    core_filename = agent_core_filename(agent_id)
    if agent_id in SKILL_AGENT_LOOKUP:
        docs_dir = root / "references"
        if not docs_dir.exists():
            return []
        return sorted(
            str(path.relative_to(docs_dir))
            for path in docs_dir.rglob("*.md")
            if path.name != core_filename
        )
    docs_dir = root / "docs"
    if not docs_dir.exists():
        return []
    return sorted(path.name for path in docs_dir.glob("*.md"))


def read_agent_docs(agent_id: str, names: list[str]) -> dict[str, str]:
    root = agent_root(agent_id)
    allowed = set(list_agent_docs(agent_id))
    result: dict[str, str] = {}
    for name in names:
        if agent_id in SKILL_AGENT_LOOKUP:
            rel_path = safe_relative_doc_path(name)
            rel_name = str(rel_path)
            if rel_name not in allowed:
                continue
            result[rel_name] = (root / "references" / rel_path).read_text(encoding="utf-8")
        else:
            filename = safe_filename(name)
            if filename not in allowed:
                continue
            result[filename] = (root / "docs" / filename).read_text(encoding="utf-8")
    return result


def save_agent_doc(agent_id: str, filename: str, content: str) -> str:
    filename = safe_filename(filename)
    data = content.encode("utf-8")
    if len(data) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail=f"Document exceeds {MAX_DOC_BYTES} bytes")
    if agent_id in SKILL_AGENT_LOOKUP:
        docs_dir = agent_root(agent_id) / "references" / "uploads"
        docs_dir.mkdir(parents=True, exist_ok=True)
        (docs_dir / filename).write_text(content, encoding="utf-8")
    else:
        docs_dir = agent_root(agent_id) / "docs"
        docs_dir.mkdir(parents=True, exist_ok=True)
        (docs_dir / filename).write_text(content, encoding="utf-8")
    return filename


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.jsonl"


def write_session_info(info: SessionInfo) -> None:
    path = session_path(info.session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"type": "session", "data": info.model_dump(mode="json")}
    path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")


def append_message(message: DialogueMessage) -> None:
    record = {"type": "message", "data": message.model_dump(mode="json")}
    with session_path(message.session_id).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
