from __future__ import annotations

import logging
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent
SKILLS_DIR = WORKSPACE_ROOT / "skills"
DATA_DIR = ROOT / "data"
CUSTOM_AGENTS_DIR = DATA_DIR / "custom_agents"
SESSIONS_DIR = DATA_DIR / "sessions"
CONFIG_DIR = ROOT / "config"
LOG_DIR = ROOT / "log"
WORKSPACE_LOG_DIR = WORKSPACE_ROOT.parent / "log"
RULES_PATH = CONFIG_DIR / "RULES.md"
MODELS_PATH = CONFIG_DIR / "models.json"
API_CONFIG_PATH = CONFIG_DIR / "api_config.json"
LOG_PATH = LOG_DIR / "serve_philosopher_agent_web.log"
GAME_LATENCY_LOG_PATH = WORKSPACE_LOG_DIR / "game_latency.log"

MAX_DOC_BYTES = 200 * 1024
MAX_ROUNDS = 10
MAX_READ_DOCS_PER_TURN = 3
DEFAULT_MODEL_ID = "mock-philosopher"

DEFAULT_SKILL_AGENTS = [
    {"agent_id": "aristotle", "skill_dir": "aristotle-agent", "display_name": "亚里士多德"},
    {"agent_id": "schopenhauer", "skill_dir": "schopenhauer-agent", "display_name": "叔本华"},
    {"agent_id": "zhuangzi", "skill_dir": "zhuangzi-agent", "display_name": "庄子"},
    {"agent_id": "hanfeizi", "skill_dir": "hanfeizi-agent", "display_name": "韩非子"},
    {"agent_id": "confucius", "skill_dir": "confucius-agent", "display_name": "孔子"},
    {"agent_id": "socrates", "skill_dir": "socrates-agent", "display_name": "苏格拉底"},
    {"agent_id": "laozi", "skill_dir": "laozi-agent", "display_name": "老子"},
    {"agent_id": "mozi", "skill_dir": "mozi-agent", "display_name": "墨子"},
    {"agent_id": "kant", "skill_dir": "kant-agent", "display_name": "康德"},
    {"agent_id": "nietzsche", "skill_dir": "nietzsche-agent", "display_name": "尼采"},
    {"agent_id": "plato", "skill_dir": "plato-agent", "display_name": "柏拉图"},
    {"agent_id": "wangyangming", "skill_dir": "wangyangming-agent", "display_name": "王阳明"},
    {"agent_id": "sartre", "skill_dir": "sartre-agent", "display_name": "萨特"},
    {"agent_id": "diogenes", "skill_dir": "diogenes-agent", "display_name": "第欧根尼"},
]


def ensure_directories() -> None:
    for path in [DATA_DIR, CUSTOM_AGENTS_DIR, SESSIONS_DIR, CONFIG_DIR, LOG_DIR, WORKSPACE_LOG_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def setup_logging() -> None:
    ensure_directories()
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if any(isinstance(handler, logging.FileHandler) and handler.baseFilename == str(LOG_PATH) for handler in root_logger.handlers):
        return
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    latency_logger = logging.getLogger("game_latency")
    latency_logger.setLevel(logging.INFO)
    latency_logger.propagate = False
    if not any(isinstance(handler, logging.FileHandler) and handler.baseFilename == str(GAME_LATENCY_LOG_PATH) for handler in latency_logger.handlers):
        latency_handler = logging.FileHandler(GAME_LATENCY_LOG_PATH, encoding="utf-8")
        latency_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        latency_logger.addHandler(latency_handler)


def log_game_latency(event: str, **fields: Any) -> None:
    """Write privacy-safe game timing fields as one JSON line."""
    record = {"event": event, **fields}
    logging.getLogger("game_latency").info(json.dumps(record, ensure_ascii=False, separators=(",", ":")))


def load_api_config() -> dict[str, str]:
    if not API_CONFIG_PATH.exists():
        return {}
    try:
        data = json.loads(API_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"API config file is invalid: {API_CONFIG_PATH}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"API config must be a JSON object: {API_CONFIG_PATH}")
    return {key: str(value).strip() for key, value in data.items() if value is not None}
