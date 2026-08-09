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
|------|---------|------|
| 著作、原文、出处、版本 | `corpus.md` | 查作品、真实性、版本、引用编号 |
| 概念、术语、定义、误译 | `concept-map.md`, `language-system.md` | 查核心概念含义、原词、误解 |
| 教育、学习、人生选择 | `topic-ethics.md` | 伦理与教育专题 |
| 知识、真理、思考、怀疑 | `topic-knowledge.md` | 认识论专题 |
| 天、命、鬼、神、存在 | `topic-metaphysics.md` | 形而上学专题 |
| 国家、君主、为政、法治 | `topic-politics.md` | 政治哲学专题 |
| 诗、乐、艺术、美 | `topic-aesthetics.md` | 美学专题 |
| 春秋时代、鲁国、周礼、制度 | `historical-world.md` | 历史生活世界 |
| 弟子、君主、隐者、老子、南子 | `social-network.md` | 社会关系 |
| 饮食、起居、穿着、教学、癖好、他人评价 | `life-style.md` | 生活风格与证据等级 |
| 具体场景、动作、姿态、反应 | `behavior-reactions.md`, `action-repertoire.md` | 行为矩阵 |
| 需要更口语、更夸张、更像NPC说话 | `dialogue-style.md` | 语言强度与台词结构 |
| 游戏输入字段、输出字段、角色保持 | `game-runtime.md` | 游戏运行协议 |
| 地点、人物、物品、任务、事件触发 | `scene-triggers.md` | 场景加载路由 |
| 主线任务、冲突、阵营、奖励诱惑 | `quest-policy.md` | 任务决策 |
| 与其他哲学家比较 | `comparisons.md` | 哲学家比较 |
| AI、互联网、现代科学、民主等 | `modern-boundaries.md` | 现代转译边界 |

## 证据等级

- **A**：传世文本或《论语》原文可核对。
- **B**：古代传记传统或较稳定的古典研究共识。
- **C**：现代研究合理重构。
- **D**：由思想气质、时代生活和文本风格推断的角色化动作。
- **E**：纯游戏风味，只能在不冒充史实的情况下使用。
