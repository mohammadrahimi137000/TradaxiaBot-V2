export function closes(c){return c.map(x=>Number(x.close)).filter(Number.isFinite)}
export function sma(v,p){if(v.length<p)return null;return v.slice(-p).reduce((a,b)=>a+b,0)/p}
export function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let e=v.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
export function rsi(v,p=14){if(v.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}let ag=g/p,al=l/p;for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1],gain=Math.max(d,0),loss=Math.max(-d,0);ag=((ag*(p-1))+gain)/p;al=((al*(p-1))+loss)/p}if(al===0)return 100;return 100-100/(1+ag/al)}
export function atr(c,p=14){if(c.length<=p)return null;const tr=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1];tr.push(Math.max(x.high-x.low,Math.abs(x.high-q.close),Math.abs(x.low-q.close)))}let a=tr.slice(0,p).reduce((x,y)=>x+y,0)/p;for(let i=p;i<tr.length;i++)a=((a*(p-1))+tr[i])/p;return a}
export function macd(v,f=12,s=26,sg=9){if(v.length<s+sg)return null;const line=[];for(let i=s;i<=v.length;i++){const x=v.slice(0,i);line.push(ema(x,f)-ema(x,s))}const signal=ema(line,sg);return {line:line.at(-1),signal,histogram:line.at(-1)-signal}}
export function highest(c,p){return c.length<p?null:Math.max(...c.slice(-p).map(x=>x.high))}
export function lowest(c,p){return c.length<p?null:Math.min(...c.slice(-p).map(x=>x.low))}
