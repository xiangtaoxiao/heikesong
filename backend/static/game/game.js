// ═══ 问道·未竟的论语 — 语音房游戏引擎 ═══
// 机制要点：
//  · 轮流发言一圈 → 主持人 cue 玩家(限时窗) → 议题升级 → 再一圈
//  · 玩家随时插话：句间自动排队插入；句中可按「打断」立即插入
//  · 点击哲学家 = 点名（下一句由他答你）
//  · 语音房/文字 模式随时切换；语音=qwen3-tts 按人配音色
//  · 预取下一句（文本+语音），发言间隙≈0

const $ = (s) => document.querySelector(s);
async function sleep(ms) {
  let remaining = ms;
  let started = performance.now();
  while (remaining > 0 && !S.aborted) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 100)));
    if (S.paused) {
      await waitIfPaused();
      started = performance.now();
    } else {
      const now = performance.now();
      remaining -= now - started;
      started = now;
    }
  }
}

const CAST = {
  kongzi: { name: '孔子', tag: '义与关系', color: '#2e5f5c', sprite: true }, socrates: { name: '苏格拉底', tag: '追问概念', color: '#b08c3d', sprite: true }, hanfeizi: { name: '韩非子', tag: '法与权术', color: '#a83226', sprite: true }, kant: { name: '康德', tag: '原则与义务', color: '#31548c', sprite: true }, laozi: { name: '老子', tag: '不辩者', color: '#7a8b6f', sprite: true }, zhuangzi: { name: '庄子', tag: '鼓盆的人', color: '#8a5a33', sprite: true },
  aristotle: { name: '亚里士多德', tag: '实践智慧', color: '#7b5e3b' }, mozi: { name: '墨子', tag: '兼爱非攻', color: '#4f6d54', sprite: true }, nietzsche: { name: '尼采', tag: '重估价值', color: '#8d3e32', sprite: true }, plato: { name: '柏拉图', tag: '洞穴与真理', color: '#536b9b' }, sartre: { name: '萨特', tag: '自由与责任', color: '#3f3f54' }, wangyangming: { name: '王阳明', tag: '致良知', color: '#a1663a', sprite: true }, diogenes: { name: '第欧根尼', tag: '陶罐里的狗', color: '#7d7a6a', sprite: true },
  player: { name: '你', tag: '参与者', color: '#33566b', sprite: true, player: true },
};
const SPRITE = (id, version = 'a') => `/static/assets/sprites/${id}-${version}.png`;
const SPRITE_FRAMES = 15;
const SELECTABLE_IDS = Object.keys(CAST).filter((id) => id !== 'player' && CAST[id].sprite);
const SEAT_QUOTES = {
  kongzi: '己所不欲，勿施于人。', socrates: '未经审视的人生不值得过。', hanfeizi: '法不阿贵，绳不挠曲。',
  kant: '人是目的，绝不可只是手段。', laozi: '上善若水，水善利万物而不争。', zhuangzi: '天地与我并生，而万物与我为一。',
  mozi: '兼相爱，交相利。', nietzsche: '成为你自己。', plato: '正义是各司其职。',
  wangyangming: '知是行之始，行是知之成。', diogenes: '请别挡住我的阳光。',
};
const randomSpeakingPose = () => (Math.random() < 0.5 ? 'a' : 'b');
const randomListeningPose = () => (Math.random() < 0.5 ? 'ia' : 'ib');
function setSpritePose(id, version) {
  const sprite = S.chars[id]?.el.querySelector('.sprite');
  if (sprite) sprite.style.backgroundImage = `url('${SPRITE(id, version)}')`;
}
const portrait = (id, className) => CAST[id].sprite ? `<div class="${className}" data-sprite-rows="3" style="background-image:url('${SPRITE(id)}');--sprite-rows:3"></div>` : `<div class="${className} text-portrait" style="--portrait-color:${CAST[id].color}">${CAST[id].name}</div>`;

const STORIES = [
  { id: 's1', title: '一只羊',     source: '《论语·子路》13.18', focal: '这个儿子做对了吗？' },
  { id: 's2', title: '门口的仇人', source: '《论语·宪问》14.34', focal: '该怎么对待伤害过你的人？' },
  { id: 's3', title: '三年之丧',   source: '《论语·阳货》17.21', focal: '宰予错了吗？' },
  { id: 's4', title: '己欲立而立人', source: '《论语·雍也》6.30', focal: '成全别人，是仁，还是负担？' },
  { id: 's5', title: '颜回陋巷', source: '《论语·雍也》6.11', focal: '贫困中的安乐，应被赞美吗？' },
  { id: 's6', title: '阳货之避', source: '《论语·阳货》17.1', focal: '周旋是妥协，还是保全？' },
  { id: 's7', title: '陈蔡绝粮', source: '《论语·卫灵公》15.2', focal: '绝境中如何守住理想？' },
  { id: 's8', title: '孔子见南子', source: '《论语·雍也》6.28', focal: '本心清白，够不够？' },
  { id: 's9', title: '三人行必有我师', source: '《论语·述而》7.22', focal: '学习怎样不盲从？' },
  { id: 's10', title: '乘桴浮于海', source: '《论语·公冶长》5.7', focal: '道路不通时如何选择？' },
];
const STAGE_SEATS = {
  image: '/static/assets/bg/candidate-6.png',
  anchors: {
    BL: [38, 42, 0.62], BC: [51, 41, 0.64], BR: [63, 42, 0.63],
    ML: [25, 27, 0.82], MR: [76, 27, 0.84], CL: [36, 29, 0.78], CR: [65, 30, 0.80],
    P: [50, 9, 0.78],
  },
  subsets: { 1: ['CR'], 2: ['CL', 'CR'], 3: ['CL', 'CR', 'BC'], 4: ['ML', 'MR', 'BL', 'BR'] },
  player: 'P',
};
let STORY_META = {};   // 从后端 config 静态文件补全 host 台词/原文（见 boot）

// ─── 全局状态 ───
const S = {
  panel: [],            // 入席哲学家 id[]
  storyIdx: 0,
  escalated: false,
  transcript: [],       // {who:'host'|'user'|id, name, text}
  storyTranscript: [],
  relationshipLedger: { recent: [] },
  userLines: [],
  pendingUser: null,    // {text, target}
  cueTarget: null,
  cueActive: false,
  cuePaused: false,
  interruptFlag: false,
  audioMuted: false,
  bgm: null,
  bgmFadeFrame: null,
  running: false,
  aborted: false,
  paused: false,
  pauseWaiters: [],
  inputHold: false,
  flowWaiters: [],
  audio: null,
  stopAudio: null,
  animTimer: null,
  prefetch: {},         // key → Promise<{text, wav}>
  hostPrefetch: {},     // story/task → Promise<{text, audioPromise}>
  requestControllers: new Set(),
  audioRequestControllers: new Set(),
  hostBannerVersion: 0,
  suggestionToken: 0,
  turnEpoch: 0,
  chars: {},            // id → {el, x, bottom, scale}
  seatAssign: null,
  seatQuoteAudio: {},
  seatPreview: null,
  seatPreviewStop: null,
  seatPreviewToken: 0,
  seatPrefetchQueue: [],
  seatPrefetchActive: 0,
};

// ═══ 启动 ═══
async function boot() {
  // 首页即尝试播放；若浏览器禁止自动播放，首次点击会解锁同一段全站 BGM。
  startBgm();
  document.addEventListener('pointerdown', startBgm, { once: true });
  try {
    const r = await fetch('/api/game/stories');
    STORY_META = await r.json();
  } catch { STORY_META = null; }
  $('#health-note').textContent = STORY_META ? '● 语音房已就绪（Haiku × Qwen-TTS）' : '◌ 剧场配置缺失';
  $('#stage').querySelector('.stage-bg').style.background = `url('${STAGE_SEATS.image}') center / 100% 100% no-repeat`;
  renderStoryList();
  if (STORY_META) prefetchHost(STORIES[0], 'intro');

  $('#btn-to-select').onclick = () => { startBgm(); renderPick(); show('#screen-select'); };
  $('#btn-start-game').onclick = startGame;
  $('#btn-send').onclick = submitUser;
  $('#user-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitUser(); });
  $('#user-input').addEventListener('focus', holdFlowForInput);
  $('#user-input').addEventListener('input', holdFlowForInput);
  $('#user-input').addEventListener('blur', releaseFlowOnBlur);
  $('#btn-interrupt').onclick = doInterrupt;
  $('#btn-pause').onclick = togglePause;
  $('#btn-log').onclick = () => $('#drawer').classList.add('open');
  $('#btn-drawer-close').onclick = () => $('#drawer').classList.remove('open');
  $('#btn-leave').onclick = endMeeting;
  $('#btn-original').onclick = () => $('#modal-original').classList.add('open');
  $('#btn-orig-close').onclick = () => $('#modal-original').classList.remove('open');
  $('#btn-mute').onclick = toggleMute;
  $('#btn-skip-cue').onclick = () => { S.cueSkip = true; setInputHold(false); };
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

function renderStoryList() {
  $('#story-count').textContent = `${STORIES.length}篇《论语》· 一场语音圆桌`;
  $('#story-list-label').textContent = `今晚${STORIES.length}篇`;
  $('#story-list').innerHTML = STORIES.map((story, index) => `<span class="ss-item"><em>${index + 1}.</em><b>${story.source}</b></span>`).join('');
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
  SELECTABLE_IDS.forEach((id) => {
    const c = CAST[id];
    const d = document.createElement('div');
    d.className = 'pick-card' + (id === 'kongzi' ? ' locked' : '');
    d.innerHTML = `<div class="pick-mark">✓</div>
      ${portrait(id, 'pick-sprite')}
      <div class="pk-name" style="color:${c.color}">${c.name}</div>
      <div class="pk-tag">${c.tag}</div>`;
    // 悬停时播放雪碧图动画
    let t = null, f = 0;
    const sp = d.querySelector('.pick-sprite');
    d.onmouseenter = () => { t = setInterval(() => setFrame(sp, pingpong(++f)), 130); };
    d.onmouseleave = () => { clearInterval(t); f = 0; setFrame(sp, 0); };
    d.onclick = () => {
      previewSeatQuote(id, sp);
      if (id === 'kongzi') return;              // 孔子锁定主位
      if (picked.has(id)) picked.delete(id);
      else if (picked.size < 4) picked.add(id);
      d.classList.toggle('picked', picked.has(id));
      $('#btn-start-game').disabled = picked.size < 2;
      $('#btn-start-game').textContent = `开始圆桌（${picked.size}人）`;
    };
    grid.appendChild(d);
    if (canPlayAudio() && SEAT_QUOTES[id] && !S.seatQuoteAudio[id]) prefetchSeatQuote(id);
  });
  $('#btn-start-game').disabled = false;
  $('#btn-start-game').textContent = '开始圆桌（1人？至少再请一位）';
  $('#btn-start-game').disabled = true;
  grid._picked = picked;
}

function prefetchSeatQuote(id) {
  if (id) S.seatPrefetchQueue.push(id);
  while (S.seatPrefetchActive < 3 && S.seatPrefetchQueue.length) {
    const next = S.seatPrefetchQueue.shift();
    S.seatPrefetchActive++;
    fetchSeatQuoteAudio(next).then((audio) => { if (audio) S.seatQuoteAudio[next] = audio; })
      .finally(() => { S.seatPrefetchActive--; prefetchSeatQuote(); });
  }
}

async function previewSeatQuote(id, sprite) {
  if (!canPlayAudio() || !SEAT_QUOTES[id]) return;
  const token = ++S.seatPreviewToken;
  S.seatPreviewStop?.();
  let prepared = S.seatQuoteAudio[id];
  if (!prepared) prepared = await fetchSeatQuoteAudio(id);
  if (token !== S.seatPreviewToken) return;
  if (!prepared) return;
  const audio = prepared.audio;
  S.seatPreview = audio;
  duckBgm();
  let frame = 0;
  const timer = setInterval(() => setFrame(sprite, pingpong(++frame)), 240);
  const finish = () => {
    clearInterval(timer);
    try { audio.pause(); } catch {}
    if (S.seatPreview === audio) S.seatPreview = null;
    if (S.seatPreviewStop === finish) S.seatPreviewStop = null;
    restoreBgm();
  };
  S.seatPreviewStop = finish;
  audio.onended = audio.onerror = finish;
  audio.currentTime = 0;
  audio.play().catch(finish);
}

async function fetchSeatQuoteAudio(id) {
  try {
    const response = await fetch(`/static/assets/audio/seat-quotes/${id}.wav`);
    return response.ok ? prepareAudio(await response.blob()) : null;
  } catch { return null; }
}

function setFrame(el, f) {
  const rows = Number(el.dataset.spriteRows || 2);
  const frame = f % (rows * 5);
  el.style.backgroundPosition = `${(frame % 5) * 25}% ${Math.floor(frame / 5) * (100 / (rows - 1))}%`;
}

function pingpong(t) {
  const cycle = (SPRITE_FRAMES - 1) * 2;
  const position = t % cycle;
  return position < SPRITE_FRAMES ? position : cycle - position;
}

// ═══ 舞台布局：根据已校准背景的座位锚点安排角色与玩家 ═══
function layoutChars(keepOrder = false) {
  const stage = $('#stage');
  if (!stage || !S.panel.length) return;
  if (!keepOrder || !S.seatAssign) {
    const seats = [...STAGE_SEATS.subsets[S.panel.length]].sort(() => Math.random() - 0.5);
    S.order = [...S.panel].sort(() => Math.random() - 0.5);
    S.seatAssign = { player: STAGE_SEATS.player };
    S.order.forEach((id, index) => { S.seatAssign[id] = seats[index]; });
  }
  Object.entries(S.seatAssign).forEach(([id, seat]) => {
    const c = S.chars[id];
    const anchor = STAGE_SEATS.anchors[seat];
    if (!c || !anchor) return;
    const [x, bottom, scale] = anchor;
    c.x = x; c.bottom = bottom; c.scale = scale;
    c.el.style.left = x + '%';
    c.el.style.bottom = bottom + '%';
    c.el.style.zIndex = Math.round(scale * 10);
    const sprite = c.el.querySelector('.sprite');
    sprite.style.transform = `scale(${scale})`;
    sprite.style.transformOrigin = 'bottom center';
  });
}

function mountChars() {
  const wrap = $('#chars');
  wrap.innerHTML = '';
  S.chars = {};
  S.seatAssign = null;
  [...S.panel, 'player'].forEach((id) => {
    const c = CAST[id];
    const el = document.createElement('div');
    el.className = 'char dimmed';
    el.innerHTML = `
      <div class="ground"></div>
      ${portrait(id, 'sprite idle-breathe')}
      <div class="tag"><span class="mic-ico">🎙</span><b style="color:${c.color}">${c.name}</b><i>${c.tag}</i></div>`;
    if (id !== 'player') el.onclick = () => cuePhilosopher(id);
    wrap.appendChild(el);
    S.chars[id] = { el };
    if (c.sprite) ['a', 'b', 'ia', 'ib'].forEach((version) => { new Image().src = SPRITE(id, version); });
    setIdlePose(id);
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
  S.seatPreviewStop?.();
  S.panel = [...$('#pick-grid')._picked];
  S.storyIdx = 0; S.transcript = []; S.userLines = [];
  S.storyTranscript = [];
  S.relationshipLedger = { recent: [] };
  S.cueActive = false; S.cuePaused = false;
  S.aborted = false; S.paused = false; S.turnEpoch = 0; S.running = true;
  $('#btn-pause').textContent = '⏸ 暂停';
  show('#screen-table');
  mountChars();
  startBgm();
  runGame().catch((e) => console.error(e));
}

async function runGame() {
  for (S.storyIdx = 0; S.storyIdx < STORIES.length && !S.aborted; S.storyIdx++) {
    await waitForFlow();
    const st = STORIES[S.storyIdx];
    const meta = STORY_META.stories.find((x) => x.id === st.id);
    S.escalated = false;
    S.storyTranscript = [];
    S.relationshipLedger = { recent: [] };
    setTheater(st, meta);
    refreshSuggestions(st, 'source');

    await hostSpeak(st, 'intro', meta.host_intro);
    if (STORIES[S.storyIdx + 1]) prefetchHost(STORIES[S.storyIdx + 1], 'intro');
    await circle(st, meta);                      // 第一圈
    if (S.aborted) break;
    await userWindow(st, meta);                                // cue 玩家
    if (S.aborted) break;
    S.escalated = true;                          // 议题升级
    slateUpgrade(meta);
    await hostSpeak(st, 'escalation', meta.host_escalation_line);
    S.order = [...S.panel].sort(() => Math.random() - 0.5);
    await circle(st, meta);                      // 深入讨论：全员承接主持人换角度
    if (S.aborted) break;
    await hostSpeak(st, 'outro', meta.host_outro);
    const nextStory = STORIES[S.storyIdx + 1];
    if (nextStory && !S.aborted) await showStoryTransition(nextStory);
  }
  if (!S.aborted) showReport();
}

async function showStoryTransition(nextStory) {
  const transition = $('#story-transition');
  transition.textContent = `本篇讨论结束，正在进入${nextStory.source}`;
  transition.classList.add('on');
  await sleep(3000);
  transition.classList.remove('on');
}

function setTheater(st, meta) {
  $('#tb-story').textContent = `第${S.storyIdx + 1}篇 ${st.source}`;
  $('#slate-source').textContent = st.source;
  $('#slate-original').textContent = meta.original;
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
  tag.textContent = '换个角度';
  tag.classList.add('upgraded');
  $('#slate-text').textContent = meta.escalation.replace(/^换个角度——/, '');
}

// 一圈轮流发言；圈中随时可被玩家插话打断
function lastActualPhilosopher() {
  for (let index = S.storyTranscript.length - 1; index >= 0; index--) {
    const item = S.storyTranscript[index];
    if (S.panel.includes(item.who) && item.text && !String(item.text).startsWith('【')) return item.who;
  }
  return null;
}

async function circle(st, meta, consumed = new Set()) {
  for (let i = 0; i < S.order.length && !S.aborted; i++) {
    await waitForFlow();
    const id = S.order[i];
    // 圈位边界处理插话；若正好是本位答的玩家，就算他这一轮已发言
    const responded = await drainUser(st, i);
    if (S.aborted) return;
    if (responded.has(id) || consumed.has(id)) continue;
    const next = S.order[i + 1];
    const relation = i === 0
      ? (S.escalated ? 'reconsider' : 'open_view')
      : (i % 2 ? 'build_on' : 'challenge');
    const previous = lastActualPhilosopher();
    const replyTo = previous ? CAST[previous].name : '当前情境';
    const prefetchNext = next ? {
      id: next,
      relation: (i + 1) % 2 ? 'build_on' : 'challenge',
      replyTo: CAST[id].name,
    } : null;
    await speak(id, st, { relation, replyTo, prefetchNext }); // 预取下一位
  }
  await drainUser(st, 0);
}

// 玩家插话排队处理：点名时由该角色回应；未点名时随机两位角色依次回应。
async function drainUser(st, circlePos) {
  const responded = new Set();
  while (S.pendingUser && !S.aborted) {
    await waitForFlow();
    const u = S.pendingUser; S.pendingUser = null;
    pushLine('user', '你', u.text);
    S.userLines.push(u.text);
    await playerSay(u.text);
    invalidatePrefetch();
    const responders = u.target
      ? [u.target]
      : [...S.panel].sort(() => Math.random() - 0.5).slice(0, 2);
    for (let index = 0; index < responders.length && !S.aborted; index++) {
      const responder = responders[index];
      await speak(responder, st, {
        userText: u.text,
        relation: u.target ? 'direct_response' : (index === 0 ? 'direct_response' : 'second_response'),
        replyTo: '玩家',
      });
      responded.add(responder);
    }
  }
  return responded;
}

async function playerSay(text) {
  if (!S.chars.player) return;
  focusChar('player', true);
  showBubble('player', text);
  startAnim('player');
  await sleep(Math.min(1300, Math.max(650, text.length * 45)));
  stopAnim('player');
  hideBubble();
  focusChar('player', false);
}

// ═══ 单次发言（文本→动画+气泡+语音）═══
async function speak(id, st, opts = {}) {
  const c = S.chars[id];
  if (!c) return;
  const epoch = S.turnEpoch;
  await waitForFlow();
  showThink(id, true);

  let turn;
  const key = pfKey(id);
  if (!opts.userText && S.prefetch[key]) turn = await S.prefetch[key];
  else turn = await fetchTurn(id, st, opts.userText, null, opts.relation, opts.replyTo);
  delete S.prefetch[key];
  showThink(id, false);
  if (S.aborted || epoch !== S.turnEpoch || !turn) return;

  // 预取下一位的台词+语音（无插话时才有效）。未发言者不留下伪造台词，下一位回到当前情境重新开题。
  if (opts.prefetchNext && !S.pendingUser) {
    const next = opts.prefetchNext;
    const nextIsAfterPass = turn.pass;
    S.prefetch[pfKey(next.id, S.transcript.length + 1)] = fetchTurn(
      next.id, st, null,
      nextIsAfterPass ? S.storyTranscript : [...S.storyTranscript, { who: id, name: CAST[id].name, text: turn.text }],
      nextIsAfterPass ? 'open_view' : next.relation,
      nextIsAfterPass ? '当前情境（上一位未发言）' : next.replyTo,
    );
  }

  if (turn.pass) {
    const actionText = `【${turn.action}】`;
    pushLine(id, CAST[id].name, actionText, false);
    focusChar(id, true);
    showBubble(id, '……', turn.action, turn.address);
    startAnim(id);
    await sleep(1100);
    hideBubble();
    stopAnim(id);
    focusChar(id, false);
    return;
  }

  recordRelationship(id, turn);
  pushLine(id, CAST[id].name, turn.text);
  focusChar(id, true);
  showBubble(id, turn.text, turn.action, turn.address);
  startAnim(id);
  $('#btn-interrupt').classList.add('on');
  S.interruptFlag = false;

  if (canPlayAudio()) {
    let preparedAudio = null;
    try { preparedAudio = await (turn.audioPromise || fetchTTS(id, turn.text)); } catch {}
    if (S.aborted || epoch !== S.turnEpoch) return;
    if (!canPlayAudio()) await typewriterWait(turn.text);
    else if (preparedAudio && !S.interruptFlag && !S.aborted) await playAudio(preparedAudio);
    else await sleep(readTime(turn.text));
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

function pfKey(id, transcriptLength = S.transcript.length) {
  return `${id}|${S.storyIdx}|${S.escalated}|${transcriptLength}`;
}

function recordRelationship(speaker, turn) {
  S.relationshipLedger.recent.push({ speaker, address: turn.address, move: turn.move });
  S.relationshipLedger.recent = S.relationshipLedger.recent.slice(-6);
}
function invalidatePrefetch() { S.prefetch = {}; }

function requestOptions(controllers = S.requestControllers) {
  const controller = new AbortController();
  controllers.add(controller);
  return {
    signal: controller.signal,
    finish: () => controllers.delete(controller),
  };
}

function cancelAudioRequests() {
  S.audioRequestControllers.forEach((controller) => controller.abort());
  S.audioRequestControllers.clear();
}

function cancelRequests() {
  S.requestControllers.forEach((controller) => controller.abort());
  S.requestControllers.clear();
  cancelAudioRequests();
  S.prefetch = {};
  S.hostPrefetch = {};
}

function isAbort(error) { return error?.name === 'AbortError'; }

async function fetchTurn(id, st, userText, transcriptOverride, relation, replyTo) {
  const request = requestOptions();
  try {
    const turnTranscript = transcriptOverride || S.storyTranscript;
    const r = await fetch('/api/game/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        persona: id, story: st.id, escalated: S.escalated,
        transcript: turnTranscript.slice(-14),
        speaker_history: turnTranscript.filter((item) => item.who === id).slice(-3),
        user_text: userText || null,
        relation: relation || (userText ? 'direct_response' : 'open_view'),
        reply_to: replyTo || (userText ? '玩家' : '当前情境'),
        panel: S.panel,
        relationship_ledger: S.relationshipLedger,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const turn = await r.json();
    const speech = (turn.speech || '').trim();
    const pass = Boolean(turn.pass) || !speech;
    return {
      // pass 时丢弃服务端可能返回的草稿，避免它被朗读或进入后续角色的上下文。
      text: pass ? '' : speech, action: turn.action || '凝神不语', address: turn.address || null,
      move: pass ? 'pass' : (turn.move || 'build'), pass,
      audioPromise: canPlayAudio() && !pass ? fetchTTS(id, speech) : null,
    };
  } catch (e) {
    if (isAbort(e)) return null;
    console.error('turn failed', e);
    return { text: '', action: '沉吟不语', move: 'pass', pass: true };
  } finally {
    request.finish();
  }
}

async function fetchTTS(id, text) {
  const request = requestOptions(S.audioRequestControllers);
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({ persona: id, text }),
    });
    if (!r.ok) return null;
    return await prepareAudio(await r.blob());
  } catch (e) {
    if (!isAbort(e)) console.error('tts failed', e);
    return null;
  } finally {
    request.finish();
  }
}

function prepareAudio(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish({ audio, url }), 4000);
    audio.oncanplaythrough = () => finish({ audio, url });
    audio.onerror = () => { URL.revokeObjectURL(url); finish(null); };
    audio.load();
  });
}

function playAudio(prepared) {
  return new Promise((resolve) => {
    const { audio, url } = prepared;
    S.audio = audio;
    duckBgm();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (S.audio === audio) S.audio = null;
      if (S.stopAudio === finish) S.stopAudio = null;
      URL.revokeObjectURL(url);
      restoreBgm();
      resolve();
    };
    S.stopAudio = finish;
    audio.onended = audio.onerror = finish;
    audio.play().catch(finish);
  });
}

function canPlayAudio() { return !S.audioMuted; }

function startBgm() {
  if (!S.bgm) {
    S.bgm = new Audio('/static/assets/audio/analects-calm-bgm.wav?v=20260810');
    S.bgm.loop = true;
    S.bgm.preload = 'auto';
    S.bgm.volume = 0;
  }
  if (!canPlayAudio()) return;
  S.bgm.play().then(() => setBgmVolume(0.1, 650)).catch(() => {});
}

function setBgmVolume(target, duration = 350) {
  if (!S.bgm) return;
  if (S.bgmFadeFrame) cancelAnimationFrame(S.bgmFadeFrame);
  const from = S.bgm.volume;
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    S.bgm.volume = from + (target - from) * progress;
    if (progress < 1) S.bgmFadeFrame = requestAnimationFrame(tick);
    else S.bgmFadeFrame = null;
  };
  S.bgmFadeFrame = requestAnimationFrame(tick);
}

function duckBgm() { if (canPlayAudio()) setBgmVolume(0.035, 180); }
function restoreBgm() { if (canPlayAudio() && !S.paused) setBgmVolume(0.1, 550); }
function stopBgm() {
  if (!S.bgm) return;
  if (S.bgmFadeFrame) cancelAnimationFrame(S.bgmFadeFrame);
  S.bgm.pause();
  S.bgm.currentTime = 0;
  S.bgm.volume = 0;
}

function toggleMute() {
  S.audioMuted = !S.audioMuted;
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.stopAudio) S.stopAudio();
  if (S.audioMuted) {
    cancelAudioRequests();
    if (S.bgm) S.bgm.pause();
  } else startBgm();
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
async function hostSpeak(st, task, fallback, onReady = null) {
  const epoch = S.turnEpoch;
  await waitForFlow();
  const key = hostKey(st, task);
  const prepared = S.hostPrefetch[key] ? await S.hostPrefetch[key] : await prepareHostTurn(st, task, S.storyTranscript);
  delete S.hostPrefetch[key];
  if (S.aborted || epoch !== S.turnEpoch) return null;
  const text = prepared?.text || fallback;
  onReady?.(text);
  await hostSay(text, prepared?.audioPromise, epoch);
  return text;
}

function hostKey(st, task) { return `${st.id}|${task}`; }

function prefetchHost(st, task, transcript = []) {
  const key = hostKey(st, task);
  if (!S.hostPrefetch[key]) S.hostPrefetch[key] = prepareHostTurn(st, task, transcript);
  return S.hostPrefetch[key];
}

async function prepareHostTurn(st, task, transcript) {
  const speech = await fetchHostTurn(st, task, transcript);
  return speech ? { text: speech, audioPromise: canPlayAudio() ? fetchHostTTS(speech) : null } : null;
}

async function fetchHostTurn(st, task, transcript) {
  const request = requestOptions();
  try {
    const r = await fetch('/api/game/host', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({ story: st.id, task, transcript: (transcript || []).slice(-14) }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { speech } = await r.json();
    return speech;
  } catch (e) {
    if (isAbort(e)) return undefined;
    console.error('host turn failed', e);
    return null;
  } finally {
    request.finish();
  }
}

async function hostSay(text, audioPromise = null, epoch = S.turnEpoch) {
  if (S.aborted) return;
  pushLine('host', '主持人', text);
  const bannerVersion = showHostBanner(text);
  if (canPlayAudio()) {
    let preparedAudio = null;
    try { preparedAudio = await (audioPromise || fetchHostTTS(text)); } catch {}
    if (S.aborted || epoch !== S.turnEpoch) return;
    if (!canPlayAudio()) await sleep(readTime(text) * 0.8);
    else if (preparedAudio) {
      await playAudio(preparedAudio);
      if (S.audioMuted && !S.aborted && epoch === S.turnEpoch) await sleep(readTime(text) * 0.8);
    }
    else await sleep(readTime(text) * 0.8);
  } else {
    await sleep(readTime(text) * 0.8);
  }
  hideHostBanner(bannerVersion);
}

function showHostBanner(text) {
  const banner = $('#host-banner');
  const version = ++S.hostBannerVersion;
  banner.textContent = text;
  banner.classList.remove('on');
  void banner.offsetWidth; // Force a new transition when two host turns are adjacent.
  banner.classList.add('on');
  return version;
}

function hideHostBanner(version) {
  if (version !== undefined && version !== S.hostBannerVersion) return;
  S.hostBannerVersion += 1;
  $('#host-banner').classList.remove('on');
}

async function fetchHostTTS(text) {
  const request = requestOptions(S.audioRequestControllers);
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({ persona: 'host', text }),
    });
    return r.ok ? await prepareAudio(await r.blob()) : null;
  } catch (e) {
    if (!isAbort(e)) console.error('host tts failed', e);
    return null;
  } finally {
    request.finish();
  }
}

// cue 玩家：倒计时窗口
async function userWindow(st, meta) {
  await hostSpeak(st, 'cue', meta.host_user_cue, (text) => {
    refreshSuggestions(st, 'host_question', text);
  });
  const cueEl = $('#user-cue');
  cueEl.classList.add('on');
  S.cueActive = true;
  S.cuePaused = false;
  S.cueSkip = false;
  $('#user-input').focus();
  for (let t = 12; t > 0;) {
    $('#cue-count').textContent = t;
    if (S.pendingUser || S.cueSkip || S.aborted) break;
    if (S.cuePaused || S.paused || S.inputHold) {
      await sleep(200);
      continue;
    }
    await sleep(1000);
    t--;
  }
  S.cueActive = false;
  cueEl.classList.remove('on');
  return drainUser(st, 0);
}

function holdFlowForInput() {
  if (!S.running || S.aborted) return;
  setInputHold(true);
  if (S.cueActive && $('#user-input').value.trim()) {
    S.cuePaused = true;
    $('#user-cue').classList.remove('on');
  }
}

function releaseFlowOnBlur() {
  if (!$('#user-input').value.trim() && !S.pendingUser) setInputHold(false);
}

function setInputHold(active) {
  S.inputHold = active;
  if (!active) S.flowWaiters.splice(0).forEach((resolve) => resolve());
}

// ═══ 插话 / 打断 ═══
function submitUser() {
  const inp = $('#user-input');
  const text = inp.value.trim();
  if (!text || !S.running) return;
  inp.value = '';
  setInputHold(false);
  let target = S.cueTarget;
  const m = text.match(/^@(\S{1,5})[\s，,：:]*/);
  if (m) {
    const hit = S.panel.find((p) => CAST[p].name.includes(m[1].replace('@', '')));
    if (hit) target = hit;
  }
  S.pendingUser = { text: text.replace(/^@\S+[\s，,：:]*/, '') || text, target };
  S.turnEpoch += 1;
  S.interruptFlag = true;
  cancelRequests();
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.stopAudio) S.stopAudio();
  $('#btn-interrupt').classList.remove('on');
  hideBubble();
  showThink(null, false);
  hideHostBanner();
  if (S.cueTarget) cuePhilosopher(S.cueTarget);   // 清除点名状态
  if (S.audio || $('#btn-interrupt').classList.contains('on')) {
    // 正在发言：提示已排队（句末插入）
    inp.placeholder = '已排队——这句说完就轮到你…';
    setTimeout(() => { inp.placeholder = '随时插话；点击场上的哲学家可点名提问…'; }, 3000);
  }
}

function doInterrupt() {
  S.interruptFlag = true;
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.stopAudio) S.stopAudio();
  $('#user-input').focus();
}

function togglePause() {
  if (!S.running || S.aborted) return;
  S.paused = !S.paused;
  $('#btn-pause').textContent = S.paused ? '▶ 继续' : '⏸ 暂停';
  if (S.paused) {
    if (S.audio && !S.audio.paused) S.audio.pause();
    if (S.bgm && !S.bgm.paused) S.bgm.pause();
    return;
  }
  if (S.audio?.paused) S.audio.play().catch(() => {});
  if (S.bgm && canPlayAudio()) S.bgm.play().catch(() => {});
  const waiters = S.pauseWaiters.splice(0);
  waiters.forEach((resolve) => resolve());
  S.flowWaiters.splice(0).forEach((resolve) => resolve());
}

async function waitIfPaused() {
  while (S.paused && !S.aborted) {
    await new Promise((resolve) => S.pauseWaiters.push(resolve));
  }
}

async function waitForFlow() {
  while ((S.paused || S.inputHold) && !S.aborted) {
    await new Promise((resolve) => S.flowWaiters.push(resolve));
  }
}

async function refreshSuggestions(st, phase = 'source', hostQuestion = '') {
  const list = $('#suggestion-list');
  const storyId = st.id;
  const token = ++S.suggestionToken;
  const request = requestOptions();
  list.replaceChildren(Object.assign(document.createElement('span'), {
    className: 'suggestion-loading', textContent: '正在准备三个不同的角度…',
  }));
  try {
    const r = await fetch('/api/game/suggestions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        story: storyId, phase, host_question: hostQuestion || null, transcript: S.storyTranscript.slice(-14),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { suggestions } = await r.json();
    if (S.aborted || token !== S.suggestionToken || STORIES[S.storyIdx]?.id !== storyId) return;
    list.replaceChildren();
    (suggestions || []).forEach((text) => {
      const button = document.createElement('button');
      button.className = 'suggestion';
      button.textContent = text;
      button.title = text;
      button.onclick = () => {
        $('#user-input').value = text;
        $('#user-input').focus();
        holdFlowForInput();
      };
      list.appendChild(button);
    });
  } catch (e) {
    if (!isAbort(e)) console.error('suggestions failed', e);
    if (token === S.suggestionToken && STORIES[S.storyIdx]?.id === storyId) list.replaceChildren();
  } finally {
    request.finish();
  }
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
  if (CAST[id].sprite) setSpritePose(id, randomSpeakingPose());
  sp.classList.remove('idle-breathe');
  const lastFrame = Number(sp.dataset.spriteRows || 2) * 5 - 1;
  let frame = 0;
  setFrame(sp, frame);
  S.animTimer = setInterval(() => {
    frame += 1;
    setFrame(sp, frame);
    if (frame === lastFrame) {
      clearInterval(S.animTimer);
      S.animTimer = null;
      setFrame(sp, 0);
      sp.classList.add('idle-breathe');
    }
  }, 280);
}

function stopAnim(id) {
  clearInterval(S.animTimer);
  S.animTimer = null;
  Object.values(S.chars).forEach((c) => {
    const sp = c.el.querySelector('.sprite');
    setFrame(sp, 0);
    sp.classList.add('idle-breathe');
  });
  Object.keys(S.chars).forEach(setIdlePose);
}

function setIdlePose(id) {
  if (CAST[id]?.sprite) setSpritePose(id, randomListeningPose());
}

function showBubble(id, text, action = '', address = null) {
  const c = S.chars[id];
  const stageR = $('#stage').getBoundingClientRect();
  const charR = c.el.getBoundingClientRect();
  const b = $('#bubble');
  $('#bubble-name').textContent = CAST[id].name;
  $('#bubble-name').style.color = CAST[id].color;
  $('#bubble-meta').textContent = action;
  $('#bubble-text').textContent = canPlayAudio() ? text : '';
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
function pushLine(who, name, text, includeInStory = true) {
  S.transcript.push({ who, name, text });
  if (includeInStory && S.running && S.storyIdx < STORIES.length) S.storyTranscript.push({ who, name, text });
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
  S.paused = false;
  S.pauseWaiters.splice(0).forEach((resolve) => resolve());
  S.flowWaiters.splice(0).forEach((resolve) => resolve());
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.stopAudio) S.stopAudio();
  showReport();
}

async function showReport() {
  S.running = false;
  if (canPlayAudio()) {
    startBgm();
    setBgmVolume(0.1, 450);
  }
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
      <div class="report-sub">问道·未竟的论语 · ${STORIES.length}篇思考记录</div>
      <div class="report-top">
        ${portrait(matchId, 'report-sprite')}
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
