// TradaxiaBot signal rules foundation
// Entry filters based on Order Block, FVG, zones and confirmations.

export function validateSignal(context = {}) {
  const {
    nearImportantZone = false,
    orderBlockTouched = false,
    fvgCreated = false,
    divergenceConfirmed = false,
    candleConfirmation15m = false,
    breakoutWaitingRetest = false
  } = context;

  if (nearImportantZone && !orderBlockTouched) {
    return { signal: 'WAIT', reason: 'Price is near an important zone.' };
  }

  if (breakoutWaitingRetest) {
    return { signal: 'WAIT', reason: 'Important level broken. Waiting for retest.' };
  }

  if (orderBlockTouched && fvgCreated && divergenceConfirmed && candleConfirmation15m) {
    return { signal: 'READY', reason: 'All confirmations passed.' };
  }

  return { signal: 'WAIT', reason: 'Confirmation incomplete.' };
}
