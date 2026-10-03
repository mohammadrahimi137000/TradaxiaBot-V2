import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const DATA_URL="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";
function parseCsv(text){return text.trim().split(/\r?\n/).slice(1).map(x=>x.split(",")).filter(p=>p.length>=6).map(p=>({time:Date.parse(p[0]),open:+p[1],high:+p[2],low:+p[3],close:+p[4],volume:+p[5]})).filter(c=>Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
function resample(cs,min){const ms=min*60000,o=[];let b=null,c=null;for(const x of cs){const k=Math.floor(x.time/ms)*ms;if(k!==b){if(c)o.push(c);b=k;c={time:k,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume}}else{c.high=Math.max(c.high,x.high);c.low=Math.min(c.low,x.low);c.close=x.close;c.volume+=x.volume}}if(c)o.push(c);return o}
function ub(a,t){let l=0,h=a.length;while(l<h){const m=(l+h)>>1;if(a[m].time<=t)l=m+1;else h=m}return l}
function snap(a,t){const n=ub(a,t);return a.slice(Math.max(0,n-500),n)}
const res=await fetch(DATA_URL);if(!res.ok)throw Error("data_http_"+res.status);const m5=parseCsv(await res.text());
const multi={"5min":m5,"15min":resample(m5,15),"30min":resample(m5,30),"1h":resample(m5,60)};
const primary=multi["15min"];const step=4,horizon=20;let waits=0,signals=0,riskActive=0;
const signalCounts={};
for(let i=80;i+horizon<primary.length;i+=step){
 const t=primary[i],snapshot={"1h":snap(multi["1h"],t),"30min":snap(multi["30min"],t),"15min":snap(multi["15min"],t),"5min":snap(multi["5min"],t)};
 const market=analyzeMarket(snapshot),decision=makeDecision(market),risk=calculateRisk(decision,market);
 signalCounts[decision.signal]=(signalCounts[decision.signal]||0)+1;
 if(decision.signal==="WAIT")waits++; else signals++;
 if(risk.active===true || risk.riskStatus==="active")riskActive++;
}
console.log(JSON.stringify({dataset:{rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},configuration:{primary:"15min",context:["1h","30min","15min","5min"],stepBars:step,horizonBars:horizon,lookbackPerFrame:500},backtest:{evaluatedBars:Math.floor((primary.length-81)/step)+1,signals,waits:waits,riskActive,signalCounts},engineStatus:{trend:"unknown",momentum:0,volatility:"unknown",decision:"WAIT",risk:"inactive"},note:"Main branch currently contains placeholder engines; no historical trade outcomes can be calculated."},null,2));