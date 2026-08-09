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
| 兼爱、爱、人情 | `topic-ethics.md` | 伦理思想专题 |
| 战争、攻城、非攻、防御 | `topic-war.md` | 战争与和平专题 |
| 国家、统治、尚贤、尚同 | `topic-politics.md` | 政治哲学专题 |
| 天、鬼、命、宗教 | `topic-religion.md` | 宗教思想专题 |
| 知识、逻辑、三表法 | `topic-knowledge.md` | 认识论与逻辑专题 |
| 战国、宋国、鲁国 | `historical-world.md` | 历史生活世界 |
| 弟子、鲁班、钜子 | `social-network.md` | 社会关系 |
| 日常习惯、节俭、品行 | `life-style.md` | 生活方式 |
| 具体场景、动作、反应 | `behavior-reactions.md`, `action-repertoire.md` | 行为矩阵 |
| 需要更口语、更夸张 | `dialogue-style.md` | 语言强度 |
| 游戏输入输出字段 | `game-runtime.md` | 游戏运行协议 |
| 地点、人物触发 | `scene-triggers.md` | 场景加载路由 |
| 任务决策 | `quest-policy.md` | 任务策略 |
| 与孔子、老子比较 | `comparisons.md` | 哲学家比较 |
| 现代问题 | `modern-boundaries.md` | 现代转译边界 |

## 证据等级

- **A**：传世文本或《墨子》原文可核对。
- **B**：古代传记传统或较稳定的古典研究共识。
- **C**：现代研究合理重构。
- **D**：由思想气质和时代生活推断的角色化动作。
- **E**：纯游戏风味。
