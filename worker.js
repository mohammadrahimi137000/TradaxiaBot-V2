import { analyzeMarket } from './core/market_engine.js';
import { makeDecision } from './core/decision_engine.js';
import { calculateRisk } from './core/risk_engine.js';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.json({
        bot: 'TradaxiaBot V2',
        version: 'test-deploy-1',
        market: 'XAU/USD',
        status: 'online',
        engines: ['market', 'decision', 'risk']
      });
    }

    if (url.pathname === '/analyze') {
      const market = analyzeMarket();
      const decision = makeDecision(market);
      const risk = calculateRisk(decision);

      return Response.json({
        symbol: 'XAU/USD',
        version: 'test-deploy-1',
        market,
        decision,
        risk
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
