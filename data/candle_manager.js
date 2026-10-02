// TradaxiaBot V2 - Candle Manager

export class CandleManager {
  normalize(candle) {
    return {
      time: candle.time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume || 0)
    };
  }

  last(candles = []) {
    return candles[candles.length - 1] || null;
  }
}
