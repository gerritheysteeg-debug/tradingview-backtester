import { runSupportResistanceBacktest, scanSupportResistance } from "./supportResistance.mjs";
import { calculateMetrics } from "./tradeSimulator.mjs";
import { runDoopiecashNakedPriceActionBacktest, scanDoopiecashNakedPriceAction } from "./doopiecashNakedPriceAction.mjs";
import { runLiquidityDrivenSMCBacktest, scanLiquidityDrivenSMC } from "./liquidityDrivenSMC.mjs";
import { runTrendPullbackBacktest, scanTrendPullback } from "./trendPullback.mjs";
import { runVolatilityExpansionBacktest, scanVolatilityExpansion } from "./volatilityExpansion.mjs";
export const STRATEGIES = [
  {
    id: "support-resistance-v1",
    name: "Support / Resistance v1",
    description: "Higher-timeframe levels met candle close, volume-filter en swing/level2 stops.",
    requiredCandles: ["entry", "level"],
    docUrl: "/docs/support-resistance-v1.html",
    run: runSupportResistanceBacktest,
    scan: scanSupportResistance
  },
  {
    id: "doopiecash-naked-price-action-v1",
    name: "Doopiecash Naked Price Action v1",
    description: "MTF naked price action met daily bias, 4H setup, 15m triggerzone, 3m sniper entry en scoring.",
    requiredResolutions: ["1W", "1D", "4h", "15m", "3m"],
    chartResolution: "3m",
    levelResolution: "4h",
    docUrl: "/docs/doopiecash-naked-price-action-v1.html",
    run: runDoopiecashNakedPriceActionBacktest,
    scan: scanDoopiecashNakedPriceAction
  },
  {
    id: "liquidity-driven-smc-v1",
    name: "Liquidity Driven / SMC-lite v1",
    description: "Stop hunts, sweeps, reclaims en CHOCH/BOS op 5 timeframes. Liquidity pools als entry-basis.",
    requiredResolutions: ["1W", "1D", "4h", "15m", "3m"],
    chartResolution: "3m",
    levelResolution: "4h",
    docUrl: "/docs/liquidity-driven-smc-v1.html",
    run: runLiquidityDrivenSMCBacktest,
    scan: scanLiquidityDrivenSMC
  },
  {
    id: "trend-pullback-v1",
    name: "Trend Pullback v1",
    description: "Continuation trades op daily-trend pullbacks via 4H HL/LH zones. EMA50 + swing structuur filter.",
    requiredResolutions: ["1W", "1D", "4h", "15m", "3m"],
    chartResolution: "3m",
    levelResolution: "4h",
    docUrl: "/docs/trend-pullback-v1.html",
    run: runTrendPullbackBacktest,
    scan: scanTrendPullback
  },
  {
    id: "volatility-expansion-v1",
    name: "Volatility Expansion v1",
    description: "ATR-compressie detectie + bevestigde breakout met volume. Range high/low als target basis.",
    requiredResolutions: ["1W", "1D", "4h", "15m", "3m"],
    chartResolution: "3m",
    levelResolution: "4h",
    docUrl: "/docs/volatility-expansion-v1.html",
    run: runVolatilityExpansionBacktest,
    scan: scanVolatilityExpansion
  },
];

export function listStrategies() {
  return STRATEGIES.map(({ id, name, description, docUrl }) => ({
    id,
    name,
    description,
    docUrl
  }));
}

export function getStrategy(strategyId = "support-resistance-v1") {
  return (
    STRATEGIES.find((strategy) => strategy.id === strategyId) ??
    STRATEGIES[0]
  );
}

export function scanStrategy({ strategyId, entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const strategy = getStrategy(strategyId);
  if (!strategy.scan) return { setups: [], currentPrice: 0 };
  return strategy.scan({ entryCandles, levelCandles, candlesByResolution, options });
}

export function runStrategyBacktest({
  strategyId,
  entryCandles,
  levelCandles,
  candlesByResolution = {},
  options = {}
}) {
  const strategy = getStrategy(strategyId);
  const result = strategy.run({ entryCandles, levelCandles, candlesByResolution, options });

  // Walk-forward: split trades into in-sample (IS) and out-of-sample (OOS) by entry time.
  const oosPct = Number(options.outOfSamplePct ?? 0);
  let walkForward = null;

  if (oosPct > 0 && oosPct < 100 && result.trades?.length > 0) {
    const allCandles = entryCandles.length
      ? entryCandles
      : (Object.values(candlesByResolution).find(c => c?.length > 1) ?? []);

    if (allCandles.length >= 2) {
      const firstTime = allCandles[0].time;
      const lastTime  = allCandles.at(-1).time;
      const splitTime = firstTime + (lastTime - firstTime) * (1 - oosPct / 100);

      const isTrades  = result.trades.filter(t => t.entryTime <  splitTime);
      const oosTrades = result.trades.filter(t => t.entryTime >= splitTime);

      walkForward = {
        splitTime,
        oosPct,
        metricsIS:  calculateMetrics(isTrades),
        metricsOOS: calculateMetrics(oosTrades)
      };
    }
  }

  return {
    ...result,
    strategy:     strategy.id,
    strategyName: strategy.name,
    ...(walkForward && { walkForward })
  };
}
