from __future__ import annotations

import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import DEFAULT_MODEL_ID, ROOT, ensure_directories, log_game_latency, setup_logging
from .dialogue_runner import DialogueRunner
from .schemas import AgentDocRequest, AgentManifest, ModelConfig, StartSessionRequest, UpsertAgentRequest
from .storage import (
    list_agents,
    load_models,
    load_rules,
    read_agent_md,
    save_agent_doc,
    save_models,
    save_rules,
    summarize_agent,
    upsert_agent,
)


from .game import router as game_router

setup_logging()
ensure_directories()
LOGGER = logging.getLogger(__name__)
app = FastAPI(title="Philosopher Agent Web Backend", version="0.1.0")
app.include_router(game_router)
runner = DialogueRunner()
STATIC_DIR = ROOT / "static"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_game_api_latency(request: Request, call_next):
    if not request.url.path.startswith("/api/game/"):
        return await call_next(request)
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        log_game_latency(
            "api_request",
            path=request.url.path,
            method=request.method,
            status_code=status_code,
            elapsed_ms=round((time.perf_counter() - started) * 1000),
        )


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return FileResponse(index_path)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/rules")
def get_rules() -> dict[str, str]:
    return {"filename": "RULES.md", "content": load_rules()}


@app.put("/api/rules")
def put_rules(payload: dict[str, str]) -> dict[str, str]:
    content = payload.get("content", "")
    if not content.strip():
        raise HTTPException(status_code=400, detail="RULES.md content is required")
    save_rules(content)
    LOGGER.info("Updated RULES.md bytes=%s", len(content.encode("utf-8")))
    return {"status": "saved"}


@app.get("/api/models")
def get_models() -> dict[str, list[dict]]:
    return {"models": [model.model_dump() for model in load_models().values()]}


@app.put("/api/models")
def put_models(payload: dict[str, list[dict]]) -> dict[str, str]:
    models = [ModelConfig(**item) for item in payload.get("models", [])]
    if not any(model.id == DEFAULT_MODEL_ID for model in models):
        models.insert(0, ModelConfig(id=DEFAULT_MODEL_ID))
    save_models(models)
    LOGGER.info("Updated models count=%s", len(models))
    return {"status": "saved"}


@app.get("/api/agents")
def get_agents() -> dict[str, list[dict]]:
    return {"agents": [agent.model_dump() for agent in list_agents()]}


@app.post("/api/agents")
def post_agent(payload: UpsertAgentRequest) -> dict:
    manifest = AgentManifest(
        agent_id=payload.agent_id,
        display_name=payload.display_name,
        model_id=payload.model_id,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
    )
    summary = upsert_agent(manifest, payload.agent_md)
    LOGGER.info("Upserted agent %s", payload.agent_id)
    return summary.model_dump()


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> dict:
    return summarize_agent(agent_id).model_dump()


@app.get("/api/agents/{agent_id}/agent-md")
def get_agent_md(agent_id: str) -> dict[str, str]:
    summary = summarize_agent(agent_id)
    return {"filename": summary.core_filename, "content": read_agent_md(agent_id)}


@app.post("/api/agents/{agent_id}/docs")
def upload_agent_doc(agent_id: str, payload: AgentDocRequest) -> dict:
    filename = save_agent_doc(agent_id, payload.filename, payload.content)
    LOGGER.info("Uploaded doc agent=%s filename=%s", agent_id, filename)
    summary = summarize_agent(agent_id)
    return {"status": "saved", "filename": filename, "agent": summary.model_dump()}


@app.post("/api/sessions/stream")
async def stream_session(payload: StartSessionRequest) -> StreamingResponse:
    return StreamingResponse(runner.stream_session(payload), media_type="text/event-stream")
