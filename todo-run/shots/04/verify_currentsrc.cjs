const { chromium } = require('playwright');
(async () => {
  const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 30000);
  const b = await chromium.launch({ args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  const r = await p.evaluate(async () => {
    const sr=8000,n=8000; const buf=new ArrayBuffer(44+n*2); const v=new DataView(buf);
    const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
    const url=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
    const a=new Audio(); const ev=[]; ['emptied','abort','error'].forEach(e=>a.addEventListener(e,()=>ev.push(e)));
    a.src=url; await a.play().catch(e=>ev.push('playerr:'+e.name));
    const before={cs:a.currentSrc,ns:a.networkState,rs:a.readyState};
    a.pause(); a.removeAttribute('src'); a.load();
    const sync={cs:a.currentSrc,ns:a.networkState,rs:a.readyState};
    await new Promise(r=>setTimeout(r,500));
    const later={cs:a.currentSrc,ns:a.networkState,rs:a.readyState,dur:a.duration,err:a.error&&a.error.code};
    return {before,sync,later,ev};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close(); clearTimeout(t);
})();
