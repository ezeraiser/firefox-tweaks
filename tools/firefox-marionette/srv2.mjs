import http from 'node:http';
http.createServer((req, res) => {
  res.setHeader('content-type','text/html');
  if (req.url.startsWith('/g')) {
    // 120MB+ of short-lived object garbage, ~15MB retained, then idle with a heartbeat
    res.end(`<!doctype html><title>g</title><body><script>
      let keep=[]; 
      (function(){ let a=[]; for (let k=0;k<6;k++) a.push(Array.from({length:400000},(_,i)=>({i,s:'x'+i}))); keep=a[0].slice(0,100000); a=null; })();
      let d=document.createElement('div'); for (let i=0;i<20000;i++){ const e=document.createElement('p'); e.textContent='row '+i; d.appendChild(e);} document.body.appendChild(d); document.body.removeChild(d); d=null;
      setInterval(()=>{document.title='g-'+Date.now()%100000},1000);
    </script>`);
  } else res.end('<!doctype html><title>x</title>');
}).listen(8766, '127.0.0.1');
console.log('listening 8766');
