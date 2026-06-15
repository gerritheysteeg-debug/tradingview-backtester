// Decision Engine — routes strategies based on current market regime.
// Wraps marketRegimeEngine.mjs for classification, then scores all strategies.

import { scanMarketRegimeEngine } from "./marketRegimeEngine.mjs";
import { calcConfluenceScore } from "./confluenceScore.mjs";

const STRATEGY_NAMES = {
  "support-resistance-v1":            "Support / Resistance v1",
  "doopiecash-naked-price-action-v1": "Doopiecash Naked Price Action v1",
  "liquidity-driven-smc-v1":          "Liquidity Driven / SMC v1",
  "trend-pullback-v1":                "Trend Pullback v1",
  "volatility-expansion-v1":          "Volatility Expansion v1"
};

export const REGIME_LABELS = {
  trend:       "Trend",
  range:       "Range",
  compression: "Compressie",
  expansion:   "Expansie",
  chop:        "Chop",
  exhaustion:  "Uitputting"
};

const STRATEGY_IDS = Object.keys(STRATEGY_NAMES);

// Explicit fit table per regime — scores and reasons in Dutch
const REGIME_FIT = {
  trend: {
    "trend-pullback-v1":                { status: "active",  score: 92, reason: "Primaire strategie in een trending markt — volg de HH-HL structuur." },
    "doopiecash-naked-price-action-v1": { status: "allowed", score: 75, reason: "Werkt via daily bias + MTF confluence, bruikbaar in trend." },
    "liquidity-driven-smc-v1":          { status: "watch",   score: 45, reason: "BOS/CHOCH-entries bruikbaar, maar let op de trendrichting." },
    "volatility-expansion-v1":          { status: "watch",   score: 35, reason: "ATR al verhoogd — compressiefase is voorbij, suboptimaal." },
    "support-resistance-v1":            { status: "blocked", score: 12, reason: "Levels worden doorbroken in een trend — te veel valse signalen." }
  },
  range: {
    "liquidity-driven-smc-v1":          { status: "active",  score: 90, reason: "Ideaal voor range: sweep-reclaim entries op liquiditeitspools." },
    "support-resistance-v1":            { status: "allowed", score: 80, reason: "S/R-niveaus zijn betrouwbaar in een oscillerende markt." },
    "doopiecash-naked-price-action-v1": { status: "watch",   score: 42, reason: "Rejection candles aan de grenzen van de range kunnen werken." },
    "volatility-expansion-v1":          { status: "watch",   score: 40, reason: "Range kan voorafgaan aan expansie, maar timing is onzeker." },
    "trend-pullback-v1":                { status: "blocked", score: 10, reason: "Geen duidelijke trend — pullback-strategie heeft geen structuur." }
  },
  compression: {
    "volatility-expansion-v1":          { status: "active",  score: 94, reason: "Exacte use-case: ATR-compressie detecteren vóór een breakout." },
    "support-resistance-v1":            { status: "watch",   score: 44, reason: "Levels zijn zichtbaar maar wacht op breakout-bevestiging." },
    "liquidity-driven-smc-v1":          { status: "watch",   score: 42, reason: "Liquiditeitssweeps mogelijk, maar lage volatiliteit = kleine stops." },
    "trend-pullback-v1":                { status: "blocked", score: 8,  reason: "Compressie = geen trend — pullback heeft geen structuur om te volgen." },
    "doopiecash-naked-price-action-v1": { status: "blocked", score: 8,  reason: "Te weinig volatiliteit voor betrouwbare MTF-signalen." }
  },
  expansion: {
    "volatility-expansion-v1":          { status: "active",  score: 91, reason: "Expansie-momentum in beweging — primair voor breakout-continuatie." },
    "trend-pullback-v1":                { status: "allowed", score: 76, reason: "Trend versnelt — eerste pullbacks zijn goede instapkansen." },
    "doopiecash-naked-price-action-v1": { status: "watch",   score: 45, reason: "MTF bias helpt, maar expansie-entries vereisen snelheid." },
    "liquidity-driven-smc-v1":          { status: "watch",   score: 44, reason: "BOS/CHOCH bruikbaar, maar momentum-fase is risicovol voor sweeps." },
    "support-resistance-v1":            { status: "watch",   score: 38, reason: "Niveaus worden vaak snel doorbroken tijdens expansie." }
  },
  chop: {
    "support-resistance-v1":            { status: "no_trade", score: 0, reason: "Choppy markt — geen enkele strategie heeft een statistisch voordeel." },
    "doopiecash-naked-price-action-v1": { status: "no_trade", score: 0, reason: "Choppy markt — geen enkele strategie heeft een statistisch voordeel." },
    "liquidity-driven-smc-v1":          { status: "no_trade", score: 0, reason: "Choppy markt — geen enkele strategie heeft een statistisch voordeel." },
    "trend-pullback-v1":                { status: "no_trade", score: 0, reason: "Choppy markt — geen enkele strategie heeft een statistisch voordeel." },
    "volatility-expansion-v1":          { status: "no_trade", score: 0, reason: "Choppy markt — geen enkele strategie heeft een statistisch voordeel." }
  },
  exhaustion: {
    "liquidity-driven-smc-v1":          { status: "active",  score: 82, reason: "Uitputting signaleert een mogelijke reversal — SMC sweep-reclaim is ideaal." },
    "support-resistance-v1":            { status: "watch",   score: 48, reason: "S/R-niveaus kunnen reversal-punten markeren, bevestiging vereist." },
    "doopiecash-naked-price-action-v1": { status: "watch",   score: 44, reason: "Wick-analyse kan uitputtingssignalen identificeren op HTF." },
    "volatility-expansion-v1":          { status: "watch",   score: 35, reason: "ATR is hoog maar uitputting ≠ breakout — pas op voor valse uitbraken." },
    "trend-pullback-v1":                { status: "blocked", score: 8,  reason: "Late trendfase met verhoogd reversal-risico — pullbacks zijn gevaarlijk." }
  }
};

// ─── Exported helpers (testable without candle fixtures) ─────────────────────

export function buildStrategyRouter(regime) {
  const fitTable = REGIME_FIT[regime] ?? {};
  return STRATEGY_IDS.map(id => {
    const fit = fitTable[id] ?? { status: "watch", score: 40, reason: "Geen expliciete aanbeveling voor dit regime." };
    return { strategyId: id, name: STRATEGY_NAMES[id], ...fit };
  });
}

export function buildDecisionSummary({ regime, confidence, strategyRouter }) {
  const isReliable = confidence >= 70;
  const recommendedStrategyId = (isReliable && regime !== "chop")
    ? (strategyRouter.find(s => s.status === "active")?.strategyId ?? null)
    : null;
  return { isReliable, recommendedStrategyId };
}

// ─── Regime signal explainability ─────────────────────────────────────────────

function buildRegimeSignals(signals) {
  if (!signals) return [];
  const { atrPct, bullScore, bearScore, overlap, wicky, emaAligned } = signals;

  const atrType = atrPct <= 25 ? "negative" : atrPct >= 75 ? "positive" : "neutral";
  const atrInterp = atrPct <= 25 ? "Compressie — lage volatiliteit"
    : atrPct >= 75 ? "Expansie — hoge volatiliteit"
    : "Gemiddeld — normale volatiliteit";

  const str = Math.max(bullScore, bearScore);
  const structType = str >= 3 ? (bullScore >= bearScore ? "positive" : "negative") : "neutral";
  const structInterp = bullScore >= 3 ? `Duidelijke bullish structuur (${bullScore}× HH-HL)`
    : bearScore >= 3 ? `Duidelijke bearish structuur (${bearScore}× LH-LL)`
    : "Onduidelijke marktstructuur";

  const overlapType = overlap >= 65 ? "negative" : overlap <= 35 ? "positive" : "neutral";
  const overlapInterp = overlap >= 65 ? "Hoge overlap — choppy beweging"
    : overlap <= 35 ? "Lage overlap — directionale bars"
    : "Matige overlap";

  return [
    { key: "atr",       label: "ATR percentiel",  value: `${atrPct}%`,                              interpretation: atrInterp,    type: atrType },
    { key: "structure", label: "Structuur",        value: `Bull ${bullScore}× · Bear ${bearScore}×`, interpretation: structInterp, type: structType },
    { key: "overlap",   label: "Bar-overlap",      value: `${overlap}%`,                             interpretation: overlapInterp, type: overlapType },
    { key: "ema",       label: "EMA alignment",    value: emaAligned ? "Ja" : "Nee",                 interpretation: emaAligned ? "Close > EMA20 > EMA50 (of inverse)" : "Geen EMA-alignment", type: emaAligned ? "positive" : "neutral" },
    { key: "wicky",     label: "Wicky bars",       value: wicky ? "Ja" : "Nee",                      interpretation: wicky ? "Wicky bars gedetecteerd — mogelijke uitputting" : "Geen uitputtingssignaal", type: wicky ? "negative" : "positive" }
  ];
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function makeRegimeDecision({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const regimeScan = scanMarketRegimeEngine({ entryCandles, levelCandles, candlesByResolution, options });
  const meta = regimeScan.meta;
  const confluence = calcConfluenceScore({ candlesByResolution });

  if (!meta?.currentRegime || meta.currentRegime.label === "unknown") {
    return {
      regime:                "unknown",
      regimeLabel:           "Onvoldoende data",
      confidence:            0,
      isReliable:            false,
      bias:                  "neutral",
      riskModifier:          1.0,
      recommendedStrategyId: null,
      strategyRouter:        [],
      regimeSignals:         [],
      currentPrice:          regimeScan.currentPrice ?? 0,
      confluence
    };
  }

  const { currentRegime, routing } = meta;
  const regime     = currentRegime.label;
  const confidence = currentRegime.confidence;
  const bias       = currentRegime.direction ?? "neutral";

  const strategyRouter = buildStrategyRouter(regime);
  const { isReliable, recommendedStrategyId } = buildDecisionSummary({ regime, confidence, strategyRouter });
  const regimeSignals = buildRegimeSignals(currentRegime.signals);

  return {
    regime,
    regimeLabel:           REGIME_LABELS[regime] ?? regime,
    confidence,
    isReliable,
    bias,
    riskModifier:          routing.riskModifier ?? 1.0,
    recommendedStrategyId,
    strategyRouter,
    regimeSignals,
    currentPrice:          regimeScan.currentPrice ?? 0,
    confluence
  };
}
