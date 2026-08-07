# 论语圆桌 · 星空圆桌

一个哲学圆桌讨论游戏，围绕《论语》中的争议性话题展开讨论。

## 快速启动

```bash
cd philosopher_agent_game
bash start.sh
```

然后打开浏览器访问 http://127.0.0.1:8001

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
