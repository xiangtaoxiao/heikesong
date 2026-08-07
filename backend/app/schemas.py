from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ModelConfig(BaseModel):
    id: str = Field(min_length=1)
    provider: Literal["mock", "openai_compatible"] = "mock"
    model: str = "mock-philosopher"
    api_base: str | None = None
    api_key: str | None = Field(default=None, exclude=True)
    api_key_env: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=800, ge=64, le=8000)


class AgentManifest(BaseModel):
    agent_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    display_name: str = Field(min_length=1)
    model_id: str = "mock-philosopher"
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=64, le=8000)


class AgentSummary(BaseModel):
    agent_id: str
    display_name: str
    model_id: str
    source_type: Literal["skill", "custom"]
    core_filename: str
    has_agent_md: bool
    docs: list[str]
    doc_count: int


class UpsertAgentRequest(BaseModel):
    agent_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    display_name: str = Field(min_length=1)
    model_id: str = "mock-philosopher"
    agent_md: str = Field(min_length=1)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=64, le=8000)


class AgentDocRequest(BaseModel):
    filename: str = Field(min_length=1)
    content: str = Field(min_length=1)


class HistoryMessage(BaseModel):
    agent_id: str = Field(min_length=1)
    agent_name: str = Field(min_length=1)
    role: Literal["agent", "user"]
    content: str = Field(min_length=1)
    round_index: int = Field(ge=1, le=10)
    model_id: str = ""
    read_docs: list[str] = Field(default_factory=list)


class StartSessionRequest(BaseModel):
    topic: str = Field(min_length=1)
    agent_ids: list[str] = Field(min_length=1)
    rounds: int = Field(default=3, ge=1, le=10)
    start_round: int = Field(default=1, ge=1, le=10)
    run_rounds: int | None = Field(default=None, ge=1, le=10)
    session_id: str | None = None
    history: list[HistoryMessage] = Field(default_factory=list)
    system_prompt: str = ""
    mode: str = "roundtable"
    llm_config: ModelConfig | None = Field(default=None, alias="model_config")
    include_moderator_summary: bool = False


class SessionInfo(BaseModel):
    session_id: str
    topic: str
    agent_ids: list[str]
    rounds: int
    system_prompt: str
    mode: str
    status: Literal["created", "running", "completed", "stopped", "error"]
    created_at: datetime


class DialogueMessage(BaseModel):
    id: str
    session_id: str
    agent_id: str
    agent_name: str
    role: Literal["agent", "user", "system", "moderator"]
    content: str
    round_index: int
    model_id: str
    read_docs: list[str] = Field(default_factory=list)
    created_at: datetime
