// Market Regime Engine v1
// Classifies the current market regime and advises which strategies are appropriate.
// This is a meta-strategy — it produces regime analysis, not entry signals.

const DEFAULT_OPTIONS = {
  atrLength: 14,
  atrPercentileLookback: 30,
  swingWindow: 3,
  overlapLookback: 10,
  emaFast: 20,
  emaSlow: 50,
  exhaustionWickRatio: 0.6,
  regimeLookback: 60
};

// ─── EMA ─────────────────────────────────────────────────────────────────────

function ema(values, length) {
  const k = 2 / (length + 1);
  let e = values[0];
  return values.map(v => { e = v * k + e * (1 - k); return e; });
}

// ─── ATR percentile ───────────────────────────────────────────────────────────

function trueRanges(candles) {
  return candles.slice(1).map((c, i) => Math.max(
    c.high - c.low,
    Math.abs(c.high - candles[i].close),
    Math.abs(c.low  - candles[i].close)
  ));
}

function wilderAtr(trs, length) {
  const result = [trs.slice(0, length).reduce((s, v) => s + v, 0) / length];
  for (let i = length; i < trs.length; i++) {
    result.push((result.at(-1) * (length - 1) + trs[i]) / length);
  }
  return result;
}

function atrPercentileAt(atrVals, i, lookback) {
  const window = atrVals.slice(Math.max(0, i - lookback), i + 1);
  const cur    = window.at(-1);
  return Math.round(window.filter(v => v <= cur).length / window.length * 100);
}

// ─── Swing detection ──────────────────────────────────────────────────────────

function detectSwings(candles, window) {
  const highs = [], lows = [];
  for (let i = window; i < candles.length - window; i++) {
    const slice = candles.slice(i - window, i + window + 1);
    if (candles[i].high >= Math.max(...slice.map(c => c.high)))
      highs.push({ i, price: candles[i].high, time: candles[i].time });
    if (candles[i].low <= Math.min(...slice.map(c => c.low)))
      lows.push({ i, price: candles[i].low, time: candles[i].time });
  }
  return { highs, lows };
}

// ─── Structure score ──────────────────────────────────────────────────────────

function structureScore(highs, lows, n = 5) {
  const rh = highs.slice(-n);
  const rl = lows.slice(-n);
  let hhCount = 0, hlCount = 0, llCount = 0, lhCount = 0;
  for (let i = 1; i < rh.length; i++) rh[i].price > rh[i-1].price ? hhCount++ : lhCount++;
  for (let i = 1; i < rl.length; i++) rl[i].price > rl[i-1].price ? hlCount++ : llCount++;
  const bullScore = hhCount + hlCount;
  const bearScore = llCount + lhCount;
  return { bullScore, bearScore };
}

// ─── Bar overlap for range/chop detection ────────────────────────────────────

function overlapScore(candles, lookback) {
  if (candles.length < lookback) return 0;
  const recent = candles.slice(-lookback);
  const high = Math.max(...recent.map(c => c.high));
  const low  = Math.min(...recent.map(c => c.low));
  const range = high - low;
  if (range === 0) return 100;
  // Average body size relative to full range — high overlap = choppy
  const avgBody = recent.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / recent.length;
  const avgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
  const bodyRatio = avgRange > 0 ? avgBody / avgRange : 0;
  return Math.round((1 - bodyRatio) * 100);
}

// ─── Exhaustion detection ─────────────────────────────────────────────────────

function isExhausted(candles, wickRatio, lookback = 5) {
  if (candles.length < lookback) return false;
  const recent = candles.slice(-lookback);
  const wickyBars = recent.filter(c => {
    const body = Math.abs(c.close - c.open);
    const fullRange = c.high - c.low;
    const wick = fullRange - body;
    return fullRange > 0 && wick / fullRange > wickRatio;
  });
  return wickyBars.length >= Math.ceil(lookback * 0.5);
}

// ─── Regime classifier ────────────────────────────────────────────────────────

function classifyRegime(candles, atrVals, atrOffset, config, emaFastVals, emaSlowVals) {
  const n = candles.length;
  if (n < 5) return { label: "chop", confidence: 30 };

  const atrPct = atrPercentileAt(atrVals, atrVals.length - 1, config.atrPercentileLookback);
  const { highs, lows } = detectSwings(candles, config.swingWindow);
  const { bullScore, bearScore } = structureScore(highs, lows, 4);
  const overlap = overlapScore(candles, config.overlapLookback);
  const wicky   = isExhausted(candles, config.exhaustionWickRatio);
  const eFast   = emaFastVals.at(-1);
  const eSlow   = emaSlowVals.at(-1);
  const lastClose = candles.at(-1).close;
  const emaAligned = (lastClose > eFast && eFast > eSlow) || (lastClose < eFast && eFast < eSlow);

  // Compression: very low ATR
  if (atrPct <= 25) {
    return { label: "compression", confidence: Math.round(75 + (25 - atrPct) * 0.8) };
  }
  // Expansion: very high ATR, recent breakout from structure
  if (atrPct >= 80 && (bullScore >= 3 || bearScore >= 3)) {
    return { label: "expansion", confidence: Math.round(65 + atrPct * 0.3) };
  }
  // Exhaustion: late trend with wicky bars
  if (wicky && (bullScore >= 2 || bearScore >= 2) && atrPct > 40) {
    return { label: "exhaustion", confidence: 72 };
  }
  // Chop: high overlap, unclear structure
  if (overlap >= 65 && bullScore < 2 && bearScore < 2) {
    return { label: "chop", confidence: Math.round(55 + overlap * 0.3) };
  }
  // Range: price oscillates without clear HH-HL or LH-LL
  if (!emaAligned && bullScore < 3 && bearScore < 3 && atrPct < 60) {
    return { label: "range", confidence: 65 };
  }
  // Trend: clear structure + EMA aligned
  if ((bullScore >= 3 || bearScore >= 3) && emaAligned) {
    const str = Math.max(bullScore, bearScore);
    return {
      label: "trend",
      direction: bullScore >= bearScore ? "long" : "short",
      confidence: Math.round(60 + str * 6)
    };
  }
  return { label: "range", confidence: 55 };
}

// ─── Strategy routing ─────────────────────────────────────────────────────────

const REGIME_ROUTING = {
  trend:       { allowed: ["trend-pullback-v1", "doopiecash-naked-price-action-v1"],                   blocked: ["support-resistance-v1"],        riskModifier: 1.0 },
  range:       { allowed: ["liquidity-driven-smc-v1", "support-resistance-v1"],                        blocked: ["trend-pullback-v1"],             riskModifier: 0.9 },
  compression: { allowed: ["volatility-expansion-v1"],                                                 blocked: ["trend-pullback-v1", "doopiecash-naked-price-action-v1"], riskModifier: 0.75 },
  expansion:   { allowed: ["volatility-expansion-v1", "trend-pullback-v1"],                            blocked: [],                                riskModifier: 1.1 },
  chop:        { allowed: [],                                                                          blocked: ["all"],                           riskModifier: 0.0 },
  exhaustion:  { allowed: ["liquidity-driven-smc-v1"],                                                 blocked: ["trend-pullback-v1"],             riskModifier: 0.8 }
};

// ─── Regime timeline over lookback ────────────────────────────────────────────

function buildRegimeTimeline(h4Candles, config) {
  const timeline = [];
  const trs = trueRanges(h4Candles);
  const atrVals = wilderAtr(trs, config.atrLength);
  const atrOffset = config.atrLength;
  const closes = h4Candles.map(c => c.close);
  const emaFast = ema(closes, config.emaFast);
  const emaSlow = ema(closes, config.emaSlow);

  const step  = 4; // classify every 4 bars for performance
  const start = Math.max(
    config.atrLength + config.atrPercentileLookback,
    config.emaSlow,
    config.swingWindow * 2 + 5
  );

  for (let i = start; i < h4Candles.length; i += step) {
    const slice     = h4Candles.slice(Math.max(0, i - config.regimeLookback), i + 1);
    const atrSlice  = atrVals.slice(Math.max(0, i - config.atrLength - config.atrPercentileLookback), i + 1);
    const eFastSlice = emaFast.slice(Math.max(0, i - config.regimeLookback), i + 1);
    const eSlowSlice = emaSlow.slice(Math.max(0, i - config.regimeLookback), i + 1);
    const regime    = classifyRegime(slice, atrSlice, atrOffset, config, eFastSlice, eSlowSlice);

    timeline.push({
      time:       h4Candles[i].time,
      label:      regime.label,
      direction:  regime.direction ?? null,
      confidence: regime.confidence
    });
  }
  return timeline;
}

// ─── Distribution ─────────────────────────────────────────────────────────────

function buildDistribution(timeline) {
  const counts = {};
  for (const r of timeline) counts[r.label] = (counts[r.label] ?? 0) + 1;
  const total = timeline.length || 1;
  const distribution = {};
  for (const [label, count] of Object.entries(counts)) {
    distribution[label] = { count, pct: Math.round(count / total * 100) };
  }
  return distribution;
}

// ─── Public: backtest (regime history) ───────────────────────────────────────

export function runMarketRegimeEngineBacktest({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const h4 = candlesByResolution["4h"] ?? levelCandles ?? entryCandles;
  const m3 = candlesByResolution["3m"] ?? entryCandles;
  if (!h4 || h4.length < config.emaSlow + config.atrLength + 10) {
    return {
      strategy:    "market-regime-engine-v1",
      options:     config,
      levels:      [],
      trades:      [],
      metrics:     emptyMetrics(),
      equityCurve: [],
      meta:        { regime: "insufficient_data", regimeTimeline: [], distribution: {} }
    };
  }

  const regimeTimeline = buildRegimeTimeline(h4, config);
  const currentRegime  = regimeTimeline.at(-1) ?? { label: "unknown", confidence: 0 };
  const routing        = REGIME_ROUTING[currentRegime.label] ?? { allowed: [], blocked: [], riskModifier: 1 };
  const distribution   = buildDistribution(regimeTimeline);

  // Package regime segments as "trades" so the chart can render a timeline strip
  const regimeTrades = regimeTimeline.map((r, idx) => ({
    id:         `R${idx + 1}`,
    direction:  r.direction ?? (r.label === "chop" ? "neutral" : "neutral"),
    entryTime:  r.time,
    exitTime:   regimeTimeline[idx + 1]?.time ?? r.time,
    entry:      0,
    stop:       0,
    exitPrice:  0,
    rMultiple:  0,
    score:      r.confidence,
    regime:     r.label,
    regimeConf: r.confidence
  }));

  return {
    strategy:    "market-regime-engine-v1",
    options:     config,
    levels:      [],
    trades:      regimeTrades,
    metrics:     buildRegimeMetrics(distribution, currentRegime),
    equityCurve: [],
    meta: {
      regime:           currentRegime.label,
      regimeDirection:  currentRegime.direction ?? null,
      regimeConfidence: currentRegime.confidence,
      allowedStrategies: routing.allowed,
      blockedStrategies: routing.blocked,
      riskModifier:     routing.riskModifier,
      regimeTimeline,
      distribution
    }
  };
}

function buildRegimeMetrics(distribution, current) {
  const dominantEntry = Object.entries(distribution).sort((a, b) => b[1].count - a[1].count)[0];
  return {
    trades:       0,
    wins:         0,
    losses:       0,
    winRate:      0,
    profitFactor: 0,
    totalR:       0,
    averageR:     0,
    averageScore: current.confidence,
    maxDrawdownR: 0,
    currentRegime:  current.label,
    dominantRegime: dominantEntry?.[0] ?? "unknown",
    dominantPct:    dominantEntry?.[1]?.pct ?? 0
  };
}

function emptyMetrics() {
  return {
    trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
    totalR: 0, averageR: 0, averageScore: 0, maxDrawdownR: 0
  };
}

// ─── Public: scan ─────────────────────────────────────────────────────────────

export function scanMarketRegimeEngine({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const h4     = candlesByResolution["4h"] ?? levelCandles ?? entryCandles;
  const currentPrice = (candlesByResolution["3m"] ?? entryCandles)?.at(-1)?.close ?? 0;

  if (!h4 || h4.length < config.emaSlow + config.atrLength + 10) {
    return { setups: [], currentPrice };
  }

  const regimeTimeline = buildRegimeTimeline(h4, config);
  const currentRegime  = regimeTimeline.at(-1) ?? { label: "unknown", confidence: 0 };
  const routing        = REGIME_ROUTING[currentRegime.label] ?? { allowed: [], blocked: [], riskModifier: 1 };

  const regimeLabels = {
    trend:       "Trend — duidelijke HH-HL / LH-LL structuur",
    range:       "Range — prijs oscilleert tussen hoog en laag",
    compression: "Compressie — volatiliteit neemt af, wacht op breakout",
    expansion:   "Expansie — momentum breakout in beweging",
    chop:        "Chop — rommelige markt, geen duidelijke richting",
    exhaustion:  "Uitputting — late trendfase met grote wicks"
  };

  const advice = currentRegime.label === "chop"
    ? "Geen trade aanbevolen in huidige marktconditie."
    : `Gebruik: ${routing.allowed.join(", ") || "geen specifieke aanbeveling"}.`;

  const setup = {
    direction:   currentRegime.direction ?? "neutral",
    status:      currentRegime.confidence >= 70 ? "ready" : "watch",
    entry:       0,
    stop:        0,
    tp1: 0, tp2: 0, tp3: 0,
    rr:          0,
    score:       currentRegime.confidence,
    description: `${regimeLabels[currentRegime.label] ?? currentRegime.label} (${currentRegime.confidence}% zekerheid) · ${advice}`
  };

  return { setups: [setup], currentPrice, meta: { currentRegime, routing } };
}
