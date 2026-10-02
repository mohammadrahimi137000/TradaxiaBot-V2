export function makeDecision(market) {
  return {
    signal: 'WAIT',
    confidence: 0,
    basedOn: market
  };
}
