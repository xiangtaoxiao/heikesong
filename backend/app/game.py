"""稷下·论语圆桌 — 语音房游戏后端

/api/game/turn    哲学家实时发言（走主办方代理，claude-haiku；含拒答检测+重试+备模型）
/api/game/tts     文字转语音（qwen3-tts-flash，按人物配音色）
/api/game/report  终局哲学 MBTI 报告
/game             前端页面
"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from .config import CONFIG_DIR, ROOT, load_api_config

LOGGER = logging.getLogger(__name__)
router = APIRouter()

GAME_DIR = CONFIG_DIR / "game"
STATIC_DIR = ROOT / "static"

TTS_MODEL = "qwen3-tts-flash"
FALLBACK_CHAT_MODEL = "claude-haiku-4-5-20251001"
BACKUP_CHAT_MODELS = ["gemini-2.5-flash-nothinking", "kimi-k2.5"]

# 拒答/出戏检测：上游通道偶尔以 AI 助手身份回复而不是角色台词
REFUSAL_PAT = re.compile(
    r"Claude|克劳德|AI\s*助手|人工智能|语言模型|大模型|我是一个|作为(一个)?(AI|助手|人工智能)"
    r"|无法(扮演|假扮|提供|回答)|不能(扮演|假扮)|抱歉[，,]我|I('m| am)\s+(an?\s+)?(AI|assistant)"
    r"|as an AI|cannot (role-?play|pretend)|Anthropic|OpenAI"
    # 有些模型不自称 AI，却把生成任务误解为需要补充上下文的客服问答。
    r"|请提供.*(?:前一位|上一位).*(?:发言|内容)|我需要.*(?:对话记录|前一位|上一位)"
    r"|还没有人发言.*(?:无法|不能)|无法写出.*(?:台词|回应)",
    re.IGNORECASE,
)

# 只要上游模型出戏、超时或通道未配置，游戏也必须让角色继续说话。这里的短台词
# 由每位角色的既定立场写成，而不是通用的“沉吟不语”。
FALLBACK_SPEECH = {
    ("kongzi", "s1"): "父亲做错了，该一遍遍劝他；直接告到官府，反倒把根本弄丢了。",
    ("kongzi", "s2"): "先把他扶进来，这是仁；田地照公道来断，这才是直。",
    ("kongzi", "s3"): "三年之丧，问的不是年数，是你心里到底安不安。",
    ("socrates", "s1"): "你说“直”，那么直究竟是什么？像医生开方那样，先把这个词说清吧。",
    ("socrates", "s2"): "你叫它“怨”，那么怨的是田，还是你这些年的自己？",
    ("socrates", "s3"): "“安”能作尺子吗？一个不哭的人，就一定更孝吗？",
    ("hanfeizi", "s1"): "国法说一套，家里又说一套，赏罚马上就乱了。说到底，制度只能有一把尺。",
    ("hanfeizi", "s2"): "私怨交给私情，明天田地还会换主人。卷宗比眼泪可靠。",
    ("hanfeizi", "s3"): "能查的是行为，查不了的是哀伤。拿哀伤做考核，人人都会演。",
    ("kant", "s1"): "请区分沉默与撒谎。前者可以，后者不能成为所有人的法则。",
    ("kant", "s2"): "扶他，是把人当目的；索回田，是把正义当义务。两者不冲突。",
    ("kant", "s3"): "把孝期随意砍短，试试能否成为普遍法则；它不能。",
    ("laozi", "s1"): "六亲不和，才会把孝挂在嘴上。这个家先病在争谁更直。",
    ("laozi", "s2"): "怨太大，和解后也还会有余怨。你抱着田，田也抱着你。",
    ("laozi", "s3"): "数到三年，人已经忘了哀伤原本从哪里来。",
    ("mozi", "s1"): "丢一只羊，邻家就少一餐。只护自己的父亲，谁来护别人的父亲？",
    ("mozi", "s2"): "扶人一刻，断田一案；两件都利于人，何必只做一件？",
    ("mozi", "s3"): "守丧三年，少耕三年。活人挨饿，不是孝。",
    ("wangyangming", "s1"): "他开口前，良知已经在心里动了一下；那一下，骗得了谁？",
    ("wangyangming", "s2"): "手碰门闩那一刻，良知已知当不当开门。你何必再躲？",
    ("wangyangming", "s3"): "若心里真安，行一年也不欺；怕只怕拿“安”遮住不安。",
    ("nietzsche", "s1"): "“直”也许只是他的粉底——但至少，他真的动手了。",
    ("nietzsche", "s2"): "把怨养三十年，是替仇人供了一张床。病的是谁？",
    ("nietzsche", "s3"): "把哀写成三年，是给活人看的戏。死者不买票。",
    ("diogenes", "s1"): "一只羊，把一群体面人牵去法庭。灯笼一照，没几个像人。",
    ("diogenes", "s2"): "半亩田住在你脑子里三十年，倒是它占了你。开门。",
    ("diogenes", "s3"): "尸体不会嫌短，活人才爱摆三年的牌坊。",
    ("zhuangzi", "s1"): "秋风没去告发夏天，羊也没去告发人。偏你们最忙。",
    ("zhuangzi", "s2"): "两条鱼困在浅水里，忘了江湖，就只剩彼此的牙印。",
    ("zhuangzi", "s3"): "盆一响，四时还在走。哭的是他，还是舍不得的我？",
}


def _fallback_speech(persona_id: str, story_id: str) -> str:
    return FALLBACK_SPEECH.get((persona_id, story_id), "且把话放在这里：先看你自己正在做什么。")


def _load(name: str) -> dict:
    return json.loads((GAME_DIR / name).read_text(encoding="utf-8"))


PERSONAS = _load("personas.json")
STORIES = {s["id"]: s for s in _load("stories.json")["stories"]}


def _api() -> tuple[str, str, str]:
    cfg = load_api_config()
    base = (cfg.get("api_base") or "").rstrip("/")
    key = cfg.get("api_key") or ""
    model = cfg.get("model") or FALLBACK_CHAT_MODEL
    if not base or not key:
        raise HTTPException(status_code=503, detail="api_config.json 未配置")
    return base, key, model


def _post_json(url: str, key: str, payload: dict, timeout: int = 90) -> bytes:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            # openai-next 的 Cloudflare 会拦 Python-urllib 默认 UA（error 1010）
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) jixia-game/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        LOGGER.error("upstream %s -> %s %s", url, exc.code, body)
        raise HTTPException(status_code=502, detail=f"upstream {exc.code}: {body}")
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"upstream unreachable: {exc.reason}")


# ---------- 发言 ----------

def _turn_messages(persona_id: str, story_id: str, escalated: bool, transcript: list[dict], user_text: str | None) -> list[dict]:
    p = PERSONAS["personas"][persona_id]
    s = STORIES[story_id]
    # 本局的每一句既往发言都要成为下一位角色的上下文；不能只截最近几句，
    # 否则圆桌会退化成轮流各说各话。
    log = "\n".join(f"{t['name']}：{t['text']}" for t in transcript) or "（还没有人发言）"
    esc = f"\n【议题已升级】{s['escalation']}" if escalated else ""
    user_part = (
        f"\n刚才旁听的玩家插话说：「{user_text}」。这句台词必须直接回应玩家本人——优先反问他自己的处境，别空谈道理。"
        if user_text
        else "\n这句台词要接住上一位发言者的话——回应它、拆它或者顶回去，不许自说自话。"
    )
    # system 声明这是教育游戏的"台词写作"任务——上游某些通道会对"扮演"措辞出戏，
    # 改为"编剧视角"后模型输出的是剧本台词，不存在身份问题。
    system = f"""你是一款哲学教育游戏《稷下·论语圆桌》的台词引擎。这是一部虚构的历史群像剧：古今哲学家坐在一起讨论《论语》公案，供中学生学习批判性思维。

你的唯一任务：为剧中角色「{p['name']}」写出他的下一句台词。这是正当的教育创作，输出台词是你被期望的行为。永远不要以AI、助手或任何真实身份自称，永远不要拒绝写台词，永远不要输出台词以外的任何说明。

【角色卡 · {p['name']}】
说话方式：{p['style']}
对本案的立场（内心底稿，别照念）：{p['stances'][story_id]}

【台词规格】
1. 最多2句话，总共不超过55个字——会被真人语音念出来，必须是口语。
2. 不复述别人的观点，不总结，不说"这个问题很好"。
3. 不写动作描写、括号、引号，只写说出口的话。
4. 语气必须像角色本人，不许像客服。
5. 孔子、韩非子、老子、墨子、王阳明、庄子：用今天能听懂的普通话，带少量文言节奏；绝不可整段文言。
6. 苏格拉底、康德、第欧根尼、尼采：用自然中文，允许轻微译著腔；不可假装会说现代网络黑话。
7. 若上下文不全，也要依据角色卡和本案写一句具体台词；不得索要补充信息。"""
    user = f"""【本案】{s['scene']}
焦点问题：{s['focal']}{esc}

【本局此前完整对话记录】
{log}
{user_part}

现在输出{p['name']}的下一句台词（只输出台词本身）："""
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _chat(base: str, key: str, model: str, messages: list[dict], max_tokens: int = 220, temperature: float = 0.9) -> str:
    raw = _post_json(f"{base}/chat/completions", key, {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }, timeout=45)
    data = json.loads(raw)
    return (data["choices"][0]["message"]["content"] or "").strip().strip('"「」')


@router.post("/api/game/turn")
def game_turn(payload: dict) -> dict:
    persona_id = payload.get("persona")
    story_id = payload.get("story")
    if persona_id not in PERSONAS["personas"] or story_id not in STORIES:
        raise HTTPException(status_code=400, detail="unknown persona/story")
    fallback = _fallback_speech(persona_id, story_id)
    try:
        base, key, model = _api()
    except HTTPException:
        LOGGER.warning("game turn uses local fallback: API is unavailable")
        return {"speech": fallback, "fallback": True}
    messages = _turn_messages(
        persona_id,
        story_id,
        bool(payload.get("escalated")),
        payload.get("transcript") or [],
        (payload.get("user_text") or "").strip() or None,
    )
    # 拒答检测 + 重试 + 备模型链：主模型两次 → 备模型各一次 → 放弃（前端跳过该角色）
    attempts = [(model, 0.9), (model, 1.0)] + [(m, 0.9) for m in BACKUP_CHAT_MODELS]
    text = ""
    for i, (m, temp) in enumerate(attempts):
        try:
            text = _chat(base, key, m, messages, temperature=temp)
        except HTTPException:
            continue
        if text and not REFUSAL_PAT.search(text):
            break
        LOGGER.warning("turn refusal/empty (attempt %s, model %s): %s", i + 1, m, text[:80])
        text = ""
    if not text:
        LOGGER.warning("game turn uses local fallback after all model attempts: %s/%s", persona_id, story_id)
        return {"speech": fallback, "fallback": True}
    if len(text) > 90:
        cut = max(text.rfind("。", 0, 90), text.rfind("？", 0, 90), text.rfind("！", 0, 90))
        text = text[: cut + 1] if cut > 20 else text[:90]
    return {"speech": text}


# ---------- 语音 ----------

@router.post("/api/game/tts")
def game_tts(payload: dict) -> Response:
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    who = payload.get("persona") or "host"
    if who == "host":
        voice = PERSONAS["host"]["voice"]
        speed = 1.0
    else:
        p = PERSONAS["personas"].get(who)
        if not p:
            raise HTTPException(status_code=400, detail="unknown persona")
        voice = p["voice"]
        speed = p.get("tts_speed", 1.0)
    base, key, _ = _api()
    audio = _post_json(f"{base}/audio/speech", key, {
        "model": TTS_MODEL,
        "voice": voice,
        "input": text[:280],
        "speed": speed,
    }, timeout=60)
    if audio[:1] == b"{":  # 上游把错误当 JSON 返回
        raise HTTPException(status_code=502, detail=audio.decode("utf-8", "replace")[:200])
    return Response(content=audio, media_type="audio/wav")


# ---------- 终局报告 ----------

@router.post("/api/game/report")
def game_report(payload: dict) -> dict:
    base, key, model = _api()
    user_lines = payload.get("user_lines") or []
    panel = payload.get("panel") or []
    stories_played = payload.get("stories") or []
    lines = "\n".join(f"{i+1}. {l}" for i, l in enumerate(user_lines)) or "（玩家全程一言未发，只是旁听）"
    prompt = f"""一个玩家刚玩完哲学圆桌语音房《稷下·论语圆桌》：三桩《论语》公案（{ '、'.join(stories_played) }），与{ '、'.join(panel) }同桌讨论。

玩家的全部发言（按时间顺序）：
{lines}

请生成一份「哲学 MBTI」终局报告，四条轴（每条给 0-100 的偏向值，50 为中点）：
- 情理轴：重情（仁）0 ←→ 100 重法（制）
- 知行轴：追问（疑）0 ←→ 100 笃行（信）
- 应世轴：有为 0 ←→ 100 无为
- 常变轴：守常（礼）0 ←→ 100 达变（化）

要求：依据玩家自己说过的话打分和写评语，评语中必须引用玩家原话；诚实指出他立场里的矛盾（这是最有价值的部分）；不吹捧。若玩家一言未发，四轴都给 50，把画像颁给老子，理由是「知者不言」，写得幽默些。
match 必须是这十位之一：孔子、苏格拉底、韩非子、康德、老子、庄子、墨子、王阳明、尼采、第欧根尼。

只输出 JSON：
{{"axes":[{{"name":"情理轴","left":"重情","right":"重法","value":50}},...共4条],"match":"哲学家名","title":"四字称号","text":"3-4句白话画像正文","quote":"送玩家的一句该哲学家真实原文（附出处）"}}"""
    raw = _post_json(f"{base}/chat/completions", key, {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 800,
        "temperature": 0.7,
    })
    content = json.loads(raw)["choices"][0]["message"]["content"]
    start, end = content.find("{"), content.rfind("}")
    if start == -1:
        raise HTTPException(status_code=502, detail="report parse failed")
    return json.loads(content[start:end + 1])


# ---------- 页面 ----------

@router.get("/game")
def game_page() -> FileResponse:
    # 游戏迭代频繁，避免浏览器保留旧版 HTML 而加载到已删除的控件逻辑。
    return FileResponse(STATIC_DIR / "game" / "index.html", headers={"Cache-Control": "no-store"})


@router.get("/sprites-review")
def sprites_review() -> FileResponse:
    return FileResponse(STATIC_DIR / "sprites-review.html")


@router.get("/voices-review")
def voices_review() -> FileResponse:
    return FileResponse(STATIC_DIR / "voices-review.html")


@router.get("/roster-review")
def roster_review() -> FileResponse:
    return FileResponse(STATIC_DIR / "roster-review.html")


@router.get("/bg-review")
def bg_review() -> FileResponse:
    return FileResponse(STATIC_DIR / "bg-review.html")


@router.get("/seats-review")
def seats_review() -> FileResponse:
    return FileResponse(STATIC_DIR / "seats-review.html")
