// ═══ 稷下·论语圆桌 — 共享讲席 成品版 ═══
// · 布局：上方竹卷轴讲席（导读PPT/议题投屏），下方哲学家并席而坐
// · 流程：故事导读(人物静止) → 主持人开席 → 轮流辩论(发言者动画/其余聆听)
//        → cue 玩家 → 议题升级 → 第二圈 → 三案毕出哲学画像
// · 玩家机制：随时插话(立即截停当前发言)；输入框聚焦=流程暂停；@/点击点名
// · 移植自协作版：全局暂停、输入即停、AI 推荐发言、BGM 氛围
// · 预取管线：主持人台词/下一位发言 全程预热，间隙≈0

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
const LOCAL_FALLBACKS = {
  kongzi: '且慢。只问谁守了法，还不够；还要看他有没有尽到人与人之间的本分。名若正，而情理尽失，这个“直”便值得再议。',
  socrates: '让我们先别急着赞同。你说他是正直的，那么“正直”究竟指诚实、服从法律，还是使灵魂变得更好？',
  hanfeizi: '只靠人人自称心正，国家便无从治理。赏罚必须有明白的尺度；尺度一乱，私情就会借道德之名而行。',
  kant: '一个行动的价值，不能只由结果来决定。问题在于：我能否愿意让自己所遵循的准则，成为人人都遵循的规则？',
  laozi: '事情一到争名的时候，本意往往已经远了。少些强作，多看它自然生出的后果，也许更接近道。',
  zhuangzi: '你说他对，旁人说他错；彼此都站在自己的岸上。若把岸挪一挪，这个是非恐怕也会换个模样。',
  mozi: '先算一算它给众人带来的利害。若只成全一家的名声，却让更多人受损，这个道理便站不稳。',
  wangyangming: '道理不只在口头。若心里明知该做什么，却借漂亮话逃开，那便是知而不行；良知正在这一念上见真章。',
  nietzsche: '我怀疑这里所谓的美德，不过是软弱给自己戴上的冠冕。先问一问：是谁规定了这套善恶，它又保护了谁？',
  diogenes: '你们把道理装进这么多盒子，我只问一句：若没有观众看着，你还会做同一件事吗？',
};
const SEAT_QUOTES = {
  kongzi: '己所不欲，勿施于人。', socrates: '未经审视的人生不值得过。', hanfeizi: '法不阿贵，绳不挠曲。',
  kant: '人是目的，绝不可只是手段。', laozi: '上善若水，水善利万物而不争。', zhuangzi: '天地与我并生，而万物与我为一。',
  mozi: '兼相爱，交相利。', nietzsche: '成为你自己。', wangyangming: '知是行之始，行是知之成。',
  diogenes: '请别挡住我的阳光。',
};
const FRAMES = 15;                                   // 雪碧图 15帧 5×3，乒乓循环
const SPRITE = (id, ver) => `/static/assets/sprites/${id}-${ver || 'a'}.png`;
const randVer = () => (Math.random() < 0.5 ? 'a' : 'b');
function setSpriteVer(id, ver) {
  const c = S.chars[id];
  if (c) c.el.querySelector('.sprite').style.backgroundImage = `url('${SPRITE(id, ver)}')`;
}

// 抢麦触发词：一个哲学家是什么，就等于他被什么话激怒
const TRIGGERS = {
  kongzi:       ['孝', '爹', '父', '母', '家', '劝', '礼', '仁', '亲情', '心安', '良心', '规矩'],
  socrates:     ['直', '应该', '正义', '知道', '定义', '确定', '为什么', '凭什么', '什么是', '真话'],
  hanfeizi:     ['法', '国', '制度', '规则', '举报', '官', '赏', '罚', '大家都', '社会', '秩序', '乱'],
  kant:         ['撒谎', '真话', '谎', '义务', '原则', '例外', '底线', '普遍', '尊严'],
  laozi:        ['忘', '争', '放下', '自然', '无所谓', '算了', '看开', '本来'],
  zhuangzi:     ['死', '丧', '哭', '难过', '悲', '生死', '安', '想通', '意义', '梦'],
  mozi:         ['算', '钱', '粮', '利', '亏', '成本', '值得', '天下', '公平', '穷'],
  wangyangming: ['心', '知', '行', '良知', '自欺', '当下', '明白'],
  nietzsche:    ['宽恕', '原谅', '忍', '弱', '强', '报复', '怨', '恨', '道德', '高尚'],
  diogenes:     ['我的', '体面', '名声', '面子', '虚伪', '财产', '规矩'],
};

// 最近一句公开发言的文本（抢麦据此判断谁被戳到）
function lastSpeechText() {
  for (let i = S.storyTranscript.length - 1; i >= 0; i--) {
    const t = S.storyTranscript[i];
    if (t && t.text) return t.text;
  }
  return '';
}

// 从待发言池里挑"最憋不住"的人：触发词命中 + 久未发言加权 − 刚说过惩罚
function grabMic(pool, lastText = '') {
  let best = pool[0], bestScore = -1e9;
  for (const id of pool) {
    let score = Math.random() * 2;
    (TRIGGERS[id] || []).forEach((kw) => { if (lastText.includes(kw)) score += 2.6; });
    if (S.lastSpeakers[0] === id) score -= 6;
    else if (S.lastSpeakers[1] === id) score -= 2;
    else score += 1.6;                                  // 久未开口的人更想说
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

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
let STORY_META = {};

// ─── 全局状态 ───
const S = {
  panel: [], storyIdx: 0, escalated: false,
  transcript: [], storyTranscript: [], relationshipLedger: { recent: [] }, userLines: [],
  pendingUser: null, cueTarget: null,
  interruptFlag: false,
  audioMuted: false,
  running: false, aborted: false, briefing: false, skipBriefing: false,
  paused: false, inputHold: false, flowWaiters: [], // 暂停/输入即停（移植）
  suggestionToken: 0,
  audio: null, finishAudio: null, bgm: null,
  seatPreview: null,
  animTimer: null,
  prefetch: {}, chars: {},
  lastSpeakers: [], skipTurn: false, skipStory: false, deckPage: 0, deckBeats: [],
};

// ═══ 启动 ═══
async function boot() {
  try {
    const r = await fetch('/api/game/stories');
    STORY_META = await r.json();
  } catch { STORY_META = null; }
  $('#health-note').textContent = STORY_META ? '● 语音房已就绪（Haiku × Qwen-TTS）' : '◌ 剧场配置缺失';
  renderStorySummary();

  $('#btn-to-select').onclick = () => { renderPick(); show('#screen-select'); };
  $('#btn-start-game').onclick = startGame;
  $('#btn-send').onclick = submitUser;
  const inp = $('#user-input');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitUser(); });
  inp.addEventListener('focus', holdFlowForInput);
  inp.addEventListener('blur', releaseFlowOnBlur);
  inp.addEventListener('input', () => { if (inp.value.trim()) holdFlowForInput(); });
  $('#btn-interrupt').onclick = doInterrupt;
  $('#btn-log').onclick = () => $('#drawer').classList.add('open');
  $('#btn-drawer-close').onclick = () => $('#drawer').classList.remove('open');
  $('#btn-leave').onclick = endMeeting;
  $('#btn-original').onclick = () => $('#modal-original').classList.add('open');
  $('#btn-original-deck').onclick = () => $('#modal-original').classList.add('open');
  $('#btn-orig-close').onclick = () => $('#modal-original').classList.remove('open');
  $('#btn-mute').onclick = toggleMute;
  $('#btn-pause').onclick = togglePause;
  $('#btn-speak-open').onclick = () => openSpeechTray(!$('#screen-table').classList.contains('speech-open'));
  $('#btn-speech-close').onclick = () => openSpeechTray(false);
  $('#btn-skip-brief').onclick = () => { S.skipBriefing = true; stopCurrentAudio(); };
  $('#btn-skip-cue').onclick = () => { S.cueSkip = true; };
  $('#btn-deck-prev').onclick = () => flipDeck(-1);
  $('#btn-deck-next').onclick = () => flipDeck(1);
  $('#btn-skip-turn').onclick = skipCurrentTurn;
  $('#btn-skip-story').onclick = skipCurrentStory;
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === $('#user-input')) return;
    if (e.key === 'ArrowLeft') flipDeck(-1);
    if (e.key === 'ArrowRight') flipDeck(1);
  });
  $('#deck-visual').onclick = openDeckImage;
  $('#btn-image-close').onclick = closeDeckImage;
  $('#modal-image').onclick = (e) => { if (e.target.id === 'modal-image') closeDeckImage(); };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeDeckImage();
    $('#modal-original').classList.remove('open');
    openSpeechTray(false);
  });
  setupMic();
  window.addEventListener('resize', () => layoutChars(true));
  // 开场问候与选人无关：页面一加载就开始生成并合成语音，入席时零等待
  S.welcomeP = fetchWelcome().then((t) => { warmTTS('host', t); return t; });

  // 开发直达：#select / #table=kongzi,socrates（只摆台）/ 加 demo=speech 演示发言
  const h = location.hash;
  if (h === '#select') { renderPick(); show('#screen-select'); }
  else if (h.startsWith('#table=')) {
    S.panel = h.slice(7).split('&')[0].split(',').filter((x) => CAST[x] && x !== 'player');
    show('#screen-table');
    mountChars();
    const st = STORIES[0];
    const meta = STORY_META.stories[0];
    setTheater(st, meta);
    await $('#deck-img').decode().catch(() => {});   // 第一张导读必须先有图，再开始主持人口播
    if (h.includes('demo=brief')) {
      const beats = deckBeats(st, meta);
      $('#story-deck').classList.add('briefing');
      renderDeckDots(beats.length);
      showDeckSlide(beats, 0);
      $('#deck-narration-text').textContent = beats[0].narration;
      Object.values(S.chars).forEach((c) => setFrame(c.el.querySelector('.sprite'), 0));
    }
    else {
      enterDebateDeck(st, meta);
      if (h.includes('demo=speech')) {
        const sp = S.panel[1] || S.panel[0];
        focusChar(sp, true);
        setSpriteVer(sp, 'a');
        startAnim(sp);
        showBubble(sp, '你说的直，究竟是什么？');
      }
    }
  }
}

// 点开插画看大图：辩论期自动暂停，关掉自动恢复
function openDeckImage() {
  const src = $('#deck-img').src;
  if (!src) return;
  $('#lightbox-img').src = src;
  $('#modal-image').classList.add('open');
  if (S.running && !S.paused && !S.briefing) { togglePause(true); S.pausedByImage = true; }
}

function closeDeckImage() {
  $('#modal-image').classList.remove('open');
  if (S.pausedByImage) { S.pausedByImage = false; if (S.paused) togglePause(false); }
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function renderStorySummary() {
  const count = $('#story-count');
  if (count) count.textContent = `${STORIES.length}篇《论语》· 一场语音圆桌`;
  const list = $('#story-list');
  if (!list) return;
  list.innerHTML = `<span class="ss-label">今晚十篇</span>${STORIES.map((story, index) =>
    `<span class="ss-item"><em>${index + 1}.</em> ${story.title}<i>${story.source.replace(/[《》]/g, '')}</i></span>`
  ).join('')}`;
}

// 发言区采用二级托盘：常态收起以节省舞台高度，用户主动发言或被 cue 时展开。
function openSpeechTray(open = true, focus = true) {
  const table = $('#screen-table');
  if (!table) return;
  table.classList.toggle('speech-open', open);
  $('#speech-tray').setAttribute('aria-hidden', String(!open));
  $('#btn-speak-open').setAttribute('aria-expanded', String(open));
  if (open && focus) requestAnimationFrame(() => $('#user-input').focus());
  if (!open && !$('#user-input').value.trim() && !S.pendingUser) setInputHold(false);
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
    let t = null, f = 0;
    const sp = d.querySelector('.pick-sprite');
    d.onmouseenter = () => { t = setInterval(() => { setFrame(sp, pingpong(++f)); }, 130); };
    d.onmouseleave = () => { clearInterval(t); f = 0; setFrame(sp, 0); };
    d.onclick = () => {
      previewSeatQuote(id);
      if (id === 'kongzi') return;
      if (picked.has(id)) picked.delete(id);
      else if (picked.size < 4) picked.add(id);
      d.classList.toggle('picked', picked.has(id));
      $('#btn-start-game').textContent = `开始圆桌（${picked.size}人）`;
    };
    grid.appendChild(d);
  });
  $('#btn-start-game').disabled = false;
  $('#btn-start-game').textContent = '开始圆桌（1人）';
  grid._picked = picked;
}

function stopSeatPreview() {
  if (!S.seatPreview) return;
  try { S.seatPreview.pause(); } catch {}
  S.seatPreview = null;
}

function previewSeatQuote(id) {
  if (S.audioMuted || !SEAT_QUOTES[id]) return;
  stopSeatPreview();
  const audio = new Audio(`/static/assets/audio/seat-quotes/${id}.wav`);
  S.seatPreview = audio;
  const finish = () => { if (S.seatPreview === audio) S.seatPreview = null; };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);
}

function setFrame(el, f) {
  el.style.backgroundPosition = `${(f % 5) * 25}% ${Math.floor(f / 5) * 50}%`;
}
function pingpong(t) {
  const cycle = (FRAMES - 1) * 2;
  const p = t % cycle;
  return p < FRAMES ? p : cycle - p;
}

// ═══ 共享讲席座次：哲学家 + 玩家并席，等距一排，人少向中央收拢 ═══
// 关键约束：人物顶端不得越过卷轴纸面下沿（只允许压到竹轴下杆一点点），
// 否则既挡住 PPT 内容，人物的方形盒子也会吃掉卷轴上的点击。
const SPRITE_AR = 307 / 341;                 // 雪碧图单帧宽高比
const SPRITE_MAX = 338;                      // 人物退为次层级，给增高后的 PPT 留出清晰间隔
function availableCharHeight() {
  const stageR = $('#stage').getBoundingClientRect();
  const deckR = $('#story-deck').getBoundingClientRect();
  const floor = stageR.height * 0.034;                 // 落座线离舞台底
  const deckBottom = deckR.bottom - stageR.top;        // 卷轴整体下沿
  const overlapAllowed = deckR.height * 0.19;          // 允许压住下竹轴一点点（Eric：轻微重合更自然）
  return Math.max(150, Math.min(SPRITE_MAX, stageR.height - floor - deckBottom + overlapAllowed));
}

function layoutChars(keepOrder = false) {
  const stage = $('#stage');
  if (!stage || !S.panel.length) return;
  if (!keepOrder || !S.order) {
    S.order = [...S.panel].sort(() => Math.random() - 0.5);
    S.layoutOrder = [...S.order, 'player'];
  }
  const n = S.layoutOrder.length;
  const SEATS = {
    2: [{ x: 40, s: 1.04 }, { x: 61, s: 0.94 }],
    3: [{ x: 30, s: 1.00 }, { x: 52, s: 1.02 }, { x: 73, s: 0.92 }],
    4: [{ x: 22, s: 0.94 }, { x: 41, s: 1.00 }, { x: 60, s: 0.98 }, { x: 79, s: 0.90 }],
    5: [{ x: 14, s: 0.88 }, { x: 32, s: 0.94 }, { x: 50, s: 0.96 }, { x: 68, s: 0.92 }, { x: 85, s: 0.86 }],
  };
  const seats = SEATS[n] || SEATS[5];
  const baseH = availableCharHeight();
  S.layoutOrder.forEach((id, i) => {
    const seat = seats[i] || { x: 50, s: 0.9 };
    const c = S.chars[id];
    if (!c) return;
    c.x = seat.x; c.scale = seat.s;
    c.el.style.left = seat.x + '%';
    c.el.style.bottom = '3.4%';
    c.el.style.zIndex = String(5 + Math.round(seat.s * 4));
    const h = baseH * seat.s;
    const sp = c.el.querySelector('.sprite');
    sp.style.transform = 'none';                       // 尺寸直接写死，不再靠 scale
    sp.style.height = h + 'px';
    sp.style.width = (h * SPRITE_AR) + 'px';
    const g = c.el.querySelector('.ground');
    g.style.width = (h * 0.56) + 'px';
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
      <div class="tag"><span class="mic-ico">声</span><b style="color:${c.color}">${c.name}</b><i>${c.tag}</i></div>`;
    if (id !== 'player') el.onclick = () => cuePhilosopher(id);
    wrap.appendChild(el);
    S.chars[id] = { el };
    ['a', 'b', 'ia', 'ib'].forEach((v) => { new Image().src = SPRITE(id, v); });
  });
  layoutChars();
}

function cuePhilosopher(id) {
  S.cueTarget = S.cueTarget === id ? null : id;
  Object.entries(S.chars).forEach(([pid, c]) => c.el.classList.toggle('cued', pid === S.cueTarget));
  $('#user-input').placeholder = S.cueTarget
    ? `对${CAST[S.cueTarget].name}说…（再点一次取消点名）`
    : '随时插话；点击哲学家可点名提问…';
  if (S.cueTarget) $('#user-input').focus();
  if (S.cueTarget) openSpeechTray(true);
}

// ═══ 主流程 ═══
async function startGame() {
  stopSeatPreview();
  S.panel = [...$('#pick-grid')._picked];
  S.storyIdx = 0; S.transcript = []; S.userLines = [];
  S.storyTranscript = []; S.relationshipLedger = { recent: [] };
  S.aborted = false; S.paused = false; S.inputHold = false; S.running = true;
  $('#btn-pause').classList.remove('paused');
  openSpeechTray(false, false);
  show('#screen-table');
  mountChars();
  startBgm();
  // 抢跑：开场白与第一篇的主持人台词，在舞台刚亮起时就开始生成/合成
  const first = STORY_META.stories.find((x) => x.id === STORIES[0].id);
  if (first && canPlayAudio()) warmHostQueue(deckBeats(STORIES[0], first).map((b) => b.narration));
  runGame().catch((e) => console.error(e));
}

async function fetchWelcome() {
  try {
    const r = await fetch('/api/game/welcome', { method: 'POST' });
    if (!r.ok) throw new Error('bad');
    return (await r.json()).speech;
  } catch { return '各位贤者，晚上好。今晚咱们聊几桩《论语》里吵了两千年的旧事，诸位随意开口。'; }
}

async function runGame() {
  const welcome = await (S.welcomeP || fetchWelcome());   // 入席时已起跑，这里通常瞬时返回
  S.deckBeats = [{
    title: '稷下 · 论语圆桌',
    narration: '今晚同席：' + S.panel.map((p) => CAST[p].name).join('、') + '，以及旁听的你。今晚共 ' + STORIES.length + ' 篇公案，随时可以插话。',
    img: null,
  }];
  S.deckPage = 0;
  renderDeckDots(1);
  renderDeckPage();
  $('#deck-source').textContent = '';
  await hostSay(welcome);

  for (S.storyIdx = 0; S.storyIdx < STORIES.length && !S.aborted; S.storyIdx++) {
    const st = STORIES[S.storyIdx];
    const meta = STORY_META.stories.find((x) => x.id === st.id);
    S.escalated = false;
    S.storyTranscript = [];
    S.relationshipLedger = { recent: [] };
    invalidatePrefetch();
    setTheater(st, meta);
    await $('#deck-img').decode().catch(() => {});   // 图先落卷轴，主持人再开口
    const beats = deckBeats(st, meta);
    if (canPlayAudio()) warmHostQueue([
      ...beats.map((b) => b.narration),
      meta.host_user_cue, meta.host_escalation_line, meta.host_outro,
    ]);
    S.skipStory = false;
    // 导读还在播的时候，第一位的台词与语音已经在生成——开席即可开口
    S.order = [...S.panel].sort(() => Math.random() - 0.5);
    S.grabbed = S.order[0];                          // 让抢麦认这一位，预取才不会落空
    S.prefetch[pfKey(S.order[0])] = fetchTurn(S.order[0], st, null,
      [{ who: 'host', name: '主持人', text: beats[0].narration }], 'open_view', '当前情境');
    refreshSuggestions(st, 'source');
    await runStoryBriefing(st, meta);                 // 导读：人物静止
    if (S.aborted) break;
    if (S.skipStory) { await afterStory(st); continue; }
    Object.keys(S.chars).forEach(startIdle);          // 开席：进入聆听
    const nextMeta = STORIES[S.storyIdx + 1] && STORY_META.stories.find((x) => x.id === STORIES[S.storyIdx + 1].id);
    if (nextMeta && canPlayAudio()) warmHostQueue(deckBeats(STORIES[S.storyIdx + 1], nextMeta).map((b) => b.narration));
    await circle(st, meta);
    if (S.aborted) break;
    if (S.skipStory) { await afterStory(st); continue; }
    await userWindow(meta.host_user_cue, st);
    if (S.aborted) break;
    if (S.skipStory) { await afterStory(st); continue; }
    S.escalated = true;
    slateUpgrade(meta);
    await hostSay(meta.host_escalation_line);
    refreshSuggestions(st, 'escalated');
    S.order = [...S.panel].sort(() => Math.random() - 0.5);
    S.grabbed = S.order[0];
    S.prefetch[pfKey(S.order[0])] = fetchTurn(S.order[0], st, null);
    await circle(st, meta);
    if (S.aborted) break;
    if (!S.skipStory) await hostSay(meta.host_outro);
    const nextStory = STORIES[S.storyIdx + 1];
    if (nextStory && !S.aborted) await showStoryTransition(nextStory);
    S.skipStory = false;
  }
  if (!S.aborted) showReport();
}

// ═══ 卷轴讲席（导读 PPT / 议题投屏）═══
// 篇末收尾：清残留、放过渡；跳过本篇时也走这里
async function afterStory(st) {
  S.skipStory = false;
  stopCurrentAudio();
  hideBubble();
  showThink(null, false);
  const next = STORIES[S.storyIdx + 1];
  if (next && !S.aborted) await showStoryTransition(next);
}

// 每篇的三格漫画已裁成独立图：theater/<id>-1.png … -3.png
function panelSrc(st, index) { return `/static/assets/theater/${st.id}-${index + 1}.png`; }

function deckBeats(st, meta) {
  if (meta.guide_slides?.length) {
    return meta.guide_slides.map((slide, i) => ({
      title: slide.title,
      caption: [slide.text, slide.quote].filter(Boolean).join(' '),
      narration: slide.narration || slide.text,
      img: panelSrc(st, i),
    }));
  }
  return (meta.briefing?.length ? meta.briefing : [
    { title: st.title, narration: meta.scene },
    { title: '原文线索', narration: meta.original_note },
    { title: '开席之问', narration: meta.host_intro },
  ]).map((b, i) => ({ ...b, img: panelSrc(st, i) }));
}

function setTheater(st, meta) {
  $('#tb-story').textContent = `第${S.storyIdx + 1}篇《${st.title}》· ${st.source}`;
  $('#orig-source').textContent = st.source;
  $('#orig-text').textContent = meta.original;
  $('#orig-note').textContent = meta.original_note;
  [0, 1, 2].forEach((i) => { new Image().src = panelSrc(st, i); });   // 预载分格，翻页不闪
  $('#deck-source').textContent = st.source;
}

async function showStoryTransition(nextStory) {
  $('#deck-phase').textContent = '篇章过渡';
  $('#deck-status').textContent = `下一篇 · ${nextStory.source}`;
  $('#deck-title').textContent = `接下来：${nextStory.title}`;
  $('#deck-narrative').textContent = '稍作停顿，让刚才的分歧落定；下一段《论语》正在展开。';
  await sleep(1400);
}

async function runStoryBriefing(st, meta) {
  const beats = deckBeats(st, meta);
  S.briefing = true;
  S.skipBriefing = false;
  Object.keys(S.chars).forEach(stopIdle);             // 导读期人物静止（首帧）
  Object.values(S.chars).forEach((c) => setFrame(c.el.querySelector('.sprite'), 0));
  $('#story-deck').classList.add('briefing');
  $('#deck-status').textContent = '主持人讲述中';
  renderDeckDots(beats.length);
  for (let i = 0; i < beats.length && !S.aborted && !S.skipStory; i++) {
    await waitForFlow();
    showDeckSlide(beats, i);
    await hostSay(beats[i].narration, { inDeck: true });
    if (S.skipBriefing) break;
  }
  S.briefing = false;
  enterDebateDeck(st, meta);
}

// 统一的幻灯片状态：S.deckBeats + S.deckPage，导读与自由翻页共用一套
// 换配图：没有图就整块收起，避免出现空的灰色占位
function setDeckImage(src) {
  const box = $('#deck-visual');
  const img = $('#deck-img');
  if (!src) { box.classList.add('empty'); img.removeAttribute('src'); return; }
  box.classList.remove('empty');
  if (img.getAttribute('src') !== src) {
    img.classList.add('swapping');
    img.src = src;
    img.onload = () => img.classList.remove('swapping');
  }
}

function renderDeckPage() {
  const beats = S.deckBeats;
  if (!beats || !beats.length) return;
  const i = Math.max(0, Math.min(beats.length - 1, S.deckPage));
  S.deckPage = i;
  const beat = beats[i];
  $('#deck-title').textContent = beat.title;
  $('#deck-narrative').textContent = beat.caption || beat.narration;
  setDeckImage(beat.img);
  document.querySelectorAll('#deck-dots i').forEach((dot, idx) => dot.classList.toggle('on', idx === i));
  $('#deck-phase').textContent = S.briefing ? `故事导读 ${i + 1}/${beats.length}` : `第 ${i + 1}/${beats.length} 页`;
  $('#btn-deck-prev').disabled = i === 0;
  $('#btn-deck-next').disabled = i === beats.length - 1;
}

function flipDeck(delta) {
  if (!S.deckBeats.length) return;
  S.deckPage += delta;
  renderDeckPage();
  if (!S.briefing) $('#deck-status').textContent = '回看故事';
}

function showDeckSlide(beats, i) {
  S.deckBeats = beats;
  S.deckPage = i;
  renderDeckPage();
}

function renderDeckDots(n) {
  $('#deck-dots').innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
}

function enterDebateDeck(st, meta) {
  $('#story-deck').classList.remove('briefing');
  $('#screen-table').classList.add('debating');
  // 故事各页 + 末页「当前议题」，辩论期可随时左右翻回去看
  const pages = [...deckBeats(st, meta), {
    title: S.escalated ? '议题升级' : st.focal,
    narration: S.escalated ? meta.escalation.replace(/^议题升级——/, '') : meta.scene,
    img: panelSrc(st, 2),
  }];
  S.deckBeats = pages;
  S.deckPage = pages.length - 1;
  renderDeckDots(pages.length);
  renderDeckPage();
  $('#deck-status').textContent = '开席论辩';
}

function slateUpgrade(meta) {
  $('#deck-phase').textContent = '议题升级';
  $('#deck-status').textContent = '条件已改变';
  $('#deck-title').textContent = '原来的判断，还站得住吗？';
  $('#deck-narrative').textContent = meta.escalation.replace(/^议题升级——/, '');
  $('#deck-narration-name').textContent = '议题升级';
  $('#deck-narration-text').textContent = meta.escalation.replace(/^议题升级——/, '');
}

// ── 回看导读：随时翻回 PPT，自动暂停辩论 ──

// ═══ 辩论圈 ═══
function lastActualPhilosopher() {
  for (let i = S.storyTranscript.length - 1; i >= 0; i--) {
    const item = S.storyTranscript[i];
    if (S.panel.includes(item.who) && item.text) return item.who;
  }
  return null;
}

async function circle(st, meta) {
  const pool = [...S.order];                       // 本轮每人仍只说一次，但顺序由抢麦决定
  let pos = 0;
  while (pool.length && !S.aborted && !S.skipStory) {
    await waitForFlow();
    const responded = await drainUser(st, pos);
    if (S.aborted || S.skipStory) return;
    if (responded) {
      const at = pool.indexOf(responded);
      if (at >= 0) pool.splice(at, 1);
      if (!pool.length) break;
    }
    await waitForFlow();
    const id = S.grabbed && pool.includes(S.grabbed) ? S.grabbed : grabMic(pool, lastSpeechText());
    S.grabbed = null;
    pool.splice(pool.indexOf(id), 1);
    const previous = lastActualPhilosopher();
    const relation = pos === 0 ? (S.escalated ? 'reconsider' : 'open_view') : (pos % 2 ? 'build_on' : 'challenge');
    await speak(id, st, {
      relation,
      replyTo: previous ? CAST[previous].name : '当前情境',
      // 本句文本一到手就抢下一位并预取，发言间隙才压得住
      pickNext: pool.length ? (text) => {
        const nid = grabMic(pool, text);
        S.grabbed = nid;
        return { id: nid, relation: (pos + 1) % 2 ? 'build_on' : 'challenge', replyTo: CAST[id].name };
      } : null,
    });
    pos++;
  }
  if (!S.skipStory) await drainUser(st, 0);
}

async function drainUser(st, circlePos) {
  let last = null;
  while (S.pendingUser && !S.aborted) {
    const u = S.pendingUser; S.pendingUser = null;
    pushLine('user', '你', u.text);
    S.userLines.push(u.text);
    invalidatePrefetch();
    const responder = u.target || S.order[circlePos % S.order.length];
    const turnP = fetchTurn(responder, st, u.text, null, 'direct_response', '玩家');
    if (S.chars.player) {
      S.playerBusy = true;
      focusChar('player', true);
      showBubble('player', u.text);
      setSpriteVer('player', 'b');                    // 执笔发言
      startAnim('player');
      await sleep(Math.min(2600, readTime(u.text) * 0.5));
      stopAnim();
      focusChar('player', false);
      S.playerBusy = false;
    }
    await speak(responder, st, { userText: u.text, relation: 'direct_response', replyTo: '玩家', turnPromise: turnP });
    last = responder;
  }
  return last;
}

// ═══ 单次发言 ═══
async function speak(id, st, opts = {}) {
  const c = S.chars[id];
  if (!c) return;
  showThink(id, true);

  let turn;
  const key = pfKey(id);
  if (opts.turnPromise) turn = await opts.turnPromise;
  else if (!opts.userText && S.prefetch[key]) turn = await S.prefetch[key];
  else turn = await fetchTurn(id, st, opts.userText, null, opts.relation, opts.replyTo);
  delete S.prefetch[key];
  showThink(id, false);
  if (S.aborted || !turn || !turn.text) return;
  await waitForFlow();

  if (opts.pickNext && !S.pendingUser) {
    const next = opts.pickNext(turn.text);
    if (next) {
      S.prefetch[pfKey(next.id)] = fetchTurn(
        next.id,
        st,
        null,
        [...S.storyTranscript, { who: id, name: CAST[id].name, text: turn.text }],
        next.relation,
        next.replyTo,
      );
    }
  }

  pushLine(id, CAST[id].name, turn.text);
  recordRelationship(id, turn);
  S.lastSpeakers.unshift(id);
  S.lastSpeakers = S.lastSpeakers.slice(0, 2);
  S.skipTurn = false;
  focusChar(id, true);
  showBubble(id, turn.text);
  setSpriteVer(id, randVer());
  startAnim(id);
  $('#btn-interrupt').classList.add('on');
  S.interruptFlag = false;

  if (canPlayAudio()) {
    const wav = turn.wav || await fetchTTS(id, turn.text);
    if (wav && !S.interruptFlag && !S.aborted && !S.skipTurn && canPlayAudio()) await playAudio(wav);
    else if (!S.skipTurn) await sleep(readTime(turn.text));
  } else if (!S.skipTurn) {
    await typewriterWait(turn.text);
  }

  $('#btn-interrupt').classList.remove('on');
  stopAnim();
  if (S.interruptFlag) $('#bubble').classList.add('interrupted');
  else if (!S.skipTurn) await sleep(300);
  S.skipTurn = false;
  hideBubble();
  focusChar(id, false);
}

function pfKey(id) { return `${id}|${S.storyIdx}|${S.escalated}|${S.pfGen || 0}`; }
function invalidatePrefetch() { S.prefetch = {}; S.pfGen = (S.pfGen || 0) + 1; }

function recordRelationship(speaker, turn) {
  S.relationshipLedger.recent.push({ speaker, address: turn.address || null, move: turn.move || 'build' });
  S.relationshipLedger.recent = S.relationshipLedger.recent.slice(-6);
}

S.ttsCache = new Map();
// 串行预热：同时并发多条会被上游 TTS 限流，失败后退化成静音等待（听感就是"主持人卡住"）
function warmHostQueue(lines) {
  const queue = lines.filter(Boolean);
  S.warmChain = (S.warmChain || Promise.resolve());
  queue.forEach((line) => {
    S.warmChain = S.warmChain.then(() => warmTTS('host', line)).catch(() => null);
  });
}

function warmTTS(who, text) {
  const k = who + '|' + text;
  if (!S.ttsCache.has(k)) {
    const p = (who === 'host' ? fetchHostTTS(text) : fetchTTS(who, text)).catch(() => null);
    S.ttsCache.set(k, p);
  }
  return S.ttsCache.get(k);
}

async function fetchTurn(id, st, userText, transcriptOverride, relation, replyTo) {
  try {
    const turnTranscript = transcriptOverride || S.storyTranscript;
    const r = await fetch('/api/game/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        persona: id, story: st.id, escalated: S.escalated,
        transcript: turnTranscript,
        speaker_history: turnTranscript.filter((item) => item.who === id).slice(-4),
        user_text: userText || null,
        relation: relation || (userText ? 'direct_response' : 'open_view'),
        reply_to: replyTo || (userText ? '玩家' : '当前情境'),
        panel: S.panel,
        relationship_ledger: S.relationshipLedger,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const payload = await r.json();
    const speech = (payload.speech || '').trim();
    if (payload.pass || !speech) return { text: '', pass: true, action: payload.action || '沉吟片刻', move: 'pass' };
    const out = {
      text: speech,
      action: payload.action || '',
      address: payload.address || null,
      move: payload.move || 'build',
    };
    if (canPlayAudio()) out.wavP = fetchTTS(id, speech);
    if (out.wavP) out.wav = await out.wavP.catch(() => null);
    return out;
  } catch (e) {
    console.error('turn failed', e);
    return { text: LOCAL_FALLBACKS[id] || '这件事不能只凭一句话定论，还要把前因后果一并看清。' };
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
  stopCurrentAudio();                            // 同一时刻只允许一段声音
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (S.audio === a) S.audio = null;
      if (S.finishAudio === finish) S.finishAudio = null;
      URL.revokeObjectURL(url);
      restoreBgm();
      resolve();
    };
    S.audio = a;
    S.finishAudio = finish;
    duckBgm();
    a.onended = a.onerror = finish;
    a.play().catch(finish);
  });
}

function canPlayAudio() { return !S.audioMuted; }
function stopCurrentAudio() {
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.finishAudio) S.finishAudio();
}
function toggleMute() {
  S.audioMuted = !S.audioMuted;
  if (S.audioMuted) stopSeatPreview();
  if (S.audioMuted) { stopCurrentAudio(); stopBgm(); }
  else startBgm();
  const btn = $('#btn-mute');
  btn.querySelector('.control-signet').textContent = S.audioMuted ? '静音' : '声音';
  const muteLabel = btn.querySelector('.control-label');
  if (muteLabel) muteLabel.textContent = S.audioMuted ? '已开启' : '开启';
  btn.classList.toggle('muted', S.audioMuted);
  btn.title = S.audioMuted ? '开启声音' : '关闭声音';
}

// ── BGM（移植）：园林底噪，念白时自动闪避 ──
function startBgm() {
  if (S.audioMuted) return;
  if (!S.bgm) {
    S.bgm = new Audio('/static/assets/audio/analects-calm-bgm.wav');
    S.bgm.loop = true;
  }
  S.bgm.volume = 0.09;
  S.bgm.play().catch(() => {});
}
function duckBgm() { if (S.bgm && !S.bgm.paused) S.bgm.volume = 0.03; }
function restoreBgm() { if (S.bgm && !S.bgm.paused && !S.paused) S.bgm.volume = 0.09; }
function stopBgm() { if (S.bgm) S.bgm.pause(); }

function readTime(text) { return Math.max(2200, text.length * 145); }

async function typewriterWait(text) {
  const el = $('#bubble-text');
  el.textContent = '';
  for (let i = 0; i <= text.length && !S.interruptFlag && !S.aborted; i++) {
    el.textContent = text.slice(0, i);
    await sleep(55);
  }
  el.textContent = text;
  if (!S.interruptFlag) await sleep(900);
}

// ═══ 主持人（台词落在卷轴下沿的讲述栏）═══
async function hostSay(text, opts = {}) {
  if (S.aborted) return;
  await waitForFlow();
  pushLine('host', '主持人', text);
  $('#deck-narration-name').textContent = '主持人';
  $('#deck-narration-text').textContent = text;
  $('#deck-status').textContent = '主持人讲述中';
  $('#deck-narration').classList.add('speaking');
  if (canPlayAudio()) {
    let wav = await warmTTS('host', text);
    if (!wav) {                                  // 预热失败（多为上游限流）→ 就地重来一次
      S.ttsCache.delete('host|' + text);
      wav = await fetchHostTTS(text).catch(() => null);
    }
    if (wav && !S.aborted && canPlayAudio()) await playAudio(wav);
    else await sleep(readTime(text) * 0.8);
  } else {
    await sleep(readTime(text) * 0.8);
  }
  $('#deck-narration').classList.remove('speaking');
  if (!S.briefing) $('#deck-status').textContent = S.escalated ? '议题升级' : '辩论进行中';
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

// ═══ cue 玩家（挂牌落在玩家头顶）═══
async function userWindow(cueText, st) {
  await hostSay(cueText);
  refreshSuggestions(st, 'host_question', cueText);
  const cueEl = $('#user-cue');
  positionCue();
  cueEl.classList.add('on');
  S.cueSkip = false;
  openSpeechTray(true);
  for (let t = 15; t > 0; t--) {
    $('#cue-count').textContent = t;
    if (S.pendingUser || S.cueSkip || S.aborted || S.skipStory) break;
    if (S.inputHold && $('#user-input').value.trim()) { await sleep(1000); t++; continue; }  // 打字中不倒数
    await sleep(1000);
  }
  cueEl.classList.remove('on');
  if (!S.pendingUser && !$('#user-input').value.trim()) openSpeechTray(false, false);
  await drainUser(st, 0);
}

function positionCue() {
  const c = S.chars.player;
  if (!c) return;
  const a = headAnchor('player');
  const cue = $('#user-cue');
  cue.style.left = Math.max(8, Math.min(a.x - 80, a.stageR.width - 190)) + 'px';
  cue.style.top = Math.max(8, a.visualR.top - a.stageR.top - 92) + 'px';
}

// ═══ 插话（立即截停当前发言，移植自协作版）═══
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
  S.interruptFlag = true;
  stopCurrentAudio();
  hideBubble();
  showThink(null, false);
  openSpeechTray(false, false);
  if (S.cueTarget) cuePhilosopher(S.cueTarget);
}

// 跳过当前这一位的发言（不打断流程，直接换下一位）
function skipCurrentTurn() {
  if (!S.running) return;
  S.skipTurn = true;
  stopCurrentAudio();
}

// 跳过本篇故事，直接进入下一篇
function skipCurrentStory() {
  if (!S.running) return;
  S.skipStory = true;
  S.skipBriefing = true;
  stopCurrentAudio();
  S.flowWaiters.splice(0).forEach((r) => r());
}

function doInterrupt() {
  S.interruptFlag = true;
  stopCurrentAudio();
  openSpeechTray(true);
}

// ═══ 暂停 / 输入即停（移植）═══
function togglePause(force) {
  if (!S.running || S.aborted) return;
  S.paused = typeof force === 'boolean' ? force : !S.paused;
  const btn = $('#btn-pause');
  btn.classList.toggle('paused', S.paused);
  btn.querySelector('.control-signet').textContent = S.paused ? '继续' : '暂停';
  const pauseLabel = btn.querySelector('.control-label');
  if (pauseLabel) pauseLabel.textContent = S.paused ? '会议' : '流程';
  btn.title = S.paused ? '继续' : '暂停';
  $('#screen-table').classList.toggle('game-paused', S.paused);
  if (S.paused) {
    if (S.audio && !S.audio.paused) S.audio.pause();
    if (S.bgm && !S.bgm.paused) S.bgm.volume = 0.03;
    return;
  }
  if (S.audio?.paused) S.audio.play().catch(() => {});
  restoreBgm();
  S.flowWaiters.splice(0).forEach((r) => r());
}

function holdFlowForInput() {
  if (!S.running || S.aborted) return;
  openSpeechTray(true, false);
  S.inputHold = true;
}
function releaseFlowOnBlur() {
  if (!$('#user-input').value.trim() && !S.pendingUser) setInputHold(false);
}
function setInputHold(active) {
  S.inputHold = active;
  if (!active && !S.paused) S.flowWaiters.splice(0).forEach((r) => r());
}
async function waitForFlow() {
  while ((S.paused || S.inputHold) && !S.aborted) {
    await new Promise((r) => S.flowWaiters.push(r));
    await sleep(120);
  }
}

// ═══ AI 推荐发言（移植·精简版）═══
async function refreshSuggestions(st, phase = 'source', hostQuestion = '') {
  const list = $('#suggestion-list');
  const token = ++S.suggestionToken;
  try {
    const r = await fetch('/api/game/suggestions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        story: st.id, phase, host_question: hostQuestion || null,
        transcript: S.storyTranscript,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { suggestions } = await r.json();
    if (S.aborted || token !== S.suggestionToken) return;
    list.replaceChildren();
    (suggestions || []).slice(0, 3).forEach((text) => {
      const b = document.createElement('button');
      b.className = 'suggestion';
      b.textContent = text;
      b.onclick = () => { $('#user-input').value = text; $('#user-input').focus(); holdFlowForInput(); };
      list.appendChild(b);
    });
  } catch (e) {
    if (token === S.suggestionToken) list.replaceChildren();
  }
}

// ═══ 语音输入 ═══
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
    holdFlowForInput();
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
  });
}

// 聆听：固定静态素材。只有真正发言时才切换到 a/b 动画版本。
function startIdle(id) {
  const c = S.chars[id];
  if (!c) return;
  stopIdle(id);
  c.idleVer = c.idleVer || (Math.random() < 0.5 ? 'ia' : 'ib');
  setSpriteVer(id, c.idleVer);
  const sp = c.el.querySelector('.sprite');
  setFrame(sp, 0);
}
function stopIdle(id) {
  const c = S.chars[id];
  if (c && c.idleTimer) { clearInterval(c.idleTimer); c.idleTimer = null; }
}

function startAnim(id) {
  stopAnim();
  stopIdle(id);
  S.talkingId = id;
  const sp = S.chars[id].el.querySelector('.sprite');
  let t = 0;
  S.animTimer = setInterval(() => { setFrame(sp, pingpong(++t)); }, 125);
}
function stopAnim() {
  clearInterval(S.animTimer);
  S.animTimer = null;
  if (S.talkingId) {
    if (S.briefing) setFrame(S.chars[S.talkingId]?.el.querySelector('.sprite'), 0);
    else startIdle(S.talkingId);
    S.talkingId = null;
  }
}

function headAnchor(id) {
  const stageR = $('#stage').getBoundingClientRect();
  const spR = S.chars[id].el.querySelector('.sprite').getBoundingClientRect();
  return {
    x: spR.left - stageR.left + spR.width / 2,
    top: stageR.bottom - spR.top,
    stageR, visualR: spR,
  };
}

function showBubble(id, text) {
  const a = headAnchor(id);
  const b = $('#bubble');
  $('#bubble-name').textContent = CAST[id].name;
  $('#bubble-name').style.color = CAST[id].color;
  $('#bubble-text').textContent = text;
  b.classList.remove('interrupted');
  // 气泡资产的箭头在底边正中：动态收窄边缘气泡，保证中心点仍对准头部。
  const edgeRoom = Math.min(a.x - 8, a.stageR.width - a.x - 8);
  const idealWidth = Math.max(280, Math.min(370, 240 + text.length * 2));
  const width = Math.max(260, Math.min(idealWidth, edgeRoom * 2));
  b.style.width = width + 'px';
  b.style.left = (a.x - width / 2) + 'px';
  b.style.top = 'auto';
  b.style.bottom = (a.stageR.height - (a.visualR.top - a.stageR.top) + 7) + 'px';
  b.classList.add('on');
}
function hideBubble() { $('#bubble').classList.remove('on'); }

function showThink(id, on) {
  const t = $('#think');
  if (!on) { t.classList.remove('on'); return; }
  const a = headAnchor(id);
  t.style.left = Math.max(10, Math.min(a.x + 20, a.stageR.width - 104)) + 'px';
  t.style.top = 'auto';
  t.style.bottom = (a.stageR.height - (a.visualR.top - a.stageR.top) - 30) + 'px';
  t.classList.add('on');
}

// ═══ 记录 ═══
function pushLine(who, name, text) {
  const line = { who, name, text };
  S.transcript.push(line);
  if (S.running && S.storyIdx < STORIES.length) S.storyTranscript.push(line);
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
  $('#screen-table').classList.remove('debating');
  stopCurrentAudio();
  stopBgm();
  S.flowWaiters.splice(0).forEach((r) => r());
  showReport();
}

async function showReport() {
  S.running = false;
  stopBgm();
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
    <div class="report-scroll">
      <div class="report-card">
        <h2>哲学画像</h2>
        <div class="report-sub">稷下·论语圆桌 · 听审记录</div>
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
      </div>
    </div>`;
}

boot();
