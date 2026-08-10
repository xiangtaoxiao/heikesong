import { writeFileSync } from 'fs';
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
await ev(`document.querySelector('#btn-to-select').click(); true`);
await new Promise(r=>setTimeout(r,700));
await ev(`const c=[...document.querySelectorAll('.pick-card')]; c[1].click(); c[4].click(); document.querySelector('#btn-start-game').click(); true`);

const seen=[];
for (let k=0;k<26;k++){
  await new Promise(r=>setTimeout(r,5000));
  const st=await ev(`JSON.stringify({p:S.deckPage+1, n:S.deckBeats.length, brief:S.briefing, title:document.querySelector('#deck-title').textContent, host:(document.querySelector('#deck-narration-text').textContent||'').slice(0,20)})`);
  if(!seen.length || seen[seen.length-1]!==st){ seen.push(st); console.log(`+${(k+1)*5}s`, st); }
  if(!JSON.parse(st).brief && JSON.parse(st).p===JSON.parse(st).n){ break; }
}
const d=await s('Page.captureScreenshot',{format:'png'});
writeFileSync('/tmp/topic-page.png', Buffer.from(d.data,'base64'));
console.log('错误:', errs.length?errs.slice(0,3).join(' | '):'（无）');
ws.close();
