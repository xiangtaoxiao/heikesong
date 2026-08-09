# 论语圆桌 · 星空圆桌

一个哲学圆桌讨论游戏，围绕《论语》中的争议性话题展开讨论。

## 快速启动

```bash
cd backend
cp config/api_config.example.json config/api_config.json   # 填入主办方 key（问 Eric 要，别提交！）
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

| 入口 | 说明 |
|---|---|
| http://127.0.0.1:8001/game | **语音房圆桌 MVP**（V2 视觉版：选人→三案两圈→议题升级→哲学 MBTI 报告） |
| http://127.0.0.1:8001/ | 最初的 Zoom 会议风版本 |
| http://127.0.0.1:8001/sprites-review | 哲学家雪碧图/动画审阅页 |
| http://127.0.0.1:8001/voices-review | 音色审阅页（21 个可用音色试听，改音色→`config/game/personas.json`） |

语音房版技术要点：文本 = claude-haiku-4-5-20251001，语音 = qwen3-tts-flash（都走主办方 openai-next 代理，**模型必须用带日期全名**，别名在代理上是坏的）；后端 `app/game.py`，剧本与人格 `config/game/`，素材 `static/assets/`（GPT-Image-2 生成的绿幕雪碧图 + `tools/chroma_key.py` 抠图）。

⚠️ **API key 永远不要提交**：`api_config.json` 已在 .gitignore 里；历史提交里的旧 key 请尽快在主办方平台作废。

## 配置

编辑 `backend/config/api_config.json` 配置 LLM API：

```json
{
  "api_key": "your-api-key",
  "api_base": "https://api.openai.com/v1",
  "model": "your-model-name"
}
```

不配置 API 时会自动使用本地模拟模式。

## 项目结构

```
philosopher_agent_game/
├── backend/          # FastAPI 后端
│   ├── app/          # 核心代码
│   ├── config/       # 配置（RULES.md, models.json, api_config.json）
│   ├── static/       # 前端页面
│   └── data/         # 会话数据
├── skills/           # 哲学家 Agent 知识库
│   ├── aristotle-agent/
│   ├── hanfeizi-agent/
│   ├── schopenhauer-agent/
│   └── zhuangzi-agent/
├── start.sh          # 启动脚本
└── README.md
```
