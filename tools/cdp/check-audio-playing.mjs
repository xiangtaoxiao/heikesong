// 真实浏览器验证：声音是否真的在播（检查 Audio 元素状态，而不是只看有没有调用）
const b='http://127.0.0.1:9222';
const t=(await (await fetch(`${b}/json/list`)).json()).find(x=>x.type==='page');
const ws=new WebSocket(t.webSocketDebuggerUrl); let i=0; const p=new Map(); const errs=[];
const s=(m,q={})=>new Promise(r=>{const n=++i;p.set(n,r);ws.send(JSON.stringify({id:n,method:m,params:q}))});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
  if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}
  else if(m.method==='Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description?.slice(0,120));});
await new Promise(r=>ws.addEventListener('open',r));
await s('Runtime.enable'); await s('Page.enable');
await s('Network.enable'); await s('Network.setCacheDisabled',{cacheDisabled:true});
await s('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await s('Page.navigate',{url:'http://127.0.0.1:8001/game?t='+Date.now()});
await new Promise(r=>setTimeout(r,2500));
const ev=async x=>(await s('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true}))?.result?.value;
console.log('开场自检:', await ev(`document.querySelector('#health-note').textContent`));
await ev(`document.querySelector('#btn-to-select').click(); true`);
await new Promise(r=>setTimeout(r,700));
await ev(`const c=[...document.querySelectorAll('.pick-card')]; c[1].click(); document.querySelector('#btn-start-game').click(); true`);
for (let k=0;k<5;k++){
  await new Promise(r=>setTimeout(r,6000));
  console.log(`+${(k+1)*6}s`, await ev(`JSON.stringify({
    audioUnavailable: !!S.audioUnavailable,
    playing: S.audio ? {paused:S.audio.paused, t:+S.audio.currentTime.toFixed(1), dur:+(S.audio.duration||0).toFixed(1), vol:S.audio.volume} : null,
    bgm: S.bgm ? {paused:S.bgm.paused, vol:+S.bgm.volume.toFixed(3)} : null,
    notice: (document.querySelector('#sys-notice')||{}).textContent || ''
  })`));
}
console.log('错误:', errs.length?errs.slice(0,3).join(' | '):'（无）');
ws.close();
