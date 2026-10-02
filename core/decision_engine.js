export function makeDecision(market, timeframe = '15m') {
  let signal = 'WAIT';
  let confidence = 0;

  const momentum = Number(market.momentum || 0);
  const volatility = market.volatility || 'unknown';

  const timeframeWeight = {
    '1m': 0.8,
    '5m': 0.9,
    '15m': 1,
    '30m': 1.1,
    '1h': 1.2
  }[timeframe] || 1;

  if (momentum > 0) {
    signal = 'BUY';
    confidence = Math.min(100, Math.abs(momentum) * 10 * timeframeWeight);
  }

  if (momentum < 0) {
    signal = 'SELL';
    confidence = Math.min(100, Math.abs(momentum) * 10 * timeframeWeight);
  }

  if (volatility === 'high') {
    confidence = Math.max(0, confidence - 15);
  }

  return {
    signal,
    confidence: Math.round(confidence),
    timeframe,
    basedOn: market
  };
}
