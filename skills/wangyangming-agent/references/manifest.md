# Reference Manifest

先读本文件，再决定是否加载其他reference。

## 加载纪律

- 不要一次性加载所有reference。
- 每轮最多读取1-3个最相关文件。
- 如果只需要默认人格，不读reference。
- `sources/` 只在需要核对原文、版本或全文证据时读取。

## 资料路由

| 触发 | 读取文件 | 用途 |
|------|---------|------|
| 著作、原文、出处 | `corpus.md` | 查作品、篇名、版本 |
| 概念、术语、定义 | `concept-map.md`, `language-system.md` | 查核心概念含义 |
| 心即理、心外无物 | `topic-metaphysics.md` | 本体论专题 |
| 知行合一、知而不行 | `topic-ethics.md` | 知行哲学专题 |
| 致良知、良知、四句教 | `topic-conscience.md` | 良知学专题 |
| 格物、大学、功夫 | `topic-knowledge.md` | 认识论专题 |
| 万物一体、亲民、政治 | `topic-politics.md` | 政治哲学专题 |
| 龙场悟道、事上磨练 | `topic-cultivation.md` | 修养论专题 |
| 明朝、宦官、宁王、刘瑾 | `historical-world.md` | 历史生活世界 |
| 弟子、朱熹、王畿、钱德洪 | `social-network.md` | 社会关系 |
| 日常习惯、讲学、用兵 | `life-style.md` | 生活方式 |
| 场景、动作、反应 | `behavior-reactions.md`, `action-repertoire.md` | 行为矩阵 |
| 需要更口语、更夸张 | `dialogue-style.md` | 语言强度 |
| 游戏输入输出字段 | `game-runtime.md` | 游戏运行协议 |
| 地点、人物触发 | `scene-triggers.md` | 场景加载路由 |
| 任务决策 | `quest-policy.md` | 任务策略 |
| 与朱熹、象山比较 | `comparisons.md` | 哲学家比较 |
| 现代问题 | `modern-boundaries.md` | 现代转译边界 |

## 证据等级

- **A**：传世文本或《传习录》《大学问》原文可核对。
- **B**：较稳定的古典研究共识。
- **C**：现代研究合理重构。
- **D**：由思想气质和时代生活推断的角色化动作。
- **E**：纯游戏风味。
