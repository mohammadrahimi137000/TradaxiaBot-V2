import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const DATA_URL="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";

function parseCsv(text){
  const lines=text.trim().split(/\r?\n/);
  const out=[];
  for(let i=1;i<lines.length;i++){
    const p=lines[i].split(",");
    if(p.length<6) continue;
    const time=Date.parse(p[0]);
    const open=Number(p[1]),high=Number(p[2]),low=Number(p[3]),close=Number(p[4]),volume=Number(p[5]??0);
    if(Number.isFinite(time)&&[open,high,low,close].every(Number.isFinite))
      out.push({time,open,high,low,close,volume});
  }
  return out.sort((a,b)=>a.time-b.time);
}

function resample(candles, minutes){
  const ms=minutes*60_000, out=[];
  let bucket=null, cur=null;
  for(const c of candles){
    const b=Math.floor(c.time/ms)*ms;
    if(bucket===null||b!==bucket){
      if(cur) out.push(cur);
      bucket=b;
      cur={time:b,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume};
    }else{
      cur.high=Math.max(cur.high,c.high);
      cur.low=Math.min(cur.low,c.low);
      cur.close=c.close;
      cur.volume+=c.volume;
    }
  }
  if(cur) out.push(cur);
  return out;
}

function upperBound(arr,t){
  let lo=0,hi=arr.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(arr[mid].time<=t) lo=mid+1; else hi=mid;
  }
  return lo;
}

function snapshotAt(arr,t){
  const n=upperBound(arr,t);
  return arr.slice(Math.max(0,n-500),n);
}

function evaluateTrade(d,r,future){
  const tp=r.takeProfits.map(x=>x.price);
  let hit=0,outcome="TIMEOUT";
  for(const c of future){
    if(d.signal==="BUY"){
      if(c.low<=r.stopLoss){outcome="SL";break}
      if(c.high>=tp[2]){outcome="TP3";break}
      if(c.high>=tp[1]) hit=Math.max(hit,2);
      if(c.high>=tp[0]) hit=Math.max(hit,1);
    }else{
      if(c.high>=r.stopLoss){outcome="SL";break}
      if(c.low<=tp[2]){outcome="TP3";break}
      if(c.low<=tp[1]) hit=Math.max(hit,2);
      if(c.low<=tp[0]) hit=Math.max(hit,1);
    }
  }
  if(outcome==="TIMEOUT"&&hit) outcome="TP"+hit;
  return outcome;
}

const res=await fetch(DATA_URL);
if(!res.ok) throw new Error("data_http_"+res.status);
const raw=await res.text();
const m5=parseCsv(raw);
const multi={
  "5min":m5,
  "15min":resample(m5,15),
  "30min":resample(m5,30),
  "1h":resample(m5,60)
};
const primary=multi["15min"];
const startDate=process.env.START_DATE?Date.parse(process.env.START_DATE):null;
const endDate=process.env.END_DATE?Date.parse(process.env.END_DATE):null;
const step=4;
const horizon=20;
const trades=[];
for(let i=80;i+horizon<primary.length;i+=step){
  const t=primary[i].time;
  const snapshot={
    "1h":snapshotAt(multi["1h"],t),
    "30min":snapshotAt(multi["30min"],t),
    "15min":snapshotAt(multi["15min"],t),
    "5min":snapshotAt(multi["5min"],t)
  };
  const market=analyzeMarket(snapshot);
  const decision=makeDecision(market);
  const risk=calculateRisk(decision,market);
  if(!risk.active) continue;
  const outcome=evaluateTrade(decision,risk,primary.slice(i+1,i+1+horizon));
  trades.push({time:t,signal:decision.signal,confidence:decision.confidence,outcome});
}

const count=x=>trades.filter(t=>t.outcome===x).length;
const wins=trades.filter(t=>t.outcome.startsWith("TP")).length;
const buys=trades.filter(t=>t.signal==="BUY");
const sells=trades.filter(t=>t.signal==="SELL");
const by=(xs,x)=>({total:xs.length,wins:xs.filter(t=>t.outcome.startsWith("TP")).length,sl:xs.filter(t=>t.outcome==="SL").length,winRate:xs.length?Math.round(xs.filter(t=>t.outcome.startsWith("TP")).length/xs.length*10000)/100:0});

console.log(JSON.stringify({
  dataset:{source:DATA_URL,rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},
  configuration:{primary:"15min",context:["1h","30min","15min","5min"],stepBars:step,horizonBars:horizon,lookbackPerFrame:500,startDate:process.env.START_DATE||null,endDate:process.env.END_DATE||null},
  metrics:{
    totalSignals:trades.length,
    wins,
    sl:count("SL"),
    timeout:count("TIMEOUT"),
    winRate:trades.length?Math.round(wins/trades.length*10000)/100:0,
    tp1:count("TP1"),tp2:count("TP2"),tp3:count("TP3"),
    tp1HitRate:trades.length?Math.round(trades.filter(t=>["TP1","TP2","TP3"].includes(t.outcome)).length/trades.length*10000)/100:0,
    tp2HitRate:trades.length?Math.round(trades.filter(t=>["TP2","TP3"].includes(t.outcome)).length/trades.length*10000)/100:0,
    tp3HitRate:trades.length?Math.round(count("TP3")/trades.length*10000)/100:0
  },
  byDirection:{BUY:by(buys),SELL:by(sells)}
},null,2));

// CI validation checkpoint
