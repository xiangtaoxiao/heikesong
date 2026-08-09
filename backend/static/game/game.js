// ═══ 稷下·论语圆桌 — 语音房游戏引擎 ═══
// 机制要点：
//  · 轮流发言一圈 → 主持人 cue 玩家(限时窗) → 议题升级 → 再一圈
//  · 玩家随时插话：句间自动排队插入；句中可按「打断」立即插入
//  · 点击哲学家 = 点名（下一句由他答你）
//  · 语音房/文字 模式随时切换；语音=qwen3-tts 按人配音色
//  · 预取下一句（文本+语音），发言间隙≈0

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CAST = {
  kongzi:       { name: '孔子',     tag: '义与关系',   color: '#2e5f5c' },
  socrates:     { name: '苏格拉底', tag: '追问概念',   color: '#b08c3d' },
  hanfeizi:     { name: '韩非子',   tag: '法与权术',   color: '#a83226' },
  kant:         { name: '康德',     tag: '原则与义务', color: '#31548c' },
  laozi:        { name: '老子',     tag: '不辩者',     color: '#7a8b6f' },
  zhuangzi:     { name: '庄子',     tag: '鼓盆的人',   color: '#8a5a33' },
  mozi:         { name: '墨子',     tag: '天下的会计', color: '#6f5233' },
  wangyangming: { name: '王阳明',   tag: '致良知',     color: '#446a8c' },
  nietzsche:    { name: '尼采',     tag: '持锤者',     color: '#5c4a6e' },
  diogenes:     { name: '第欧根尼', tag: '陶罐里的狗', color: '#7d7a6a' },
  player:       { name: '你',       tag: '参与者',     color: '#33566b', npc: false },
};
// 雪碧图：15帧 5×3，乒乓循环；每人 a/b 两版——发言时随机挑一版，表现力更足
const FRAMES = 15;
const SPRITE = (id, ver) => `/static/assets/sprites/${id}-${ver || 'a'}.png`;
const randVer = () => (Math.random() < 0.5 ? 'a' : 'b');
function setSpriteVer(id, ver) {
  const c = S.chars[id];
  if (c) c.el.querySelector('.sprite').style.backgroundImage = `url('${SPRITE(id, ver)}')`;
}

// ═══ 座位锚点系统：每张背景一份手工标定的座位表 ═══
// anchors: 锚点名 → [x%, bottom%, scale]，全部标在图中真正可坐的位置
// subsets: 哲学家人数 → 用哪些锚点（间距最大的组合）；player 固定旁听席
const SEATS = {
  c5: {
    img: '/static/assets/bg/candidate-5.png',
    anchors: {
      A: [33, 43, 0.62], B: [74, 44, 0.64],          // 后排·台深处（左/右，与前排错列）
      E: [78, 29, 0.82],                              // 中排·右
      F: [44, 24, 0.92], G: [60, 17, 1.00],          // 前排·台缘
      P: [26, 14, 0.84],                              // 玩家旁听席·前庭左（比 NPC 收一档）
    },
    subsets: { 1: ['F'], 2: ['F', 'E'], 3: ['A', 'E', 'F'], 4: ['A', 'B', 'F', 'G'] },
    player: 'P',
  },
  c6: {
    img: '/static/assets/bg/candidate-6.png',
    // 弧形座次：所有座位围着玩家席呈松弧排布，邻座间距均匀——合理且不散
    anchors: {
      BL: [38, 42, 0.62], BC: [51, 41, 0.64], BR: [63, 42, 0.63], // 后排弧
      ML: [25, 27, 0.82], MR: [76, 27, 0.84],                     // 中排两翼
      CL: [36, 29, 0.78], CR: [65, 30, 0.80],                     // 近中一对
      P:  [50, 9, 0.86],                                           // 玩家·前庭正中（不压过圆桌人物）
    },
    subsets: { 1: ['CR'], 2: ['CL', 'CR'], 3: ['CL', 'CR', 'BC'], 4: ['ML', 'MR', 'BL', 'BR'] },
    player: 'P',
  },
};
let ACTIVE_BG = null;   // null = 旧版自由布局；设为 'c5'/'c6' 启用锚点

function applyBg(name) {
  if (!SEATS[name]) return;
  ACTIVE_BG = name;
  const el = document.querySelector('.stage-bg');
  // 100%/100% 拉伸铺满：锚点百分比与图上位置永远一一对应（cover 裁切会漂）
  el.style.background = `url('${SEATS[name].img}') center / 100% 100% no-repeat`;
}

const STORIES = [
  { id: 's1', title: '一只羊',     source: '《论语·子路》13.18', focal: '这个儿子做对了吗？' },
  { id: 's2', title: '门口的仇人', source: '《论语·宪问》14.34', focal: '该怎么对待伤害过你的人？' },
  { id: 's3', title: '三年之丧',   source: '《论语·阳货》17.21', focal: '宰予错了吗？' },
];
let STORY_META = {};   // 从后端 config 静态文件补全 host 台词/原文（见 boot）

// ─── 全局状态 ───
const S = {
  panel: [],            // 入席哲学家 id[]
  storyIdx: 0,
  escalated: false,
  transcript: [],       // {who:'host'|'user'|id, name, text}
  userLines: [],
  pendingUser: null,    // {text, target}
  cueTarget: null,
  interruptFlag: false,
  voiceMode: true,
  audioMuted: false,
  running: false,
  aborted: false,
  audio: null,
  animTimer: null,
  prefetch: {},         // key → Promise<{text, wav}>
  chars: {},            // id → {el, x, bottom, scale}
};

// ═══ 启动 ═══
async function boot() {
  try {
    const r = await fetch('/static/assets/game-meta.json');
    STORY_META = await r.json();
  } catch { STORY_META = null; }
  $('#health-note').textContent = STORY_META ? '● 语音房已就绪（Haiku × Qwen-TTS）' : '◌ 剧场配置缺失';

  $('#btn-to-select').onclick = () => { renderPick(); show('#screen-select'); };
  $('#btn-start-game').onclick = startGame;
  $('#btn-send').onclick = submitUser;
  $('#user-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitUser(); });
  $('#btn-interrupt').onclick = doInterrupt;
  $('#btn-log').onclick = () => $('#drawer').classList.add('open');
  $('#btn-drawer-close').onclick = () => $('#drawer').classList.remove('open');
  $('#btn-leave').onclick = endMeeting;
  $('#btn-original').onclick = () => $('#modal-original').classList.add('open');
  $('#btn-orig-close').onclick = () => $('#modal-original').classList.remove('open');
  $('#btn-mute').onclick = toggleMute;
  $('#btn-skip-cue').onclick = () => { S.cueSkip = true; };
  setupMic();
  window.addEventListener('resize', () => layoutChars(true));

  // 开发直达：#select / #table=kongzi,socrates,hanfeizi,kant（只摆台不跑流程）
  const h = location.hash;
  if (h === '#select') { renderPick(); show('#screen-select'); }
  else if (h.startsWith('#table=')) {
    const bgm = h.match(/bg=(c\d)/);
    if (bgm) applyBg(bgm[1]);
    S.panel = h.slice(7).split('&')[0].split(',').filter((x) => CAST[x] && x !== 'player');
    show('#screen-table');
    mountChars();
    const st = STORIES[0];
    const meta = STORY_META.stories[0];
    setTheater(st, meta);
    focusChar(S.panel[1] || S.panel[0], true);
    startAnim(S.panel[1] || S.panel[0]);
    showBubble(S.panel[1] || S.panel[0], '你说的直，究竟是什么？');
  }
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ═══ 选人 ═══
function renderPick() {
  const grid = $('#pick-grid');
  grid.innerHTML = '';
  const picked = new Set(['kongzi']);
  Object.entries(CAST).filter(([id]) => id !== 'player').forEach(([id, c]) => {
    const d = document.createElement('div');
    d.className = 'pick-card' + (id === 'kongzi' ? ' locked' : '');
    d.innerHTML = `<div class="pick-mark">✓</div>
      <div class="pick-sprite" style="background-image:url('${SPRITE(id)}')"></div>
      <div class="pk-name" style="color:${c.color}">${c.name}</div>
      <div class="pk-tag">${c.tag}</div>`;
    // 悬停时播放雪碧图动画
    let t = null, f = 0;
    const sp = d.querySelector('.pick-sprite');
    d.onmouseenter = () => { t = setInterval(() => { setFrame(sp, pingpong(++f)); }, 130); };
    d.onmouseleave = () => { clearInterval(t); f = 0; setFrame(sp, 0); };
    d.onclick = () => {
      if (id === 'kongzi') return;              // 孔子锁定主位
      if (picked.has(id)) picked.delete(id);
      else if (picked.size < 4) picked.add(id);
      d.classList.toggle('picked', picked.has(id));
      $('#btn-start-game').disabled = picked.size < 2;
      $('#btn-start-game').textContent = `开始圆桌（${picked.size}人）`;
    };
    grid.appendChild(d);
  });
  $('#btn-start-game').disabled = false;
  $('#btn-start-game').textContent = '开始圆桌（1人？至少再请一位）';
  $('#btn-start-game').disabled = true;
  grid._picked = picked;
}

function setFrame(el, f) {
  el.style.backgroundPosition = `${(f % 5) * 25}% ${Math.floor(f / 5) * 50}%`;
}

// 乒乓序列：0→14→0 来回播，首尾永不跳帧
function pingpong(t) {
  const cycle = (FRAMES - 1) * 2;              // 28
  const p = t % cycle;
  return p < FRAMES ? p : cycle - p;
}

// ═══ 布局算法：错落有致、不重叠、非卡片 ═══
// 思路：N 人 → 均分横向槽位（保证最小间距）→ 前/后两个景深带交错分配
//       （后带更高更小、前带更低更大）→ 每人加受限随机抖动 → 每局随机站位顺序
function layoutChars(keepOrder = false) {
  const stage = $('#stage');
  if (!stage || !S.panel.length) return;

  // ── 锚点模式：从座位表按人数取组合，随机分座；玩家固定旁听席 ──
  if (ACTIVE_BG) {
    const cfg = SEATS[ACTIVE_BG];
    if (!keepOrder || !S.seatAssign) {
      S.order = [...S.panel].sort(() => Math.random() - 0.5);
      const sub = [...(cfg.subsets[S.panel.length] || Object.keys(cfg.anchors))].sort(() => Math.random() - 0.5);
      S.seatAssign = { player: cfg.player };
      S.order.forEach((id, i) => { S.seatAssign[id] = sub[i]; });
      S.layoutOrder = [...S.order, 'player'];
    }
    Object.entries(S.seatAssign).forEach(([id, key]) => {
      const c = S.chars[id];
      const a = cfg.anchors[key];
      if (!c || !a) return;
      const [x, b, s] = a;
      c.x = x; c.bottom = b; c.scale = s;
      c.el.style.left = x + '%';
      c.el.style.bottom = b + '%';
      c.el.style.zIndex = Math.round(s * 10);           // 近大远小决定遮挡
      const sp = c.el.querySelector('.sprite');
      sp.style.transform = `scale(${s})`;
      sp.style.transformOrigin = 'bottom center';
    });
    return;
  }

  const W = stage.clientWidth;
  const n = S.panel.length + 1;                              // +1 = 玩家也在台上
  if (!keepOrder) {
    S.order = [...S.panel].sort(() => Math.random() - 0.5);  // 发言圈只含哲学家
    S.layoutOrder = [...S.order, 'player'].sort(() => Math.random() - 0.5);
  }
  const bands = [
    { bottom: 30, scale: 0.78 },   // 后带
    { bottom: 9,  scale: 1.0  },   // 前带
  ];
  const startBand = S.bandSeed ?? (S.bandSeed = Math.round(Math.random()));
  const left = 14, right = 80;                      // 横向可用区间（%），右侧留出亭子
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  S.layoutOrder.forEach((id, i) => {
    const band = bands[(i + startBand) % 2];
    const jx = S.chars[id]?.jx ?? (Math.random() - 0.5) * Math.min(step * 0.35, 7);
    const jy = S.chars[id]?.jy ?? (Math.random() - 0.5) * 5;
    const x = n === 1 ? 50 : left + step * i + jx;
    const c = S.chars[id];
    if (!c) return;
    c.jx = jx; c.jy = jy;
    c.x = Math.max(10, Math.min(84, x));
    c.bottom = band.bottom + jy;
    c.scale = id === 'player' ? band.scale * 0.86 : band.scale;
    c.el.style.left = c.x + '%';
    c.el.style.bottom = c.bottom + '%';
    c.el.style.zIndex = band.scale === 1 ? 6 : 3;
    c.el.querySelector('.sprite').style.transform = `scale(${c.scale})`;
    c.el.querySelector('.sprite').style.transformOrigin = 'bottom center';
  });
}

function mountChars() {
  const wrap = $('#chars');
  wrap.innerHTML = '';
  S.chars = {};
  [...S.panel, 'player'].forEach((id) => {
    const c = CAST[id];
    const el = document.createElement('div');
    el.className = 'char';
    el.innerHTML = `
      <div class="ground"></div>
      <div class="sprite" style="background-image:url('${SPRITE(id)}')"></div>
      <div class="tag"><span class="mic-ico">🎙</span><b style="color:${c.color}">${c.name}</b><i>${c.tag}</i></div>`;
    if (id !== 'player') el.onclick = () => cuePhilosopher(id);
    wrap.appendChild(el);
    S.chars[id] = { el };
    ['a', 'b', 'ia', 'ib'].forEach((v) => { new Image().src = SPRITE(id, v); });  // 预载不闪
    startIdle(id);
  });
  S.bandSeed = null;
  layoutChars();
}

function cuePhilosopher(id) {
  S.cueTarget = S.cueTarget === id ? null : id;
  Object.entries(S.chars).forEach(([pid, c]) => c.el.classList.toggle('cued', pid === S.cueTarget));
  $('#user-input').placeholder = S.cueTarget
    ? `对${CAST[S.cueTarget].name}说…（再点一次取消点名）`
    : '随时插话；点击场上的哲学家可点名提问…';
  if (S.cueTarget) $('#user-input').focus();
}

// ═══ 游戏主流程 ═══
async function startGame() {
  if (!ACTIVE_BG) applyBg('c6');                 // 正式背景：溪窄版园林 + 弧形座次
  S.panel = [...$('#pick-grid')._picked];
  S.storyIdx = 0; S.transcript = []; S.userLines = [];
  S.aborted = false; S.running = true;
  show('#screen-table');
  mountChars();
  runGame().catch((e) => console.error(e));
}

async function runGame() {
  for (S.storyIdx = 0; S.storyIdx < STORIES.length && !S.aborted; S.storyIdx++) {
    const st = STORIES[S.storyIdx];
    const meta = STORY_META.stories.find((x) => x.id === st.id);
    S.escalated = false;
    setTheater(st, meta);
    if (canPlayAudio()) {                                // 预热主持人整案台词
      warmTTS('host', meta.host_intro);
      warmTTS('host', meta.host_user_cue);
      warmTTS('host', meta.host_escalation_line);
      warmTTS('host', meta.host_outro);
    }
    await hostSay(meta.host_intro);
    // 首位角色也必须听过主持人开场；从这里开始才预取，避免第一轮脱离上下文。
    S.prefetch[pfKey(S.order[0])] = fetchTurn(S.order[0], st, null);
    await circle(st, meta);                      // 第一圈
    if (S.aborted) break;
    await userWindow(meta.host_user_cue, st);    // cue 玩家
    if (S.aborted) break;
    S.escalated = true;                          // 议题升级
    slateUpgrade(meta);
    await hostSay(meta.host_escalation_line);
    S.prefetch[pfKey(S.order[0])] = fetchTurn(S.order[0], st, null);
    await circle(st, meta);                      // 第二圈
    if (S.aborted) break;
    await hostSay(meta.host_outro);
  }
  if (!S.aborted) showReport();
}

function setTheater(st, meta) {
  $('#tb-story').textContent = `第${'一二三'[S.storyIdx]}案《${st.title}》· ${st.source}`;
  $('#slate-tag').textContent = '当前议题';
  $('#slate-tag').classList.remove('upgraded');
  $('#slate-text').textContent = st.focal;
  $('#theater-img').src = meta.theater;
  $('#orig-source').textContent = st.source;
  $('#orig-text').textContent = meta.original;
  $('#orig-note').textContent = meta.original_note;
}

function slateUpgrade(meta) {
  const tag = $('#slate-tag');
  tag.textContent = '议题升级';
  tag.classList.add('upgraded');
  $('#slate-text').textContent = meta.escalation.replace(/^议题升级——/, '');
}

// 一圈轮流发言；圈中随时可被玩家插话打断
async function circle(st, meta) {
  for (let i = 0; i < S.order.length && !S.aborted; i++) {
    const id = S.order[i];
    // 圈位边界处理插话；若正好是本位答的玩家，就算他这一轮已发言
    const responded = await drainUser(st, i);
    if (S.aborted) return;
    if (responded === id) continue;
    const next = S.order[i + 1];
    await speak(id, st, { prefetchNext: next });   // 预取下一位
  }
  await drainUser(st, 0);
}

// 玩家插话排队处理：谁答？点名者 > @名字 > 圈内下一位。返回最后应答者 id
async function drainUser(st, circlePos) {
  let last = null;
  while (S.pendingUser && !S.aborted) {
    const u = S.pendingUser; S.pendingUser = null;
    pushLine('user', '你', u.text);
    S.userLines.push(u.text);
    invalidatePrefetch();
    const responder = u.target || S.order[circlePos % S.order.length];
    const turnP = fetchTurn(responder, st, u.text);      // 应答与玩家亮相并行生成
    // 玩家角色开口：执笔发言版动画（B）+ 聚焦 + 气泡
    if (S.chars.player) {
      S.playerBusy = true;
      focusChar('player', true);
      showBubble('player', u.text);
      setSpriteVer('player', 'b');
      startAnim('player');
      await sleep(Math.min(2600, readTime(u.text) * 0.5));
      stopAnim();
      focusChar('player', false);
      S.playerBusy = false;
    }
    await speak(responder, st, { userText: u.text, turnPromise: turnP });
    last = responder;
  }
  return last;
}

// ═══ 单次发言（文本→动画+气泡+语音）═══
async function speak(id, st, opts = {}) {
  const c = S.chars[id];
  if (!c) return;
  showThink(id, true);

  let turn;
  const key = pfKey(id);
  if (opts.turnPromise) turn = await opts.turnPromise;
  else if (!opts.userText && S.prefetch[key]) turn = await S.prefetch[key];
  else turn = await fetchTurn(id, st, opts.userText);
  delete S.prefetch[key];
  showThink(id, false);
  if (S.aborted || !turn || !turn.text) return;   // 空/被跳过：静默让位下一人

  // 预取下一位的台词+语音（无插话时才有效）
  if (opts.prefetchNext && !S.pendingUser) {
    const nid = opts.prefetchNext;
    S.prefetch[pfKey(nid)] = fetchTurn(nid, st, null, [...S.transcript, { name: CAST[id].name, text: turn.text }]);
  }

  pushLine(id, CAST[id].name, turn.text);
  focusChar(id, true);
  showBubble(id, turn.text);
  setSpriteVer(id, randVer());               // 每次发言随机 A/B 动作
  startAnim(id);
  $('#btn-interrupt').classList.add('on');
  S.interruptFlag = false;

  if (canPlayAudio()) {
    const wav = turn.wav || await fetchTTS(id, turn.text);
    if (wav && !S.interruptFlag && !S.aborted) await playAudio(wav);
    else if (!wav) await sleep(readTime(turn.text));
  } else {
    await typewriterWait(turn.text);
  }

  $('#btn-interrupt').classList.remove('on');
  stopAnim(id);
  if (S.interruptFlag) $('#bubble').classList.add('interrupted');
  else await sleep(300);
  hideBubble();
  focusChar(id, false);
}

function pfKey(id) { return `${id}|${S.storyIdx}|${S.escalated}|${S.pfGen || 0}`; }
function invalidatePrefetch() { S.prefetch = {}; S.pfGen = (S.pfGen || 0) + 1; }

// TTS 预热：开场/升级等固定台词提前合成，轮到时零等待
S.ttsCache = new Map();
function warmTTS(who, text) {
  const k = who + '|' + text;
  if (!S.ttsCache.has(k)) {
    const p = (who === 'host' ? fetchHostTTS(text) : fetchTTS(who, text)).catch(() => null);
    S.ttsCache.set(k, p);
  }
  return S.ttsCache.get(k);
}

async function fetchTurn(id, st, userText, transcriptOverride) {
  try {
    const r = await fetch('/api/game/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        persona: id, story: st.id, escalated: S.escalated,
        transcript: transcriptOverride || S.transcript,
        user_text: userText || null,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { speech, skipped } = await r.json();
    if (skipped || !speech) return { text: '' };        // 上游拒答多次：跳过该角色
    const out = { text: speech };
    if (canPlayAudio()) out.wavP = fetchTTS(id, speech); // 语音并行预取
    if (out.wavP) out.wav = await out.wavP.catch(() => null);
    return out;
  } catch (e) {
    console.error('turn failed', e);
    return { text: `（${CAST[id].name}沉吟不语）` };
  }
}

async function fetchTTS(id, text) {
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: id, text }),
    });
    if (!r.ok) return null;
    return await r.blob();
  } catch { return null; }
}

function playAudio(blob) {
  return new Promise((resolve) => {
    const a = new Audio(URL.createObjectURL(blob));
    S.audio = a;
    a.onended = a.onerror = () => { S.audio = null; resolve(); };
    a.play().catch(() => resolve());
  });
}

function canPlayAudio() { return S.voiceMode && !S.audioMuted; }
function toggleMute() {
  S.audioMuted = !S.audioMuted;
  if (S.audioMuted && S.audio) { try { S.audio.pause(); } catch {} S.audio = null; }
  const btn = $('#btn-mute');
  btn.querySelector('.audio-icon').textContent = S.audioMuted ? '🔇' : '🔊';
  btn.querySelector('.audio-label').textContent = S.audioMuted ? '声音已关闭' : '声音开启';
  btn.classList.toggle('muted', S.audioMuted);
  btn.setAttribute('aria-pressed', String(S.audioMuted));
}

function readTime(text) { return Math.max(2200, text.length * 145); }

async function typewriterWait(text) {
  // 文字模式：气泡逐字显示
  const el = $('#bubble-text');
  el.textContent = '';
  for (let i = 0; i <= text.length && !S.interruptFlag && !S.aborted; i++) {
    el.textContent = text.slice(0, i);
    await sleep(55);
  }
  el.textContent = text;
  if (!S.interruptFlag) await sleep(900);
}

// ═══ 主持人 ═══
async function hostSay(text) {
  if (S.aborted) return;
  pushLine('host', '主持人', text);
  const b = $('#host-banner');
  b.textContent = text;
  b.classList.add('on');
  if (canPlayAudio()) {
    const wav = await warmTTS('host', text);
    if (wav && !S.aborted) await playAudio(wav);
    else await sleep(readTime(text) * 0.8);
  } else {
    await sleep(readTime(text) * 0.8);
  }
  b.classList.remove('on');
}

async function fetchHostTTS(text) {
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'host', text }),
    });
    return r.ok ? await r.blob() : null;
  } catch { return null; }
}

// cue 玩家：倒计时窗口
async function userWindow(cueText, st) {
  await hostSay(cueText);
  const cueEl = $('#user-cue');
  cueEl.classList.add('on');
  S.cueSkip = false;
  $('#user-input').focus();
  for (let t = 12; t > 0; t--) {
    $('#cue-count').textContent = t;
    if (S.pendingUser || S.cueSkip || S.aborted) break;
    await sleep(1000);
  }
  cueEl.classList.remove('on');
  await drainUser(st, 0);
}

// ═══ 插话 / 打断 ═══
function submitUser() {
  const inp = $('#user-input');
  const text = inp.value.trim();
  if (!text || !S.running) return;
  inp.value = '';
  let target = S.cueTarget;
  const m = text.match(/^@(\S{1,5})[\s，,：:]*/);
  if (m) {
    const hit = S.panel.find((p) => CAST[p].name.includes(m[1].replace('@', '')));
    if (hit) target = hit;
  }
  S.pendingUser = { text: text.replace(/^@\S+[\s，,：:]*/, '') || text, target };
  if (S.cueTarget) cuePhilosopher(S.cueTarget);   // 清除点名状态
  if (S.audio || $('#btn-interrupt').classList.contains('on')) {
    // 正在发言：提示已排队（句末插入）
    inp.placeholder = '已排队——这句说完就轮到你…';
    setTimeout(() => { inp.placeholder = '随时插话；点击场上的哲学家可点名提问…'; }, 3000);
  }
}

function doInterrupt() {
  S.interruptFlag = true;
  if (S.audio) { try { S.audio.pause(); } catch {} S.audio = null; }
  $('#user-input').focus();
}

// ═══ 语音输入（浏览器内置识别）═══
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#btn-mic');
  if (!SR) { btn.title = '此浏览器不支持语音识别，请用 Chrome'; btn.style.opacity = .4; return; }
  const rec = new SR();
  rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false;
  let on = false;
  rec.onresult = (e) => {
    const t = [...e.results].map((r) => r[0].transcript).join('');
    $('#user-input').value = t;
  };
  rec.onend = () => { btn.classList.remove('rec'); on = false; if ($('#user-input').value.trim()) submitUser(); };
  btn.onclick = () => {
    if (on) { rec.stop(); return; }
    on = true; btn.classList.add('rec'); $('#user-input').value = '';
    try { rec.start(); } catch {}
  };
}

// ═══ 舞台表现 ═══
// 发言者只做正向强调（脚下光圈+名牌高亮），不压暗别人、不动镜头、不改大小
function focusChar(id, on) {
  Object.entries(S.chars).forEach(([pid, c]) => {
    c.el.classList.toggle('speaking', on && pid === id);
  });
}

// ── 聆听循环：绝大多数时间停在首帧，只偶尔掠过 1–2 帧，避免全员抢戏。 ──
function startIdle(id) {
  const c = S.chars[id];
  if (!c) return;
  stopIdle(id);
  c.idleVer = Math.random() < 0.5 ? 'ia' : 'ib';
  setSpriteVer(id, c.idleVer);
  const sp = c.el.querySelector('.sprite');
  c.el.classList.add('idle');
  let beat = 0;
  c.idleTimer = setInterval(() => {
    beat = (beat + 1) % 12;
    setFrame(sp, beat === 5 ? 1 : beat === 11 ? 2 : 0);
    if (beat === 0 && Math.random() < 0.35) {         // 很久才换一次聆听姿态
      c.idleVer = Math.random() < 0.5 ? 'ia' : 'ib';
      setSpriteVer(id, c.idleVer);
    }
  }, 900);
}
function stopIdle(id) {
  const c = S.chars[id];
  if (c && c.idleTimer) { clearInterval(c.idleTimer); c.idleTimer = null; }
  if (c) c.el.classList.remove('idle');
}

function startAnim(id) {
  stopAnim();
  stopIdle(id);
  S.talkingId = id;
  const sp = S.chars[id].el.querySelector('.sprite');
  let t = 0;
  S.animTimer = setInterval(() => { setFrame(sp, pingpong(++t)); }, 125);   // 说话 8 fps
}

function stopAnim() {
  clearInterval(S.animTimer);
  S.animTimer = null;
  if (S.talkingId) { startIdle(S.talkingId); S.talkingId = null; }
}

// 玩家闲时小动作：每隔一阵低头记一轮笔记（A 版），完整乒乓一个来回
function schedulePlayerNotes() {
  clearTimeout(S.playerNotesTimer);
  const tick = () => {
    S.playerNotesTimer = setTimeout(() => {
      const c = S.chars.player;
      if (!c || S.aborted || S.playerBusy) return tick();
      stopIdle('player');
      setSpriteVer('player', 'a');                   // 记笔记 = 说话A（纸笔）
      const sp = c.el.querySelector('.sprite');
      let t = 0;
      const iv = setInterval(() => {
        if (!S.chars.player || S.playerBusy) { clearInterval(iv); startIdle('player'); return; }
        setFrame(sp, pingpong(++t));
        if (t >= (FRAMES - 1) * 2) {                 // 一个完整来回后收笔，回到聆听
          clearInterval(iv);
          startIdle('player');
        }
      }, 140);
      tick();
    }, 12000 + Math.random() * 18000);               // 12–30 秒随机一次
  };
  tick();
}

// 头顶定位：紧贴人物 alpha 顶端（sprite 图有留白，需按人物实际高度估算）
function headAnchor(id) {
  const stageR = $('#stage').getBoundingClientRect();
  const spR = S.chars[id].el.querySelector('.sprite').getBoundingClientRect();
  return {
    x: spR.left - stageR.left + spR.width / 2,
    top: stageR.bottom - spR.top,        // sprite 顶端离舞台底的距离
    stageR,
  };
}

function showBubble(id, text) {
  const c = S.chars[id];
  const a = headAnchor(id);
  const b = $('#bubble');
  $('#bubble-name').textContent = CAST[id].name;
  $('#bubble-name').style.color = CAST[id].color;
  $('#bubble-text').textContent = text;
  b.classList.remove('interrupted');
  const left = Math.max(10, Math.min(a.x - 60, a.stageR.width - 360));
  b.style.left = left + 'px';
  b.style.bottom = Math.min(a.top + 10, a.stageR.height - 90) + 'px';  // 留出尾巴空间，不压住人物
  b.classList.add('on');
}
function hideBubble() { $('#bubble').classList.remove('on'); }

function showThink(id, on) {
  const t = $('#think');
  if (!on) { t.classList.remove('on'); return; }
  const a = headAnchor(id);
  t.style.left = Math.max(10, Math.min(a.x + 12, a.stageR.width - 100)) + 'px';
  t.style.bottom = Math.min(a.top + 8, a.stageR.height - 62) + 'px';
  t.classList.add('on');
}

// ═══ 记录 ═══
function pushLine(who, name, text) {
  S.transcript.push({ who, name, text });
  $('#log-count').textContent = S.transcript.length;
  const d = document.createElement('div');
  d.className = 'dr-item' + (who === 'user' ? ' dr-user' : who === 'host' ? ' dr-host' : '');
  const color = CAST[who]?.color || (who === 'user' ? '#33566b' : '#6b705c');
  d.innerHTML = `<div class="dr-name" style="color:${color}">${name}</div><div class="dr-text">${text}</div>`;
  $('#drawer-body').appendChild(d);
  $('#drawer-body').scrollTop = 1e6;
}

// ═══ 结束 → 报告 ═══
async function endMeeting() {
  S.aborted = true;
  if (S.audio) { try { S.audio.pause(); } catch {} }
  showReport();
}

async function showReport() {
  S.running = false;
  show('#screen-report');
  const wrap = $('#report-wrap');
  wrap.innerHTML = '<p class="report-loading">主持人正在为你写终局报告…</p>';
  let rep = null;
  try {
    const r = await fetch('/api/game/report', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_lines: S.userLines,
        panel: S.panel.map((p) => CAST[p].name),
        stories: STORIES.slice(0, S.storyIdx + 1).map((s) => `《${s.title}》`),
      }),
    });
    if (r.ok) rep = await r.json();
  } catch {}
  if (!rep) rep = {
    axes: [
      { name: '情理轴', left: '重情', right: '重法', value: 50 },
      { name: '知行轴', left: '追问', right: '笃行', value: 50 },
      { name: '应世轴', left: '有为', right: '无为', value: 50 },
      { name: '常变轴', left: '守常', right: '达变', value: 50 },
    ],
    match: '老子', title: '知者不言',
    text: '报告生成失败——但老子说，知者不言。你就当被夸了。',
    quote: '「知者不言，言者不知。」——《道德经》56章',
  };
  const matchId = Object.keys(CAST).find((k) => CAST[k].name === rep.match) || 'laozi';
  wrap.innerHTML = `
    <div class="report-card">
      <h2>哲学画像</h2>
      <div class="report-sub">稷下·论语圆桌 · 三案听审记录</div>
      <div class="report-top">
        <div class="report-sprite" style="background-image:url('${SPRITE(matchId)}')"></div>
        <div>
          <div class="report-match">你的思路最接近<b style="color:${CAST[matchId].color}">${rep.match}</b></div>
          <div class="report-title">${rep.title || ''}</div>
        </div>
      </div>
      ${(rep.axes || []).map((a) => `
        <div class="axis">
          <div class="axis-labels"><b>${a.left}</b><span>${a.name}</span><b>${a.right}</b></div>
          <div class="axis-bar"><div class="axis-dot" style="left:${a.value}%"></div></div>
        </div>`).join('')}
      <div class="report-text">${rep.text || ''}</div>
      ${rep.quote ? `<div class="report-quote">${rep.quote}</div>` : ''}
      <div class="report-actions">
        <button class="btn-primary" onclick="location.reload()">再来一局</button>
      </div>
    </div>`;
}

boot();
