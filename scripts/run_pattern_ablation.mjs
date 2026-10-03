import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const DATA_URL="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";

function parseCsv(text){
  const lines=text.trim().split(/\r?\n/),out=[];
  for(let i=1;i<lines.length;i++){
    const p=lines[i].split(",");
    if(p.length<6)continue;
    const time=Date.parse(p[0]),open=Number(p[1]),high=Number(p[2]),low=Number(p[3]),close=Number(p[4]),volume=Number(p[5]??0);
    if(Number.isFinite(time)&&[open,high,low,close].every(Number.isFinite))out.push({time,open,high,low,close,volume});
  }
  return out.sort((a,b)=>a.time-b.time);
}
function resample(candles,minutes){
  const ms=minutes*60_000,out=[];let bucket=null,cur=null;
  for(const c of candles){
    const b=Math.floor(c.time/ms)*ms;
    if(bucket===null||b!==bucket){
      if(cur)out.push(cur);bucket=b;
      cur={time:b,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume};
    }else{cur.high=Math.max(cur.high,c.high);cur.low=Math.min(cur.low,c.low);cur.close=c.close;cur.volume+=c.volume;}
  }
  if(cur)out.push(cur);return out;
}
function upperBound(arr,t){let lo=0,hi=arr.length;while(lo<hi){const mid=(lo+hi)>>1;if(arr[mid].time<=t)lo=mid+1;else hi=mid;}return lo;}
function snapshotAt(arr,t){const n=upperBound(arr,t);return arr.slice(Math.max(0,n-500),n);}
function evaluateTrade(d,r,future){
  const tp=r.takeProfits.map(x=>x.price);let hit=0,outcome="TIMEOUT";
  for(const c of future){
    const stopHit=d.signal==="BUY"?c.low<=r.stopLoss:c.high>=r.stopLoss;
    const tp3Hit=d.signal==="BUY"?c.high>=tp[2]:c.low<=tp[2];
    const tp2Hit=d.signal==="BUY"?c.high>=tp[1]:c.low<=tp[1];
    const tp1Hit=d.signal==="BUY"?c.high>=tp[0]:c.low<=tp[0];
    if(stopHit&&(tp1Hit||tp2Hit||tp3Hit))return"AMBIGUOUS";
    if(stopHit){outcome="SL";break}
    if(tp3Hit){outcome="TP3";break}
    if(tp2Hit)hit=Math.max(hit,2);
    if(tp1Hit)hit=Math.max(hit,1);
  }
  if(outcome==="TIMEOUT"&&hit)outcome="TP"+hit;
  return outcome;
}
const configs={
  baseline:{useMA:false,useIchimoku:false,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  ma:{useMA:true,useIchimoku:false,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  ichimoku:{useMA:false,useIchimoku:true,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  oscillators:{useMA:false,useIchimoku:false,useOscillators:true,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  adx:{useMA:false,useIchimoku:false,useOscillators:false,useADX:true,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  candles:{useMA:false,useIchimoku:false,useOscillators:false,useADX:false,useCandles:true,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  structure:{useMA:false,useIchimoku:false,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:true,useSMC:false,useClassical:false,minBest:0,minGap:0},
  smc:{useMA:false,useIchimoku:false,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:true,useClassical:false,minBest:0,minGap:0},
  classical:{useMA:false,useIchimoku:false,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:true,minBest:0,minGap:0},
  ma_ichimoku:{useMA:true,useIchimoku:true,useOscillators:false,useADX:false,useCandles:false,useStructurePatterns:false,useSMC:false,useClassical:false,minBest:0,minGap:0},
  all:{useMA:true,useIchimoku:true,useOscillators:true,useADX:true,useCandles:true,useStructurePatterns:true,useSMC:true,useClassical:true,minBest:0,minGap:0}
};

const res=await fetch(DATA_URL);if(!res.ok)throw new Error("data_http_"+res.status);
const m5=parseCsv(await res.text());
const multi={"5min":m5,"15min":resample(m5,15),"30min":resample(m5,30),"1h":resample(m5,60)};
const primary=multi["15min"],step=4,horizon=20;
const results=Object.fromEntries(Object.keys(configs).map(k=>[k,[]]));

for(let i=80;i+horizon<primary.length;i+=step){
  const t=primary[i];
  const snapshot={
    "1h":snapshotAt(multi["1h"],t),
    "30min":snapshotAt(multi["30min"],t),
    "15min":snapshotAt(multi["15min"],t),
    "5min":snapshotAt(multi["5min"],t)
  };
  const market=analyzeMarket(snapshot);
  for(const [name,cfg] of Object.entries(configs)){
    const decision=makeDecision(market,cfg);
    const risk=calculateRisk(decision,market);
    if(!risk.active)continue;
    const outcome=evaluateTrade(decision,risk,primary.slice(i+1,i+1+horizon));
    results[name].push({signal:decision.signal,outcome});
  }
}

function summarize(xs){
  const wins=xs.filter(x=>x.outcome.startsWith("TP")).length;
  const resolved=xs.filter(x=>["TP1","TP2","TP3","SL","TIMEOUT"].includes(x.outcome)).length;
  const bySide=s=>{const a=xs.filter(x=>x.signal===s),w=a.filter(x=>x.outcome.startsWith("TP")).length;return{total:a.length,wins:w,sl:a.filter(x=>x.outcome==="SL").length,ambiguous:a.filter(x=>x.outcome==="AMBIGUOUS").length,winRate:a.length?Math.round(w/a.length*10000)/100:0}};
  return{totalSignals:xs.length,wins,sl:xs.filter(x=>x.outcome==="SL").length,timeout:xs.filter(x=>x.outcome==="TIMEOUT").length,ambiguous:xs.filter(x=>x.outcome==="AMBIGUOUS").length,resolvedSignals:resolved,winRate:resolved?Math.round(wins/resolved*10000)/100:0,rawWinRate:xs.length?Math.round(wins/xs.length*10000)/100:0,BUY:bySide("BUY"),SELL:bySide("SELL")};
}

const summary=Object.fromEntries(Object.entries(results).map(([k,v])=>[k,summarize(v)]));
console.log(JSON.stringify({
  dataset:{source:DATA_URL,rows:m5.length,start:new Date(m5[0].time).toISOString(),end:new Date(m5.at(-1).time).toISOString()},
  configuration:{primary:"15min",context:["1h","30min","15min","5min"],stepBars:step,horizonBars:horizon,lookbackPerFrame:500},
  ablation:summary
},null,2));
