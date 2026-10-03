import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const DATA_URL="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";
const R={SL:-1,TP1:0.8,TP2:1.5,TP3:2.3,TIMEOUT:0};

function parseCsv(t){return t.trim().split(/\r?\n/).slice(1).map(x=>x.split(",")).map(p=>({time:Date.parse(p[0]),open:+p[1],high:+p[2],low:+p[3],close:+p[4],volume:+(p[5]??0)})).filter(c=>Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
function resample(a,m){const ms=m*60000,o=[];let b=null,c=null;for(const x of a){const k=Math.floor(x.time/ms)*ms;if(k!==b){if(c)o.push(c);b=k;c={time:k,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume}}else{c.high=Math.max(c.high,x.high);c.low=Math.min(c.low,x.low);c.close=x.close;c.volume+=x.volume}}if(c)o.push(c);return o}
function ub(a,t){let l=0,h=a.length;while(l<h){const m=(l+h)>>1;if(a[m].time<=t)l=m+1;else h=m}return l}
function snap(a,t){const n=ub(a,t);return a.slice(Math.max(0,n-500),n)}
function evalTrade(d,r,f){const tp=r.takeProfits.map(x=>x.price);let hit=0,outcome="TIMEOUT";for(const c of f){if(d.signal==="BUY"){if(c.low<=r.stopLoss){outcome="SL";break}if(c.high>=tp[2]){outcome="TP3";break}if(c.high>=tp[1])hit=Math.max(hit,2);if(c.high>=tp[0])hit=Math.max(hit,1)}else{if(c.high>=r.stopLoss){outcome="SL";break}if(c.low<=tp[2]){outcome="TP3";break}if(c.low<=tp[1])hit=Math.max(hit,2);if(c.low<=tp[0])hit=Math.max(hit,1)}}if(outcome==="TIMEOUT"&&hit)outcome="TP"+hit;return{outcome,rMultiple:R[outcome]??0}}
function applyMode(m,mode){for(const tf of ["15min","5min"]){const p=m.frames[tf]?.pinBar;if(!p)continue;if(mode==="none")p.confirmedBias=0;else if(mode==="level")p.confirmedBias=p.levelConfirmed?p.bias:0;else if(mode==="candle")p.confirmedBias=p.candleConfirmed?p.bias:0;else p.confirmedBias=p.confirmed?p.bias:0}return m}
const raw=await (await fetch(DATA_URL)).text(),m5=parseCsv(raw);
const multi={"5min":m5,"15min":resample(m5,15),"30min":resample(m5,30),"1h":resample(m5,60)};
const primary=multi["15min"],modes=["none","level","candle","both"],out={};
for(const mode of modes){const trades=[];for(let i=80;i+20<primary.length;i+=4){const t=primary[i].time;const market=applyMode(analyzeMarket({"1h":snap(multi["1h"],t),"30min":snap(multi["30min"],t),"15min":snap(multi["15min"],t),"5min":snap(multi["5min"],t)}),mode);const decision=makeDecision(market);const risk=calculateRisk(decision,market);if(!risk.active)continue;trades.push(evalTrade(decision,risk,primary.slice(i+1,i+21)))}const wins=trades.filter(x=>x.outcome.startsWith("TP")).length,net=trades.reduce((s,x)=>s+x.rMultiple,0);out[mode]={totalSignals:trades.length,wins,sl:trades.filter(x=>x.outcome==="SL").length,timeout:trades.filter(x=>x.outcome==="TIMEOUT").length,winRate:trades.length?+(wins/trades.length*100).toFixed(2):0,netR:+net.toFixed(4),avgR:trades.length?+(net/trades.length).toFixed(4):0}}
console.log(JSON.stringify({dataset:{rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},modes:out},null,2));