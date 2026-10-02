export function calculateRisk(decision) {
  return {
    stopLoss: null,
    takeProfit: null,
    riskStatus: decision.signal === 'WAIT' ? 'inactive' : 'active'
  };
}
