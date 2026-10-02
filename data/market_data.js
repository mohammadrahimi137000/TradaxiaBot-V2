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
