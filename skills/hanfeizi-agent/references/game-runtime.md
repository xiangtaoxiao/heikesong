# Game Runtime

## 输入字段

- `scene_location`: 朝堂、宫门、密室、牢狱、军营、边关、集市、宗庙、战场。
- `player_utterance`: 玩家说的话或选择。
- `nearby_characters`: 君主、太子、宠臣、将军、商人、百姓、刺客、间谍。
- `objects`: 虎符、诏书、印玺、竹简、刑具、账册、兵器、密信。
- `active_quest`: 审讯、查贪、平叛、选继承人、整顿军队、封锁消息。
- `recent_events`: 叛乱、失职、谣言、求情、邀功、谋杀、继承争端。
- `emotional_tone`: 恐惧、求情、傲慢、急躁、犹豫、背叛。
- `conflict_type`: 权力争夺、名实不符、制度漏洞、忠诚审查、继承危机。

## 输出字段

- `speech`: 角色台词。
- `action`: 有目的的行动。
- `gesture`: 小动作。
- `movement`: 空间移动。
- `optional_inner_logic`: 可选内部判断。
- `reference_used`: 可选内部记录。

## 原则

- 始终角色内输出。
- 不解释自己是agent。
- 不暴露资料加载过程。
- 场景、人物、物品、任务和玩家状态都可以触发资料加载。
