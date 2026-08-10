// 精确测「文字出现 → 声音开始」的空档（这才是 Eric 说的"要隔四五秒才听到"）
const base = 'http://127.0.0.1:9222';
const tgt = (await (await fetch(`${base}/json/list`)).json()).find((x) => x.type === 'page');
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const p = new Map(); const errs = [];
const send = (m, q = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description?.slice(0,120)); });
await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }))?.result?.value;

await send('Page.navigate', { url: 'http://127.0.0.1:8001/game' });
await new Promise((r) => setTimeout(r, 2500));
await ev(`
  window.__ev=[];
  const _pl=pushLine; pushLine=function(w,n,t){ window.__ev.push({k:'text',t:Date.now(),who:n}); return _pl(w,n,t); };
  const _pa=playAudio; playAudio=function(b){ window.__ev.push({k:'audio',t:Date.now()}); return _pa(b); };
  true`);
await ev(`document.querySelector('#btn-to-select').click(); true`);
await new Promise((r) => setTimeout(r, 6000));   // 模拟真人挑人的时间
await ev(`const c=[...document.querySelectorAll('.pick-card')]; c[1].click(); c[4].click(); document.querySelector('#btn-start-game').click(); window.__t0=Date.now(); true`);
await new Promise((r) => setTimeout(r, 120000));
const { t0, ev: evs } = JSON.parse(await ev(`JSON.stringify({t0:window.__t0, ev:window.__ev})`));
let lastText = null; const gaps = [];
console.log('事件序列（从点开始圆桌算起）:');
evs.forEach((e) => {
  const at = ((e.t - t0) / 1000).toFixed(1);
  if (e.k === 'text') { lastText = e; console.log(`  +${at.padStart(6)}s  文字 ${e.who}`); }
  else { const g = lastText ? (e.t - lastText.t) / 1000 : 0; gaps.push(g); console.log(`  +${at.padStart(6)}s  ▶声音  ← 空档 ${g.toFixed(2)}s`); }
});
if (gaps.length) console.log(`\n文字→声音空档：平均 ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2)}s，最大 ${Math.max(...gaps).toFixed(2)}s`);
console.log('错误:', errs.length ? errs.slice(0,4).join(' | ') : '（无）');
ws.close();
