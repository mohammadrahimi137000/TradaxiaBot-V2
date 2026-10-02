// TradaxiaBot V2 - Signal Engine
// Responsible for building the final trading signal from analysis modules.

export function createSignal({ symbol, direction, confidence, entry = null, stopLoss = null, takeProfit = null }) {
  return {
    symbol,
    direction,
    confidence,
    entry,
    stopLoss,
    takeProfit,
    createdAt: new Date().toISOString()
  };
}
