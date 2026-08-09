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
  kongzi:   { name: '孔子',     tag: '义与关系', color: '#2e5f5c' },
  socrates: { name: '苏格拉底', tag: '追问概念', color: '#b08c3d' },
  hanfeizi: { name: '韩非子',   tag: '法与权术', color: '#a83226' },
  kant:     { name: '康德',     tag: '原则与义务', color: '#31548c' },
  laozi:    { name: '老子',     tag: '不辩者',   color: '#7a8b6f' },
  zhuangzi: { name: '庄子',     tag: '鼓盆的人', color: '#8a5a33' },
};
const SPRITE = (id) => `/static/assets/sprites/${id}.png`;

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
  $('#mode-toggle').onchange = (e) => { S.voiceMode = e.target.checked; };
  $('#btn-skip-cue').onclick = () => { S.cueSkip = true; };
  setupMic();
  window.addEventListener('resize', () => layoutChars(true));

  // 开发直达：#select / #table=kongzi,socrates,hanfeizi,kant（只摆台不跑流程）
  const h = location.hash;
  if (h === '#select') { renderPick(); show('#screen-select'); }
  else if (h.startsWith('#table=')) {
    S.panel = h.slice(7).split(',').filter((x) => CAST[x]);
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
  Object.entries(CAST).forEach(([id, c]) => {
    const d = document.createElement('div');
    d.className = 'pick-card' + (id === 'kongzi' ? ' locked' : '');
    d.innerHTML = `<div class="pick-mark">✓</div>
      <div class="pick-sprite" style="background-image:url('${SPRITE(id)}')"></div>
      <div class="pk-name" style="color:${c.color}">${c.name}</div>
      <div class="pk-tag">${c.tag}</div>`;
    // 悬停时播放雪碧图动画
    let t = null, f = 0;
    const sp = d.querySelector('.pick-sprite');
    d.onmouseenter = () => { t = setInterval(() => { f = (f + 1) % 10; setFrame(sp, f); }, 150); };
    d.onmouseleave = () => { clearInterval(t); setFrame(sp, 0); };
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
  el.style.backgroundPosition = `${(f % 5) * 25}% ${f < 5 ? 0 : 100}%`;
}

// ═══ 布局算法：错落有致、不重叠、非卡片 ═══
// 思路：N 人 → 均分横向槽位（保证最小间距）→ 前/后两个景深带交错分配
//       （后带更高更小、前带更低更大）→ 每人加受限随机抖动 → 每局随机站位顺序
function layoutChars(keepOrder = false) {
  const stage = $('#stage');
  if (!stage || !S.panel.length) return;
  const W = stage.clientWidth;
  const n = S.panel.length;
  if (!keepOrder) S.order = [...S.panel].sort(() => Math.random() - 0.5);
  const bands = [
    { bottom: 30, scale: 0.78 },   // 后带
    { bottom: 9,  scale: 1.0  },   // 前带
  ];
  const startBand = S.bandSeed ?? (S.bandSeed = Math.round(Math.random()));
  const left = 14, right = 80;                      // 横向可用区间（%），右侧留出亭子
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  S.order.forEach((id, i) => {
    const band = bands[(i + startBand) % 2];
    const jx = S.chars[id]?.jx ?? (Math.random() - 0.5) * Math.min(step * 0.35, 7);
    const jy = S.chars[id]?.jy ?? (Math.random() - 0.5) * 5;
    const x = n === 1 ? 50 : left + step * i + jx;
    const c = S.chars[id];
    if (!c) return;
    c.jx = jx; c.jy = jy;
    c.x = Math.max(10, Math.min(84, x));
    c.bottom = band.bottom + jy;
    c.scale = band.scale;
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
  S.panel.forEach((id) => {
    const c = CAST[id];
    const el = document.createElement('div');
    el.className = 'char dimmed';
    el.innerHTML = `
      <div class="ground"></div>
      <div class="sprite idle-breathe" style="background-image:url('${SPRITE(id)}')"></div>
      <div class="tag"><span class="mic-ico">🎙</span><b style="color:${c.color}">${c.name}</b><i>${c.tag}</i></div>`;
    el.onclick = () => cuePhilosopher(id);
    wrap.appendChild(el);
    S.chars[id] = { el };
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

    await hostSay(meta.host_intro);
    await circle(st, meta);                      // 第一圈
    if (S.aborted) break;
    await userWindow(meta.host_user_cue, st);    // cue 玩家
    if (S.aborted) break;
    S.escalated = true;                          // 议题升级
    slateUpgrade(meta);
    await hostSay(meta.host_escalation_line);
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
    await speak(responder, st, { userText: u.text });
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
  if (!opts.userText && S.prefetch[key]) turn = await S.prefetch[key];
  else turn = await fetchTurn(id, st, opts.userText);
  delete S.prefetch[key];
  showThink(id, false);
  if (S.aborted || !turn) return;

  // 预取下一位的台词+语音（无插话时才有效）
  if (opts.prefetchNext && !S.pendingUser) {
    const nid = opts.prefetchNext;
    S.prefetch[pfKey(nid)] = fetchTurn(nid, st, null, [...S.transcript, { name: CAST[id].name, text: turn.text }]);
  }

  pushLine(id, CAST[id].name, turn.text);
  focusChar(id, true);
  showBubble(id, turn.text);
  startAnim(id);
  $('#btn-interrupt').classList.add('on');
  S.interruptFlag = false;

  if (S.voiceMode) {
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

function pfKey(id) { return `${id}|${S.storyIdx}|${S.escalated}|${S.transcript.length}`; }
function invalidatePrefetch() { S.prefetch = {}; }

async function fetchTurn(id, st, userText, transcriptOverride) {
  try {
    const r = await fetch('/api/game/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        persona: id, story: st.id, escalated: S.escalated,
        transcript: (transcriptOverride || S.transcript).slice(-14),
        user_text: userText || null,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { speech } = await r.json();
    const out = { text: speech };
    if (S.voiceMode) out.wavP = fetchTTS(id, speech);   // 语音并行预取
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
  if (S.voiceMode) {
    const wav = await fetchHostTTS(text);
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
function focusChar(id, on) {
  Object.entries(S.chars).forEach(([pid, c]) => {
    c.el.classList.toggle('speaking', on && pid === id);
    c.el.classList.toggle('dimmed', !(on && pid === id));
  });
  if (!on) Object.values(S.chars).forEach((c) => c.el.classList.remove('dimmed'));
  // 轻微镜头感：舞台朝发言者偏移
  const stage = $('#chars');
  if (on) {
    const cx = S.chars[id].x;
    stage.style.transition = 'transform .8s';
    stage.style.transform = `translateX(${(50 - cx) * 0.1}%)`;
  } else stage.style.transform = '';
}

function startAnim(id) {
  stopAnim();
  const sp = S.chars[id].el.querySelector('.sprite');
  sp.classList.remove('idle-breathe');
  let f = 0;
  S.animTimer = setInterval(() => { f = (f + 1) % 10; setFrame(sp, f); }, 160);
}

function stopAnim(id) {
  clearInterval(S.animTimer);
  S.animTimer = null;
  Object.values(S.chars).forEach((c) => {
    const sp = c.el.querySelector('.sprite');
    setFrame(sp, 0);
    sp.classList.add('idle-breathe');
  });
}

function showBubble(id, text) {
  const c = S.chars[id];
  const stageR = $('#stage').getBoundingClientRect();
  const charR = c.el.getBoundingClientRect();
  const b = $('#bubble');
  $('#bubble-name').textContent = CAST[id].name;
  $('#bubble-name').style.color = CAST[id].color;
  $('#bubble-text').textContent = S.voiceMode ? text : '';
  b.classList.remove('interrupted');
  const left = Math.max(10, Math.min(charR.left - stageR.left + charR.width * 0.35, stageR.width - 360));
  const bottom = stageR.bottom - charR.top + 12;
  b.style.left = left + 'px';
  b.style.bottom = Math.min(bottom, stageR.height - 90) + 'px';
  b.classList.add('on');
}
function hideBubble() { $('#bubble').classList.remove('on'); }

function showThink(id, on) {
  const t = $('#think');
  if (!on) { t.classList.remove('on'); return; }
  const c = S.chars[id];
  const stageR = $('#stage').getBoundingClientRect();
  const charR = c.el.getBoundingClientRect();
  t.style.left = (charR.left - stageR.left + charR.width * 0.72) + 'px';
  t.style.bottom = (stageR.bottom - charR.top + 4) + 'px';
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
