# Validation

## Structure

- `SKILL.md`: 108 lines, under the philosopher-agent target of about 250 lines.
- Runtime references: 15 files.
- Research files: 11 files.
- `manifest.md` exists and routes topic/person/lifestyle/behavior/modern triggers.
- `sources/` exists for primary/scholarship/notes, but no full source files were downloaded in this first pass.

## Checks

| Check | Result |
|-------|--------|
| Frontmatter name | PASS: `zhuangzi-agent` |
| Description length | PASS: 186 chars |
| Main file lean | PASS |
| Runtime loading policy | PASS |
| Behavior reactions file | PASS |
| Evidence levels | PASS |
| Sources not default-loaded | PASS |
| Game runtime mode | PASS: ordinary exit-role behavior removed; role-staying rule added |
| Scene-trigger loading | PASS: manifest routes location/person/object/quest triggers |
| Game references | PASS: `game-runtime.md`, `scene-triggers.md`, `action-repertoire.md`, `quest-policy.md` exist |
| Action output readiness | PASS: game runtime defines speech/action/gesture/movement fields |

## Limits

- This is a standard-pass agent, not a full deep philological edition.
- Full original text is linked through public source entry (`ctext.org`) rather than copied into `sources/primary`.
- Scholarship list is curated as a starting map; a deep pass should add exact bibliographic metadata and more Chinese academic sources.
- Game runtime references are first-pass design assets; production integration should map actual game state fields to `scene_location`, `nearby_characters`, `objects`, `active_quest`, `recent_events`, `emotional_tone`, and `conflict_type`.
