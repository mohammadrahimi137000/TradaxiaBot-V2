import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const DATA_URL="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";
const MODES=["none","level","candle","both"];
const R_MULTIPLE={SL:-1,TP1:0.8,TP2:1.5,TP3:2.3};

function parseCsv(text){
  return text.trim().split(/\r?\n/).slice(1).map(line=>{
    const p=line.split(","), time=Date.parse(p[0]);
    const v={time,open:+p[1],high:+p[2],low:+p[3],close:+p[4],volume:+(p[5]??0)};
    return Number.isFinite(time)&&[v.open,v.high,v.low,v.close].every(Number.isFinite)?v:null;
  }).filter(Boolean).sort((a,b)=>a.time-b.time);
}
function resample(candles,minutes){
  const ms=minutes*60000,out=[];let bucket=null,cur=null;
  for(const c of candles){const b=Math.floor(c.time/ms)*ms;
    if(bucket===null||b!==bucket){if(cur)out.push(cur);bucket=b;cur={time:b,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}}
    else{cur.high=Math.max(cur.high,c.high);cur.low=Math.min(cur.low,c.low);cur.close=c.close;cur.volume+=c.volume}
  }
  if(cur)out.push(cur);return out;
}
function upperBound(a,t){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].time<=t)lo=m+1;else hi=m}return lo}
function snapshotAt(a,t){const n=upperBound(a,t);return a.slice(Math.max(0,n-500),n)}
function evaluateTrade(d,r,future){
  const tp=r.takeProfits.map(x=>x.price);let hit=0,outcome="TIMEOUT",exitPrice=null;
  for(const c of future){
    if(d.signal==="BUY"){
      if(c.low<=r.stopLoss){outcome="SL";exitPrice=r.stopLoss;break}
      if(c.high>=tp[2]){outcome="TP3";exitPrice=tp[2];break}
      if(c.high>=tp[1])hit=Math.max(hit,2);if(c.high>=tp[0])hit=Math.max(hit,1);
    }else{
      if(c.high>=r.stopLoss){outcome="SL";exitPrice=r.stopLoss;break}
      if(c.low<=tp[2]){outcome="TP3";exitPrice=tp[2];break}
      if(c.low<=tp[1])hit=Math.max(hit,2);if(c.low<=tp[0])hit=Math.max(hit,1);
    }
  }
  if(outcome==="TIMEOUT"&&hit){outcome="TP"+hit;exitPrice=tp[hit-1]}
  const pips=exitPrice==null?0:(d.signal==="BUY"?(exitPrice-r.entry):(r.entry-exitPrice))/0.01;
  return{outcome,pips,rMultiple:R_MULTIPLE[outcome]??0};
}
function outcomes(xs){
  const wins=xs.filter(t=>t.outcome.startsWith("TP")).length;
  const netR=xs.reduce((s,t)=>s+t.rMultiple,0);
  return{total:xs.length,wins,sl:xs.filter(t=>t.outcome==="SL").length,timeout:xs.filter(t=>t.outcome==="TIMEOUT").length,winRate:xs.length?Math.round(wins/xs.length*10000)/100:0,netR:+netR.toFixed(4),avgR:xs.length?+(netR/xs.length).toFixed(4):0};
}
const raw=await (await fetch(DATA_URL)).text(),m5=parseCsv(raw);
const multi={"5min":m5,"15min":resample(m5,15),"30min":resample(m5,30),"1h":resample(m5,60)};
const primary=multi["15min"],step=4,horizon=20;

function applyMode(market,mode){
  for(const tf of ["15min","5min"]){
    const p=market.frames[tf]?.pinBar;if(!p)continue;
    const confirmedBias=mode==="none"?0:mode==="level"?(p.levelConfirmed?p.bias:0):mode==="candle"?(p.candleConfirmed?p.bias:0):(p.confirmed?p.bias:0);
    p.confirmedBias=confirmedBias;p.testModeConfirmed=confirmedBias!==0;
  }
  return market;
}
function run(mode){
  const trades=[];
  for(let i=80;i+horizon<primary.length;i+=step){
    const t=primary[i],snapshot={"1h":snapshotAt(multi["1h"],t),"30min":snapshotAt(multi["30min"],t),"15min":snapshotAt(multi["15min"],t),"5min":snapshotAt(multi["5min"],t)};
    const market=applyMode(analyzeMarket(snapshot),mode);
    const decision=makeDecision(market),risk=calculateRisk(decision,market);
    if(!risk.active)continue;
    const result=evaluateTrade(decision,risk,primary.slice(i+1,i+1+horizon));
    const p=market.frames["15min"]?.pinBar;
    trades.push({signal:decision.signal,outcome:result.outcome,rMultiple:result.rMultiple,pips:result.pips,pinBar:p?.pattern??"NONE",pinConfirmed:p?.testModeConfirmed===true});
  }
  const pin=trades.filter(t=>t.pinBar!=="NONE"&&t.pinConfirmed);
  const aligned=pin.filter(t=>(t.pinBar==="BULLISH_PIN_BAR"&&t.signal==="BUY")||(t.pinBar==="BEARISH_PIN_BAR"&&t.signal==="SELL"));
  const netR=trades.reduce((s,t)=>s+t.rMultiple,0);
  return{mode,system:outcomes(trades),grossR:+netR.toFixed(4),pinBar:{detectedTrades:pin.length,alignedSignals:aligned.length,contrarySignals:pin.length-aligned.length,all:outcomes(pin),aligned:outcomes(aligned)}};
}
console.log(JSON.stringify({dataset:{source:DATA_URL,rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},configuration:{primary:"15min",context:["1h","30min","15min","5min"],stepBars:step,horizonBars:horizon,lookbackPerFrame:500},tests:MODES.map(run)},null,2));

