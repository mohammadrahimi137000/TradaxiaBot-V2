import { calculateMomentum, calculateVolatility } from '../data/market_data.js';

export function analyzeMarket(candles = []) {
  const momentum = calculateMomentum(candles);
  const volatility = calculateVolatility(candles);

  let trend = 'neutral';

  if (momentum > 0) trend = 'bullish';
  if (momentum < 0) trend = 'bearish';

  return {
    symbol: 'XAU/USD',
    trend,
    momentum,
    volatility,
    candles: candles.length
  };
}
