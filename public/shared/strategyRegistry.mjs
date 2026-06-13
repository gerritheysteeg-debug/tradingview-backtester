import { runSupportResistanceBacktest, scanSupportResistance } from "./supportResistance.mjs";
import { runDoopiecashNakedPriceActionBacktest, scanDoopiecashNakedPriceAction } from "./doopiecashNakedPriceAction.mjs";
import { runLiquidityDrivenSMCBacktest, scanLiquidityDrivenSMC } from "./liquidityDrivenSMC.mjs";

export const STRATEGIES = [
  {
    id: "support-resistance-v1",
    name: "Support / Resistance v1",
    description: "Higher-timeframe levels met candle close, volume-filter en swing/level2 stops.",
    requiredCandles: ["entry", "level"],
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
    run: runLiquidityDrivenSMCBacktest,
    scan: scanLiquidityDrivenSMC
  }
];

export function listStrategies() {
  return STRATEGIES.map(({ id, name, description }) => ({
    id,
    name,
    description
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
  const result = strategy.run({
    entryCandles,
    levelCandles,
    candlesByResolution,
    options
  });

  return {
    ...result,
    strategy: strategy.id,
    strategyName: strategy.name
  };
}
