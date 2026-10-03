import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";
import fs from "node:fs";

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

const PIP_SIZE=0.01; // XAU/USD: 0.01 price move = 1 pip
const R_MULTIPLE={SL:-1,TP1:0.8,TP2:1.5,TP3:2.3,TIMEOUT:0};

function evaluateTrade(d,r,future){
  const tp=r.takeProfits.map(x=>x.price);
  let hit=0,outcome="TIMEOUT",exitPrice=null;
  for(const c of future){
    if(d.signal==="BUY"){
      if(c.low<=r.stopLoss){outcome="SL";exitPrice=r.stopLoss;break}
      if(c.high>=tp[2]){outcome="TP3";exitPrice=tp[2];break}
      if(c.high>=tp[1]) hit=Math.max(hit,2);
      if(c.high>=tp[0]) hit=Math.max(hit,1);
    }else{
      if(c.high>=r.stopLoss){outcome="SL";exitPrice=r.stopLoss;break}
      if(c.low<=tp[2]){outcome="TP3";exitPrice=tp[2];break}
      if(c.low<=tp[1]) hit=Math.max(hit,2);
      if(c.low<=tp[0]) hit=Math.max(hit,1);
    }
  }
  if(outcome==="TIMEOUT"&&hit) { outcome="TP"+hit; exitPrice=tp[hit-1]; }
  const pipDelta=exitPrice==null?0:(d.signal==="BUY"?(exitPrice-r.entry):(r.entry-exitPrice))/PIP_SIZE;
  const rMultiple=R_MULTIPLE[outcome]??0;
  return {outcome,exitPrice,pips:Number(pipDelta.toFixed(2)),rMultiple,entry:r.entry,stopLoss:r.stopLoss,takeProfits:tp};
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
  const result=evaluateTrade(decision,risk,primary.slice(i+1,i+1+horizon));
  const pattern=market.frames["15min"]?.candlestick?.pattern??"NONE";\n  trades.push({time:t,signal:decision.signal,confidence:decision.confidence,pattern,...result});
}

const count=x=>trades.filter(t=>t.outcome===x).length;
const profitPips=trades.filter(t=>t.pips>0).reduce((s,t)=>s+t.pips,0);
const lossPips=Math.abs(trades.filter(t=>t.pips<0).reduce((s,t)=>s+t.pips,0));
const netPips=profitPips-lossPips;
const grossR=trades.reduce((s,t)=>s+t.rMultiple,0);
const winsR=trades.filter(t=>t.rMultiple>0).reduce((s,t)=>s+t.rMultiple,0);
const lossesR=Math.abs(trades.filter(t=>t.rMultiple<0).reduce((s,t)=>s+t.rMultiple,0));
const avgR=trades.length?grossR/trades.length:0;
const wins=trades.filter(t=>t.outcome.startsWith("TP")).length;
const buys=trades.filter(t=>t.signal==="BUY");
const sells=trades.filter(t=>t.signal==="SELL");\nconst patternTrades=trades.filter(t=>t.pattern!=="NONE");\nconst patternAligned=patternTrades.filter(t=>(t.pattern==="BULLISH_ENGULFING"&&t.signal==="BUY")||(t.pattern==="BEARISH_ENGULFING"&&t.signal==="SELL"));\nconst patternOutcomes=xs=>({total:xs.length,wins:xs.filter(t=>t.outcome.startsWith("TP")).length,sl:xs.filter(t=>t.outcome==="SL").length,winRate:xs.length?Math.round(xs.filter(t=>t.outcome.startsWith("TP")).length/xs.length*10000)/100:0,netR:Number(xs.reduce((s,t)=>s+t.rMultiple,0).toFixed(4)),avgR:xs.length?Number((xs.reduce((s,t)=>s+t.rMultiple,0)/xs.length).toFixed(4)):0});
const by=(xs,x)=>({total:xs.length,wins:xs.filter(t=>t.outcome.startsWith("TP")).length,sl:xs.filter(t=>t.outcome==="SL").length,winRate:xs.length?Math.round(xs.filter(t=>t.outcome.startsWith("TP")).length/xs.length*10000)/100:0});

console.log(JSON.stringify({
  dataset:{source:DATA_URL,rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},
  configuration:{primary:"15min",context:["1h","30min","15min","5min"],stepBars:step,horizonBars:horizon,lookbackPerFrame:500},
  metrics:{
    totalSignals:trades.length,
    wins,
    sl:count("SL"),
    timeout:count("TIMEOUT"),
    winRate:trades.length?Math.round(wins/trades.length*10000)/100:0,
    tp1:count("TP1"),tp2:count("TP2"),tp3:count("TP3"),
    tp1HitRate:trades.length?Math.round(trades.filter(t=>["TP1","TP2","TP3"].includes(t.outcome)).length/trades.length*10000)/100:0,
    tp2HitRate:trades.length?Math.round(trades.filter(t=>["TP2","TP3"].includes(t.outcome)).length/trades.length*10000)/100:0,
    tp3HitRate:trades.length?Math.round(count("TP3")/trades.length*10000)/100:0,
    profitPips:Number(profitPips.toFixed(2)),
    lossPips:Number(lossPips.toFixed(2)),
    netPips:Number(netPips.toFixed(2)),
    avgPipsPerTrade:trades.length?Number((netPips/trades.length).toFixed(2)):0,
    grossR:Number(grossR.toFixed(4)),
    positiveR:Number(winsR.toFixed(4)),
    negativeR:Number(lossesR.toFixed(4)),
    netR:Number(grossR.toFixed(4)),
    avgRPerTrade:Number(avgR.toFixed(4)),
    expectancyR:Number(avgR.toFixed(4))
  },
  byDirection:{BUY:by(buys),SELL:by(sells)},\n    engulfing:{detectedTrades:patternTrades.length,alignedSignals:patternAligned.length,contrarySignals:patternTrades.length-patternAligned.length,all:patternOutcomes(patternTrades),aligned:patternOutcomes(patternAligned)}
},null,2));

fs.mkdirSync("artifacts",{recursive:true});
fs.writeFileSync("artifacts/backtest-pips.json",JSON.stringify({configuration:{pipSize:PIP_SIZE,pipDefinition:"1 pip = 0.01 XAU/USD price move",rMultiple:R_MULTIPLE},trades},null,2));
fs.writeFileSync("artifacts/backtest-pips.csv",["time,signal,confidence,pattern,outcome,entry,exitPrice,stopLoss,tp1,tp2,tp3,pips,rMultiple",...trades.map(t=>[t.time,t.signal,t.confidence,t.pattern,t.outcome,t.entry,t.exitPrice,t.stopLoss,t.takeProfits[0],t.takeProfits[1],t.takeProfits[2],t.pips,t.rMultiple].join(","))].join("\n"));
