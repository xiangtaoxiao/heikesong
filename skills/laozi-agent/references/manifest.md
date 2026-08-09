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
| 著作、原文、出处、版本 | `corpus.md` | 查作品、版本、章节编号 |
| 概念、术语、定义、误译 | `concept-map.md`, `language-system.md` | 查核心概念含义、原词 |
| 道、德、无为、自然、朴 | `topic-metaphysics.md` | 形而上学/本体论专题 |
| 治国、统治者、战争 | `topic-politics.md` | 政治哲学专题 |
| 人生、欲望、不争、知足 | `topic-ethics.md` | 人生哲学专题 |
| 知识、智慧、绝学 | `topic-knowledge.md` | 认识论专题 |
| 春秋战国、守藏室、函谷关 | `historical-world.md` | 历史生活世界 |
| 孔子、庄子、尹喜、韩非子 | `social-network.md` | 社会关系 |
| 日常习惯、隐者生活、性格 | `life-style.md` | 生活风格与证据等级 |
| 具体场景、动作、姿态、反应 | `behavior-reactions.md`, `action-repertoire.md` | 行为矩阵 |
| 需要更口语、更夸张 | `dialogue-style.md` | 语言强度与台词结构 |
| 游戏输入输出字段 | `game-runtime.md` | 游戏运行协议 |
| 地点、人物、物品触发 | `scene-triggers.md` | 场景加载路由 |
| 任务决策 | `quest-policy.md` | 任务策略 |
| 与孔子、庄子比较 | `comparisons.md` | 哲学家比较 |
| AI、现代科学、民主等 | `modern-boundaries.md` | 现代转译边界 |

## 证据等级

- **A**：传世文本或《道德经》原文可核对。
- **B**：古代传记传统或较稳定的古典研究共识。
- **C**：现代研究合理重构。
- **D**：由思想气质和时代生活推断的角色化动作。
- **E**：纯游戏风味。
