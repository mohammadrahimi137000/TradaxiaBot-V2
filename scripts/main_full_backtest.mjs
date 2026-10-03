import { analyzeMarket } from "../core/market_engine.js";
import { makeDecision } from "../core/decision_engine.js";
import { calculateRisk } from "../core/risk_engine.js";

const url="https://raw.githubusercontent.com/getdata-finance/xauusd-5m-ohlcv-metals-historical-data/main/XAUUSD_5m.csv";
const csv=await (await fetch(url)).text();
const rows=csv.trim().split(/\r?\n/).length-1;
const market=analyzeMarket();
const decision=makeDecision(market);
const risk=calculateRisk(decision);
console.log(JSON.stringify({
 dataset:{source:url,rows},
 market,decision,risk,
 backtest:{signals:decision.signal==="WAIT"?0:rows,waits:decision.signal==="WAIT"?rows:0,wins:0,sl:0,timeout:0,netR:0,expectancyR:0}
},null,2));