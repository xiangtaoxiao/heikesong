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
const CUE_SECONDS = 60;                              // 轮到玩家时给他多久（打字或录音期间不倒数）
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
];
let STORY_META = {};

// ─── 全局状态 ───
const S = {
  panel: [], storyIdx: 0, escalated: false,
  transcript: [], storyTranscript: [], relationshipLedger: { recent: [] }, userLines: [],
  pendingUser: null, cueTarget: null,
  interruptFlag: false, recording: false, hostSpeaking: false,
  audioMuted: false,
  running: false, aborted: false, briefing: false, skipBriefing: false,
  paused: false, inputHold: false, flowWaiters: [], // 暂停/输入即停（移植）
  suggestionToken: 0,
  audio: null, finishAudio: null, ambient: null, bgm: null,
  seatPreview: null,
  animTimer: null,
  prefetch: {}, chars: {},
  lastSpeakers: [], lastPhilosopherTurn: null, skipTurn: false, skipStory: false, deckPage: 0, deckBeats: [],
  report: null, shareToken: null, shareUrl: null,
};

// ═══ 启动 ═══
async function boot() {
  try {
    const r = await fetch('/api/game/stories');
    STORY_META = await r.json();
  } catch { STORY_META = null; }
  $('#health-note').textContent = STORY_META ? '● 语音房已就绪（Haiku × Qwen-TTS）' : '◌ 剧场配置缺失';
  fetch('/api/game/health').then((r) => r.json()).then((h) => {
    if (!h) return;
    const left = h.left_usd;
    if (h.ok === false) {
      $('#health-note').textContent = `◌ 上游不可用：${h.reason || '未知'}——语音与对话将退化为预置内容`;
      S.audioUnavailable = true;
    } else if (typeof left === 'number') {
      $('#health-note').textContent = `● 语音房已就绪（Haiku × Qwen-TTS）· 剩余额度 $${left}`
        + (left < 5 ? '（偏低，注意随时可能用尽）' : '');
    }
  }).catch(() => {});
  renderStorySummary();

  $('#btn-to-select').onclick = () => { renderPick(); show('#screen-select'); };
  $('#btn-start-game').onclick = startGame;
  $('#btn-send').onclick = submitUser;
  const inp = $('#user-input');
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitUser();
    // 空输入框按退格：像聊天软件那样先删掉 @ 标签
    if (e.key === 'Backspace' && !inp.value && S.cueTarget) cuePhilosopher(S.cueTarget);
  });
  inp.addEventListener('focus', () => { $('#input-shell').classList.add('focused'); holdFlowForInput(); });
  inp.addEventListener('blur', () => { $('#input-shell').classList.remove('focused'); releaseFlowOnBlur(); });
  inp.addEventListener('input', () => { if (inp.value.trim()) holdFlowForInput(); });
  const mentionClear = $('#mention-clear');
  if (mentionClear) mentionClear.onclick = () => { if (S.cueTarget) cuePhilosopher(S.cueTarget); };
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
  updateSpeakGate();                                 // 未开席前发言控件保持禁用
  window.addEventListener('resize', () => layoutChars(true));
  // 环境音：先尝试自动启动，浏览器拦截时用首次交互兜底
  const bootTrack = () => {
    switchTrack(currentTrackId());
    document.removeEventListener('pointerdown', bootTrack);
    document.removeEventListener('click', bootTrack);
    document.removeEventListener('keydown', bootTrack);
    document.removeEventListener('touchend', bootTrack);
  };
  document.addEventListener('pointerdown', bootTrack);
  document.addEventListener('click', bootTrack);
  document.addEventListener('keydown', bootTrack);
  document.addEventListener('touchend', bootTrack);
  startTrack(currentTrackId());                      // 允许自动播放的浏览器首页即出声
  loadSfx();
  document.addEventListener('pointerdown', (e) => {  // 按下瞬间发声，不等抬起
    const el = e.target.closest('button');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const hit = sfxForButton(el);
    if (hit) playSfx(hit[0], hit[1], 1);
  }, true);
  document.addEventListener('keydown', (e) => {      // 键盘 Enter/Space 触发时补一声
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('button');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const hit = sfxForButton(el);
    if (hit) playSfx(hit[0], hit[1], 1);
  }, true);
  // 开场问候与选人无关：页面一加载就开始生成并合成语音，入席时零等待
  S.welcomeP = fetchWelcome().then((t) => {
    warmTTS('host', t);
    if (STORY_META && STORY_META.opening) warmTTS('host', STORY_META.opening);
    return t;
  });

  const sharedToken = new URLSearchParams(location.search).get('report');
  if (sharedToken) {
    await showSharedReport(sharedToken);
    return;
  }

  // 开发直达：#select / #table=kongzi,socrates（只摆台）/ 加 demo=speech 演示发言
  const h = location.hash;
  if (h === '#select') { renderPick(); show('#screen-select'); }
  else if (h.startsWith('#table=')) {
    S.panel = h.slice(7).split('&')[0].split(',').filter((x) => CAST[x] && x !== 'player');
    show('#screen-table');
    mountChars();
    S.running = true; updateSpeakGate();             // 直达调试台也让发言控件可用
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
  list.innerHTML = `<span class="ss-label">今晚三篇</span>${STORIES.map((story, index) =>
    `<span class="ss-item"><em>${index + 1}.</em> ${story.title}<i>${story.source.replace(/[《》]/g, '')}</i></span>`
  ).join('')}`;
}

// ═══ 发言闸门 ═══
// 主持人讲述与导读期是他的场子，玩家不该插话——这时把发言入口直接禁掉，
// 而不是让他打完字才发现没人接。打断正在发言的哲学家仍然允许，那是本作的核心机制。
function canUserSpeak() {
  return S.running && !S.aborted && !S.briefing && !S.hostSpeaking;
}

function updateSpeakGate() {
  const off = !canUserSpeak();
  [$('#btn-speak-open'), $('#btn-send'), $('#btn-mic'), $('#btn-interrupt'), $('#user-input')]
    .forEach((el) => { if (el) el.disabled = off; });
  $('#input-shell')?.classList.toggle('off', off);
  const small = $('#btn-speak-open')?.querySelector('small');
  if (small) small.textContent = !off ? '文字或语音'
    : S.briefing ? '导读中' : S.hostSpeaking ? '主持人讲述中' : '尚未开席';
  if (off) openSpeechTray(false, false);             // 顺带收麦、收托盘
}

// 发言区采用二级托盘：常态收起以节省舞台高度，用户主动发言或被 cue 时展开。
function openSpeechTray(open = true, focus = true) {
  const table = $('#screen-table');
  if (!table) return;
  if (!open && S.recording) micStop(false);           // 托盘收起就别在暗处继续录
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
  restoreTrack();
}

function previewSeatQuote(id) {
  if (S.audioMuted || !SEAT_QUOTES[id]) return;
  stopSeatPreview();
  duckTrack();
  const audio = new Audio(`/static/assets/audio/seat-quotes/${id}.wav`);
  S.seatPreview = audio;
  const finish = () => {
    if (S.seatPreview === audio) {
      S.seatPreview = null;
      restoreTrack();
    }
  };
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
  if (!canUserSpeak()) return;                       // 这会儿不能发言，点名也就无从谈起
  S.cueTarget = S.cueTarget === id ? null : id;
  Object.entries(S.chars).forEach(([pid, c]) => c.el.classList.toggle('cued', pid === S.cueTarget));
  renderMentionChip();
  if (S.cueTarget) $('#user-input').focus();
  if (S.cueTarget) openSpeechTray(true);
}

// 点名做成聊天软件里的「@某人」标签：带角色本色底色，✕ 可直接取消
function renderMentionChip() {
  const chip = $('#mention-chip');
  const inp = $('#user-input');
  chip.classList.toggle('on', !!S.cueTarget);
  if (S.cueTarget) {
    $('#mention-name').textContent = CAST[S.cueTarget].name;   // 「@」是标签里独立的一格
    chip.style.backgroundColor = CAST[S.cueTarget].color;   // 只改底色，CSS 那层压深的渐变还要留着
    inp.placeholder = '想问他什么…';
  } else {
    inp.placeholder = '说出你的想法；点击哲学家可点名提问…';
  }
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
  updateSpeakGate();
  show('#screen-table');
  mountChars();
  switchTrack('bgm');
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
  } catch { return '各位请坐。今晚只聊三样东西：一只羊、一道门、三年时间。东西不大，问题一个比一个难。'; }
}

async function runGame() {
  const welcome = await (S.welcomeP || fetchWelcome());   // 入席时已起跑，这里通常瞬时返回
  const opening = (STORY_META && STORY_META.opening) || '';
  S.deckBeats = [
    {
      title: '稷下 · 论语圆桌',
      narration: '今晚同席：' + S.panel.map((p) => CAST[p].name).join('、') + '，以及旁听的你。今晚共 ' + STORIES.length + ' 篇公案，随时可以插话。',
      img: null,
    },
    { title: '今晚聊什么', narration: opening, img: null },
  ];
  S.deckPage = 0;
  renderDeckDots(S.deckBeats.length);
  renderDeckPage();
  $('#deck-source').textContent = '';
  await hostSay(welcome);
  if (opening) {
    showDeckSlide(S.deckBeats, 1);
    await hostSay(opening);
  }

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
  const slides = meta.guide_slides?.length
    ? meta.guide_slides.map((slide, i) => ({
        title: slide.title,
        caption: [slide.text, slide.quote].filter(Boolean).join(' '),
        narration: slide.narration || slide.text,
        img: panelSrc(st, i),
      }))
    : (meta.briefing?.length ? meta.briefing : [
        { title: st.title, narration: meta.scene },
        { title: '原文线索', narration: meta.original_note },
        { title: '开席之问', narration: meta.host_intro },
      ]).map((b, i) => ({ ...b, img: panelSrc(st, i) }));
  // 第四页：无配图，只摆出要辩的议题——主持人讲到这里就开席
  return [...slides, {
    title: '本篇议题',
    caption: st.focal,
    narration: meta.host_intro,
    img: null,
    topic: true,
  }];
}

function setTheater(st, meta) {
  $('#tb-story').textContent = `第${S.storyIdx + 1}篇《${st.title}》· ${st.source}`;
  $('#orig-source').textContent = st.source;
  $('#orig-text').textContent = meta.original;
  $('#orig-note').textContent = meta.original_note;
  [0, 1, 2].forEach((i) => { new Image().src = panelSrc(st, i); });   // 预载分格，翻页不闪
  S.deckSource = st.source;
}

async function showStoryTransition(nextStory) {
  const curMeta = STORY_META && STORY_META.stories.find((x) => x.id === STORIES[S.storyIdx].id);
  const transition = (curMeta && curMeta.transition_out) || '稍作停顿，让刚才的分歧落定；下一段《论语》正在展开。';
  $('#deck-phase').textContent = '篇章过渡';
  $('#deck-status').textContent = `下一篇 · ${nextStory.source}`;
  $('#deck-title').textContent = `接下来：${nextStory.title}`;
  $('#deck-narrative').textContent = transition;
  await hostSay(transition);
}

async function runStoryBriefing(st, meta) {
  const beats = deckBeats(st, meta);
  S.briefing = true;
  S.skipBriefing = false;
  updateSpeakGate();                                  // 导读是主持人的场子，先关掉发言入口
  Object.keys(S.chars).forEach(stopIdle);             // 导读期人物静止（首帧）
  Object.values(S.chars).forEach((c) => setFrame(c.el.querySelector('.sprite'), 0));
  $('#story-deck').classList.add('briefing');
  $('#deck-status').textContent = '主持人讲述中';
  renderDeckDots(beats.length);
  for (let i = 0; i < beats.length && !S.aborted && !S.skipStory; i++) {
    await waitForFlow();
    showDeckSlide(beats, i);                      // 主持人讲到哪一页，翻页条就自动走到哪一页
    await hostSay(beats[i].narration, { inDeck: true });
    if (S.skipBriefing) break;
    if (i < beats.length - 1) await sleep(320);   // 翻页之间留一口气
  }
  showDeckSlide(beats, beats.length - 1);         // 收在议题页
  S.briefing = false;
  updateSpeakGate();                              // 开席，发言入口解禁
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
  $('#deck-source').textContent = beat.topic ? '' : (S.deckSource || '');
  $('#story-deck').classList.toggle('topic-page', !!beat.topic);
  setDeckImage(beat.img);
  document.querySelectorAll('#deck-dots i').forEach((dot, idx) => dot.classList.toggle('on', idx === i));
  $('#deck-phase').textContent = `${i + 1} / ${beats.length}`;
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
  const pages = deckBeats(st, meta);
  if (S.escalated) {                               // 升级后改写议题页
    const topic = pages[pages.length - 1];
    topic.title = '议题升级';
    topic.caption = meta.escalation.replace(/^议题升级——/, '');
  }
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
    const relation = relationForPosition(pos);
    await speak(id, st, {
      relation,
      replyTo: previous ? CAST[previous].name : '当前情境',
      // 本句文本一到手就抢下一位并预取，发言间隙才压得住
      pickNext: pool.length ? (text) => {
        const nid = grabMic(pool, text);
        S.grabbed = nid;
        return { id: nid, relation: relationForPosition(pos + 1), replyTo: CAST[id].name };
      } : null,
    });
    pos++;
  }
  if (!S.skipStory) await drainUser(st, 0);
  // 第一轮：最后一位哲学家若点名提问了另一位，先让被点名者正面回答，避免问句戛然而止
  if (!S.escalated && !S.aborted && !S.skipStory) await answerPeerFollowup(st);
}

function isAskingTurn(turn) {
  return turn && (turn.move === 'question' || /[？?]\s*$/.test(turn.text || ''));
}

async function answerPeerFollowup(st) {
  const last = S.lastPhilosopherTurn;
  if (!last || !last.address) return;
  if (last.address === last.id || !S.panel.includes(last.address)) return;
  if (!isAskingTurn(last)) return;
  await speak(last.address, st, { relation: 'answer_peer', replyTo: CAST[last.id].name });
}

// 每篇只安排两个轻喜剧节拍：第一圈第三位善意拆台，第二圈第二位回收前文梗。
// 其余轮次仍以承接和挑战为主，避免整桌人都在抢着讲笑话。
function relationForPosition(pos) {
  if (pos === 0) return S.escalated ? 'reconsider' : 'open_view';
  if (!S.escalated && pos === 2) return 'gentle_tease';
  if (S.escalated && pos === 1) return 'callback';
  return pos % 2 ? 'build_on' : 'challenge';
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
  S.lastPhilosopherTurn = { id, address: turn.address || null, move: turn.move || 'build', text: turn.text };
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

function noteAudioFailure(detail = '') {
  S.ttsFailures = (S.ttsFailures || 0) + 1;
  if (S.ttsFailures < 2 || S.audioUnavailable) return;
  S.audioUnavailable = true;                       // 后续一律走文字模式，避免整局静音
  const quota = /额度|quota|402/.test(detail);
  showSystemNotice(quota
    ? '语音额度已用尽——已自动切换为文字模式，对话照常进行'
    : '语音服务暂时不可用——已自动切换为文字模式');
}

function showSystemNotice(text) {
  let el = document.querySelector('#sys-notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sys-notice';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(S.noticeTimer);
  S.noticeTimer = setTimeout(() => el.classList.remove('on'), 9000);
}

async function fetchTTS(id, text) {
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: id, text }),
    });
    if (!r.ok) { noteAudioFailure(String(r.status) + (await r.text().catch(() => ''))); return null; }
    S.ttsFailures = 0;
    return await r.blob();
  } catch (e) { noteAudioFailure(''); return null; }
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
      restoreTrack();
      resolve();
    };
    S.audio = a;
    S.finishAudio = finish;
    duckTrack();
    a.onended = a.onerror = finish;
    a.play().catch(finish);
  });
}

function canPlayAudio() { return !S.audioMuted && !S.audioUnavailable; }
function stopCurrentAudio() {
  if (S.audio) { try { S.audio.pause(); } catch {} }
  if (S.finishAudio) S.finishAudio();
}
function toggleMute() {
  S.audioMuted = !S.audioMuted;
  if (S.audioMuted) stopSeatPreview();
  if (S.audioMuted) {
    stopCurrentAudio();
    Object.keys(TRACKS).forEach((id) => stopTrack(id));
  } else {
    switchTrack(currentTrackId());
  }
  const btn = $('#btn-mute');
  btn.querySelector('.control-signet').textContent = S.audioMuted ? '静音' : '声音';
  const muteLabel = btn.querySelector('.control-label');
  if (muteLabel) muteLabel.textContent = S.audioMuted ? '已开启' : '开启';
  btn.classList.toggle('muted', S.audioMuted);
  btn.title = S.audioMuted ? '开启声音' : '关闭声音';
}

// ── 音轨：会前环境音（水流鸟鸣） + 游戏音乐，念白时自动闪避 ──
const TRACKS = {
  ambient: { src: '/static/assets/audio/analects-calm-ambient.wav?v=20260811-home-audio-fix', volume: 0.12, duck: 0.04 },
  bgm:     { src: '/static/assets/audio/analects-calm-bgm.wav',     volume: 0.09, duck: 0.03 },
};
function currentTrackId() {
  return $('#screen-table').classList.contains('active') ? 'bgm' : 'ambient';
}
function startTrack(id) {
  if (S.audioMuted) return;
  if (S[id]) { try { S[id].pause(); } catch {} }   // 重建实例，避免被浏览器自动播放策略锁住
  S[id] = new Audio(TRACKS[id].src);
  S[id].loop = true;
  S[id].volume = TRACKS[id].volume;
  S[id].play().catch(() => {});
}
function stopTrack(id) { if (S[id]) S[id].pause(); }
function switchTrack(id) {
  Object.keys(TRACKS).forEach((key) => { if (key !== id) stopTrack(key); });
  startTrack(id);
}
function duckTrack() {
  const id = currentTrackId();
  if (S[id] && !S[id].paused) S[id].volume = TRACKS[id].duck;
}
function restoreTrack() {
  const id = currentTrackId();
  if (S[id] && !S[id].paused && !S.paused) S[id].volume = TRACKS[id].volume;
}

// ── 按钮点击音：重要操作厚重，普通操作轻快 ──
const SFX_FILES = {
  light: '/static/assets/audio/ui/sfx-click-light.wav?v=20260811-sfx-trim',
  heavy: '/static/assets/audio/ui/sfx-click-heavy.wav?v=20260811-sfx-trim',
  share: '/static/assets/audio/ui/sfx-click-share.wav?v=20260811-sfx-trim',
  quick: '/static/assets/audio/ui/sfx-click-quick.wav?v=20260811-sfx-trim',
};
const SFX_BUFFERS = {};
let sfxCtx = null;

function sfxContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sfxCtx) sfxCtx = new AC();
  if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
  return sfxCtx;
}
async function loadSfx() {
  const ctx = sfxContext();
  if (!ctx) return;
  await Promise.all(Object.entries(SFX_FILES).map(async ([key, url]) => {
    try {
      const r = await fetch(url);
      SFX_BUFFERS[key] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {}
  }));
}
function playSfx(key, rate = 1, gain = 1) {
  const ctx = sfxContext();
  const buf = SFX_BUFFERS[key];
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.connect(amp).connect(ctx.destination);
  src.start();
}
function sfxForButton(el) {
  const id = el.id || '';
  if (['btn-to-select', 'btn-start-game', 'btn-send', 'btn-speak-open', 'btn-restart-game'].includes(id)) return ['heavy', 0.85];
  if (['btn-share-report', 'btn-save-report'].includes(id)) return ['share', 1];
  if (id === 'btn-leave') return ['heavy', 0.7];
  if (id === 'btn-interrupt') return ['quick', 1.1];
  if (['btn-deck-next', 'btn-skip-brief', 'btn-skip-cue', 'btn-skip-turn', 'btn-skip-story'].includes(id)) return ['quick', 1.15];
  if (['btn-deck-prev', 'btn-speech-close', 'btn-drawer-close', 'btn-image-close', 'btn-orig-close'].includes(id)) return ['quick', 0.9];
  if (id === 'btn-mute') return ['quick', el.classList.contains('muted') ? 1.2 : 0.8];
  if (id === 'btn-pause') return ['quick', el.classList.contains('paused') ? 1.2 : 0.8];
  if (id === 'btn-mic') return ['quick', el.classList.contains('rec') ? 0.8 : 1.2];
  if (['btn-original', 'btn-original-deck', 'btn-log'].includes(id)) return ['light', 1];
  if (el.classList.contains('suggestion')) return ['light', 1];
  return null;
}

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
const HOST_LINE_PAUSE = 700;                     // 主持人句间留白，听感更自然

async function hostSay(text, opts = {}) {
  if (S.aborted) return;
  await waitForFlow();
  S.hostSpeaking = true;
  updateSpeakGate();                             // 他讲话期间，玩家的发言入口一律禁掉
  pushLine('host', '主持人', text);
  $('#deck-narration-name').textContent = '主持人';
  $('#deck-narration-text').textContent = text;
  $('#deck-status').textContent = '主持人讲述中';
  $('#deck-narration').classList.add('speaking');
  try {
    if (canPlayAudio()) {
      let wav = await warmTTS('host', text);
      if (!wav) {                                // 预热失败（多为上游限流）→ 就地重来一次
        S.ttsCache.delete('host|' + text);
        wav = await fetchHostTTS(text).catch(() => null);
      }
      if (wav && !S.aborted && canPlayAudio()) await playAudio(wav);
      else await sleep(readTime(text) * 0.8);
    } else {
      await sleep(readTime(text) * 0.8);
    }
  } finally {                                    // 播放出错也必须把闸门放开，否则整局都发不了言
    S.hostSpeaking = false;
    updateSpeakGate();
  }
  await sleep(HOST_LINE_PAUSE);
  $('#deck-narration').classList.remove('speaking');
  if (!S.briefing) $('#deck-status').textContent = S.escalated ? '议题升级' : '辩论进行中';
}

async function fetchHostTTS(text) {
  try {
    const r = await fetch('/api/game/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'host', text }),
    });
    if (!r.ok) { noteAudioFailure(String(r.status) + (await r.text().catch(() => ''))); return null; }
    S.ttsFailures = 0;
    return await r.blob();
  } catch (e) { noteAudioFailure(''); return null; }
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
  for (let t = CUE_SECONDS; t > 0; t--) {
    $('#cue-count').textContent = t + ' 秒';
    if (S.pendingUser || S.cueSkip || S.aborted || S.skipStory) break;
    // 打字中或正在录音都不倒数——不能催着玩家把话说完
    if (S.recording || (S.inputHold && $('#user-input').value.trim())) { await sleep(1000); t++; continue; }
    await sleep(1000);
  }
  cueEl.classList.remove('on');
  if (!S.pendingUser && !S.recording && !$('#user-input').value.trim()) openSpeechTray(false, false);
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
  micStop(false);                                     // 录音中直接发送：先收麦，尾巴上的识别结果丢掉
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
    const id = currentTrackId();
    if (S[id] && !S[id].paused) S[id].volume = TRACKS[id].duck;
    return;
  }
  if (S.audio?.paused) S.audio.play().catch(() => {});
  restoreTrack();
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

// ═══ 语音输入：起止由玩家自己按，句中停顿不再被当成说完 ═══
let micStop = () => {};                              // setupMic 里赋真身；供提交/收起托盘时调用

function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#btn-mic');
  const label = $('#mic-label');
  const inp = $('#user-input');
  if (!SR) { btn.title = '此浏览器不支持语音识别，请用 Chrome'; btn.style.opacity = .4; return; }
  const rec = new SR();
  rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = true;   // 停顿不结束
  let settled = '';                                  // 已定稿文本；中间结果只作预览，不覆盖
  let live = false;                                  // 识别结果是否还该写进输入框
  let finalUpto = 0;                                 // 本次识别会话已吃进 settled 的定稿条数，防重复累加
  let timer = null, elapsed = 0;

  const paint = (on) => {
    S.recording = on;
    btn.classList.toggle('rec', on);
    label.textContent = on ? '结束' : '语音';
    btn.title = on ? '点「结束」停止录音，改完再自己按发送' : '语音发言（点一下开始，说完点结束）';
    $('#rec-badge').classList.toggle('on', on);
    if (on) inp.placeholder = '正在听…说完点「结束」';
    else renderMentionChip();                        // 顺带把 placeholder 还原
  };

  const start = () => {
    settled = inp.value;                             // 已经打了字就接着往后加
    live = true; elapsed = 0;
    $('#rec-time').textContent = '0:00';
    paint(true);
    holdFlowForInput();                              // 录音期间流程暂停，话头不会被抢走
    try { rec.start(); } catch {}
    clearInterval(timer);
    timer = setInterval(() => {
      elapsed++;
      $('#rec-time').textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    }, 1000);
  };

  // keep=false 用于提交时收尾：丢掉尾巴上迟到的识别结果，别写回已清空的输入框
  const stop = (keep = true) => {
    if (!S.recording) return;
    live = keep;
    paint(false);
    clearInterval(timer);
    try { rec.stop(); } catch {}
    if (keep) inp.focus();                           // 停下来先给玩家改词的机会，发不发由他定
  };
  micStop = stop;

  rec.onstart = () => { finalUpto = 0; };            // 每段识别会话（含续录）的下标都从 0 重新数
  rec.onresult = (e) => {
    if (!live) return;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r.isFinal) { interim += r[0].transcript; continue; }
      if (i < finalUpto) continue;                   // 同一句定稿只收一次
      settled += r[0].transcript;
      finalUpto = i + 1;
    }
    inp.value = settled + interim;
    holdFlowForInput();
  };
  // 浏览器仍会因静音自行结束；只要玩家还没点「结束」，就无声续录
  rec.onend = () => { if (S.recording) { try { rec.start(); } catch { paint(false); clearInterval(timer); } } };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;         // 交给 onend 续录
    paint(false);
    clearInterval(timer);
    showSystemNotice(e.error === 'not-allowed'
      ? '麦克风未授权——请在地址栏允许麦克风后重试，或直接打字'
      : '语音识别出错了，这一句请改用打字');
  };
  btn.onclick = () => (S.recording ? stop() : start());
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
  d.className = 'dr-item' + (who === 'user' ? ' dr-user' : who === 'host' ? ' dr-host' : ' dr-philosopher');
  const color = CAST[who]?.color || (who === 'user' ? '#33566b' : '#6b705c');
  d.style.setProperty('--dr-accent', color);
  const avatar = document.createElement('div');
  avatar.className = 'dr-avatar';
  if (who === 'host') {
    avatar.classList.add('dr-avatar-host');
    avatar.style.backgroundImage = "url('/static/assets/ui/host-avatar.png')";
  } else {
    avatar.classList.add('dr-avatar-sprite');
    avatar.style.backgroundImage = `url('${SPRITE(who === 'user' ? 'player' : who)}')`;
  }
  avatar.setAttribute('aria-label', `${name}头像`);

  const speaker = document.createElement('div');
  speaker.className = 'dr-name';
  speaker.style.color = color;
  speaker.textContent = name;

  const content = document.createElement('div');
  content.className = 'dr-text';
  content.textContent = text;
  d.append(avatar, speaker, content);
  $('#drawer-body').appendChild(d);
  $('#drawer-body').scrollTop = 1e6;
}

// ═══ 结束 → 报告 ═══
async function endMeeting() {
  S.aborted = true;
  updateSpeakGate();
  $('#screen-table').classList.remove('debating');
  stopCurrentAudio();
  switchTrack('ambient');
  S.flowWaiters.splice(0).forEach((r) => r());
  showReport();
}

async function showReport() {
  S.running = false;
  updateSpeakGate();
  switchTrack('ambient');
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
  renderReport(rep);
}

function fallbackReport() {
  return {
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
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function reportMatchId(rep) {
  return Object.keys(CAST).find((key) => CAST[key].name === rep.match) || 'laozi';
}

function renderReport(rep, token = null) {
  const wrap = $('#report-wrap');
  const matchId = reportMatchId(rep);
  const axes = (rep.axes || []).slice(0, 4).map((axis) => ({ ...axis, value: Math.max(0, Math.min(100, Number(axis.value) || 50)) }));
  S.report = { ...rep, axes };
  S.shareToken = token;
  S.shareUrl = null;
  wrap.innerHTML = `
    <div class="report-scroll">
      <div class="report-card">
        <header class="report-head">
          <h2>哲学画像</h2>
          <div class="report-sub">一份由你的发言生成的听审记录</div>
        </header>
        <section class="report-hero">
          <div class="report-sprite" style="background-image:url('${SPRITE(matchId)}')"></div>
          <div class="report-identity">
            <div class="report-match">你的思路最接近<b style="color:${CAST[matchId].color}">${escapeHtml(rep.match)}</b></div>
            <div class="report-title">${escapeHtml(rep.title || '')}</div>
          </div>
        </section>
        <section class="report-section report-axes" aria-label="思考坐标">
          <h3>你的思考坐标</h3>
          ${axes.map((a) => `
          <div class="axis">
            <div class="axis-labels"><b>${escapeHtml(a.left)}</b><span>${escapeHtml(a.name)}</span><b>${escapeHtml(a.right)}</b></div>
            <div class="axis-bar"><div class="axis-dot" style="left:${a.value}%"></div></div>
          </div>`).join('')}
        </section>
        <section class="report-section report-reading">
          <h3>主持人评语</h3>
          <div class="report-text">${escapeHtml(rep.text || '')}</div>
        </section>
        ${rep.quote ? `<blockquote class="report-quote">${escapeHtml(rep.quote)}</blockquote>` : ''}
        <div class="report-actions">
          <button class="btn-ghost" id="btn-share-report">复制分享链接</button>
          <button class="btn-ghost" id="btn-save-report">保存分享图</button>
          <button class="btn-primary" id="btn-restart-game">再来一局</button>
        </div>
      </div>
    </div>`;
  $('#btn-restart-game').onclick = () => location.assign('/game');
  $('#btn-share-report').onclick = shareReport;
  $('#btn-save-report').onclick = saveReportPoster;
}

async function showSharedReport(token) {
  show('#screen-report');
  const wrap = $('#report-wrap');
  wrap.innerHTML = '<p class="report-loading">正在还原这份哲学画像…</p>';
  try {
    const response = await fetch(`/api/game/share?token=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error('invalid share');
    const payload = await response.json();
    renderReport(payload.report, token);
  } catch {
    wrap.innerHTML = '<div class="report-error">这份分享链接无效、已损坏，或服务器尚未配置分享密钥。</div>';
  }
}

async function ensureShare() {
  if (S.shareToken) return S.shareToken;
  const response = await fetch('/api/game/share', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: S.report, origin: location.origin }),
  });
  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json();
  S.shareToken = payload.token;
  S.shareUrl = payload.url;
  return payload.token;
}

function currentShareUrl(token) {
  const url = new URL('/game', location.origin);
  url.searchParams.set('report', token);
  return url.toString();
}

async function shareReport() {
  try {
    const token = await ensureShare();
    const url = S.shareUrl || currentShareUrl(token);
    await navigator.clipboard.writeText(url);
    $('#btn-share-report').textContent = '链接已复制';
  } catch (error) {
    alert('分享链接创建失败。请在服务器设置 REPORT_SHARE_SECRET 后重试。');
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = [...String(text || '')]; let line = ''; let lines = 0;
  for (const char of chars) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      if (lines === maxLines - 1) { ctx.fillText(`${line}…`, x, y + lines * lineHeight); return y + (lines + 1) * lineHeight; }
      ctx.fillText(line, x, y + lines * lineHeight); line = char; lines++;
    }
    else line += char;
  }
  if (line && lines < maxLines) { ctx.fillText(line, x, y + lines * lineHeight); lines++; }
  return y + lines * lineHeight;
}

function fitText(ctx, text, maxWidth) {
  let t = String(text || '');
  const ellipsis = '…';
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + ellipsis).width > maxWidth) t = t.slice(0, -1);
  return t + ellipsis;
}

async function saveReportPoster() {
  try {
    const token = await ensureShare();
    const [qr, sprite, scroll] = await Promise.all([
      loadImage(`/api/game/share/qr?token=${encodeURIComponent(token)}&origin=${encodeURIComponent(location.origin)}`),
      loadImage(SPRITE(reportMatchId(S.report))), loadImage('/static/assets/ui/report-scroll-transparent.png'),
    ]);
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1520;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#263d39'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scroll, 40, 10, 1000, 1500);
    ctx.fillStyle = '#3f3425'; ctx.font = 'bold 46px serif'; ctx.textAlign = 'center'; ctx.fillText('哲学画像', 540, 300); ctx.textAlign = 'left';
    const role = reportMatchId(S.report); const frameW = sprite.naturalWidth / 5; const frameH = sprite.naturalHeight / 3;
    ctx.drawImage(sprite, 0, 0, frameW, frameH, 270, 335, 150, 167);
    ctx.fillStyle = CAST[role].color; ctx.font = 'bold 38px serif'; ctx.fillText(S.report.match, 465, 390);
    ctx.save(); ctx.translate(465, 425); ctx.rotate(-2 * Math.PI / 180);
    const tagText = S.report.title || '';
    ctx.font = 'bold 28px serif';
    const tagWidth = Math.max(120, Math.ceil(ctx.measureText(tagText).width) + 60);
    ctx.strokeStyle = '#8b4d2d'; ctx.lineWidth = 3;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, tagWidth, 58, 12); ctx.stroke(); }
    else ctx.strokeRect(0, 0, tagWidth, 58);
    ctx.fillStyle = '#8b4d2d'; ctx.textAlign = 'center'; ctx.fillText(fitText(ctx, tagText, tagWidth - 40), tagWidth / 2, 39); ctx.textAlign = 'left'; ctx.restore();
    let y = 550; ctx.fillStyle = '#3f3425'; ctx.font = 'bold 25px serif'; ctx.fillText('你的思考坐标', 240, y); y += 42;
    (S.report.axes || []).forEach((axis) => {
      ctx.fillStyle = '#6b5c40'; ctx.font = '20px serif';
      ctx.textAlign = 'left'; ctx.fillText(fitText(ctx, axis.left, 190), 240, y);
      ctx.textAlign = 'center'; ctx.fillText(fitText(ctx, axis.name, 200), 540, y);
      ctx.textAlign = 'right'; ctx.fillText(fitText(ctx, axis.right, 190), 840, y);
      ctx.textAlign = 'left';
      y += 15;
      ctx.fillStyle = '#d5c9ad'; ctx.fillRect(240, y, 600, 10);
      ctx.fillStyle = '#3d5940'; ctx.beginPath(); ctx.arc(240 + 600 * (axis.value / 100), y + 5, 10, 0, Math.PI * 2); ctx.fill();
      y += 47;
    });
    y += 12;
    ctx.strokeStyle = 'rgba(130, 99, 51, .25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(240, y); ctx.lineTo(840, y); ctx.stroke();
    y += 20;
    ctx.fillStyle = '#3f3425'; ctx.font = 'bold 25px serif'; ctx.fillText('主持人评语', 240, y); y += 36; ctx.font = '21px serif'; y = drawWrappedText(ctx, S.report.text, 240, y, 600, 34, 5) + 20;
    ctx.fillStyle = '#6b5c40'; ctx.font = '18px serif'; y = drawWrappedText(ctx, S.report.quote, 240, y, 600, 28, 2) + 18;
    ctx.save(); ctx.shadowColor = 'rgba(75, 52, 29, .22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#eadbbd'; ctx.fillRect(447, y - 8, 186, 186); ctx.restore();
    ctx.strokeStyle = 'rgba(122, 88, 48, .42)'; ctx.lineWidth = 2; ctx.strokeRect(447, y - 8, 186, 186);
    ctx.drawImage(qr, 455, y, 170, 170);
    ctx.fillStyle = '#6b5c40'; ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.fillText('扫码重访这份画像', 540, y + 195); ctx.textAlign = 'left';
    const link = document.createElement('a'); link.download = `哲学画像-${S.report.match}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  } catch {
    alert('分享图生成失败。请确认服务器已配置 REPORT_SHARE_SECRET。');
  }
}

boot();
