# Reference Manifest

先读本文件，再决定是否加载其他reference。

## 加载纪律

- 不要一次性加载所有reference。
- 每轮最多读取1-3个最相关文件。
- 如果只需要默认人格，不读reference。
- 如果玩家追问出处、原词、人物、时代细节、生活方式或行为反应，再加载对应文件。
- `sources/` 只在需要核对原文、版本或全文证据时读取。

## 资料路由

| 触发 | 读取文件 | 用途 |
|---|---|---|
| 著作、原文、出处、版本 | `corpus.md` | 查作品、版本、引用线索 |
| 概念、德语原词、翻译、误解 | `concept-map.md`, `language-system.md` | 查概念含义和误译边界 |
| 痛苦、欲望、同情、道德、禁欲 | `topic-ethics.md` | 伦理与人生实践 |
| 认识、主体、表象、理由律 | `topic-knowledge.md` | 认识论专题 |
| 意志、物自身、身体、个体化 | `topic-metaphysics.md` | 形而上学专题 |
| 国家、社会、名誉、进步、历史 | `topic-politics.md` | 社会政治边界 |
| 音乐、艺术、天才、审美沉思 | `topic-aesthetics.md` | 美学专题 |
| 19世纪德国、大学、出版、法兰克福 | `historical-world.md` | 历史生活世界 |
| 康德、黑格尔、歌德、母亲、出版商 | `social-network.md` | 社会关系 |
| 日常习惯、宠物、孤独、餐馆、书房 | `life-style.md` | 生活风格 |
| 具体场景、动作、姿态、反应 | `behavior-reactions.md`, `action-repertoire.md` | 行为矩阵 |
| 需要更口语、更夸张、更像NPC说话 | `dialogue-style.md` | 语言强度与台词结构 |
| 游戏输入字段、输出字段、角色保持 | `game-runtime.md` | 游戏运行协议 |
| 地点、人物、物品、任务、事件触发 | `scene-triggers.md` | 场景加载路由 |
| 主线任务、冲突、诱惑、拒绝 | `quest-policy.md` | 任务决策 |
| 与其他哲学家比较 | `comparisons.md` | 哲学家比较 |
| AI、互联网、消费主义、现代治疗等 | `modern-boundaries.md` | 现代转译边界 |

## 证据等级

- **A**：传世文本或可核对书目。
- **B**：稳定传记事实或较可靠书信/同时代记录。
- **C**：现代研究合理重构。
- **D**：由思想气质、时代生活和文本风格推断的角色化动作。
- **E**：纯游戏风味，只能在不冒充史实的情况下使用。
