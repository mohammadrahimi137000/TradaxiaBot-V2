// Market Data Layer
// Prepares normalized OHLC data for Market Engine

export function normalizeCandles(candles = []) {
  return candles.map(candle => ({
    time: candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: candle.volume ? Number(candle.volume) : null
  }));
}

export function calculateMomentum(candles = []) {
  if (candles.length < 2) return 0;

  const first = candles[0].close;
  const last = candles[candles.length - 1].close;

  return Number((((last - first) / first) * 100).toFixed(2));
}

export function calculateVolatility(candles = []) {
  if (candles.length < 2) return 0;

  const changes = candles.map((candle, index) => {
    if (index === 0) return 0;
    return Math.abs((candle.close - candles[index - 1].close) / candles[index - 1].close) * 100;
  });

  const average = changes.reduce((sum, value) => sum + value, 0) / changes.length;

  return Number(average.toFixed(4));
}

export async function fetchXauCandles() {
  // Provider adapter.
  // Real XAU/USD API connection will be plugged here.
  return [];
}
