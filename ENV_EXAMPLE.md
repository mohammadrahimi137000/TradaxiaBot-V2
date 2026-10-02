# TradaxiaBot V2 Market Data Configuration

Required Worker variables:

- `XAU_DATA_PROVIDER_URL` : URL endpoint that returns XAU/USD OHLC candles
- `XAU_DATA_API_KEY` : API key for the selected market data provider

Expected candle format:

```json
{
  "candles": [
    {
      "time": "2026-01-01T00:00:00Z",
      "open": 2000,
      "high": 2005,
      "low": 1998,
      "close": 2003,
      "volume": 1000
    }
  ]
}
```

The Worker reads these variables through the runtime environment.
