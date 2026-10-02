// XAU/USD Market Data Adapter
// Converts external candle providers into TradaxiaBot OHLC format

export async function fetchXAUUSD(providerUrl, apiKey) {
  if (!providerUrl) {
    throw new Error('Market data provider URL is missing');
  }

  const response = await fetch(providerUrl, {
    headers: apiKey ? { Authorization: `apikey ${apiKey}` } : {}
  });

  if (!response.ok) {
    throw new Error(`Market data request failed: ${response.status}`);
  }

  const data = await response.json();

  const candles = (data.candles || data.values || []).map(c => ({
    time: c.time || c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: c.volume ? Number(c.volume) : null
  }));

  return {
    symbol: 'XAU/USD',
    candles
  };
}
