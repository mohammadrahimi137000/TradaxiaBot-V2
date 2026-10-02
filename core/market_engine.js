import { calculateMomentum } from '../data/market_data.js';

export function analyzeMarket(candles = []) {
  const momentum = calculateMomentum(candles);

  let trend = 'neutral';

  if (momentum > 0) trend = 'bullish';
  if (momentum < 0) trend = 'bearish';

  return {
    symbol: 'XAU/USD',
    trend,
    momentum,
    volatility: 'pending',
    candles: candles.length
  };
}
