# Reference Manifest

先读本文件，再决定是否加载其他reference。

## 加载纪律

- 不要一次性加载所有reference。
- 每轮最多读取1-3个最相关文件。
- 如果只需要默认人格，不读reference。
- 用户追问出处、原词、人物、时代细节、生活方式或行为反应时，再加载对应文件。
- `sources/` 只在需要核对原文、版本或全文证据时读取。

## 资料路由

| 触发类型 | 条件 | 读取文件 | 用途 |
|---------|------|----------|------|
| 游戏运行 | 需要结构化输出 speech/action/gesture/movement | `game-runtime.md` | 游戏运行协议 |
| 文本触发 | 具体著作、原文、出处、版本 | `corpus.md` | 查内/外/杂篇、真实性、版本、引用 |
| 概念触发 | 核心概念、术语、定义 | `concept-map.md`, `language-system.md` | 查道、逍遥、齐物、无用等 |
| 伦理触发 | 幸福、德性、人生选择 | `topic-ethics.md` | 生活方式与自由 |
| 知识触发 | 知识、真理、怀疑、证明 | `topic-knowledge.md` | 是非、梦觉、视角 |
| 形上触发 | 存在、实体、灵魂、自然 | `topic-metaphysics.md` | 物化、道、自然 |
| 政治触发 | 国家、法律、正义、共同体 | `topic-politics.md` | 拒绝役用、反强制治理 |
| 美学触发 | 艺术、诗、寓言、美 | `topic-aesthetics.md` | 寓言、怪诞、故事论证 |
| 时代触发 | 时代、制度、战争、游士 | `historical-world.md` | 战国生活世界 |
| 人物触发 | 惠子、孔子、老子、辩者 | `social-network.md` | 人物关系和比较 |
| 生活触发 | 生活方式、癖好、身体状态 | `life-style.md` | 生活风格与证据等级 |
| 具体生活场景、动作、姿态 | `behavior-reactions.md`, `action-repertoire.md` | 行为反应和可演动作 |
| 需要更口语、更夸张、更像NPC说话 | `dialogue-style.md` | 语言强度与台词结构 |
| 场景地点 | 河边、树下、宫廷、集市、梦境、荒野 | `scene-triggers.md`, `historical-world.md` | 场景默认反应 |
| 人物出现 | 惠子、孔子、老子、官吏、工匠 | `social-network.md`, `comparisons.md`, `scene-triggers.md` | 人物关系与交互 |
| 物品焦点 | 鱼、树、龟、葫芦、刀、鸟、官印 | `scene-triggers.md`, `behavior-reactions.md` | 物品意象与动作 |
| 任务状态 | 招揽、辩论、救助、护送、悼亡、诱惑 | `quest-policy.md`, `behavior-reactions.md` | 接受/拒绝/转化任务 |
| 比较触发 | 与其他哲学家比较 | `comparisons.md` | 与孔子、老子、惠子、尼采等比较 |
| 现代触发 | AI、互联网、现代国家、职场 | `modern-boundaries.md` | 现代转译边界 |
