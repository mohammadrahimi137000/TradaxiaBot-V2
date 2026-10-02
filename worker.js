import { analyzeMarket } from './core/market_engine.js';
import { makeDecision } from './core/decision_engine.js';
import { calculateRisk } from './core/risk_engine.js';
import { fetchXAUUSD } from './data/xauusd_adapter.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.json({
        bot: 'TradaxiaBot V2',
        market: 'XAU/USD',
        status: 'online',
        engines: ['market', 'decision', 'risk'],
        dataLayer: 'connected'
      });
    }

    if (url.pathname === '/analyze') {
      try {
        const marketData = await fetchXAUUSD(
          env.XAU_DATA_PROVIDER_URL,
          env.XAU_DATA_API_KEY
        );

        const market = analyzeMarket(marketData.candles);
        const decision = makeDecision(market);
        const risk = calculateRisk(decision);

        return Response.json({
          symbol: 'XAU/USD',
          market,
          decision,
          risk
        });
      } catch (error) {
        return Response.json({
          error: 'Market data unavailable',
          message: error.message
        }, { status: 503 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
