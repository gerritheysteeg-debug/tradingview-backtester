// Trend Pullback v1 — continuation strategy
// Trades pullbacks in the direction of a clear Daily trend.

const DEFAULT_OPTIONS = {
  emaLength: 50,
  swingWindow: 3,
  levelTolerancePct: 0.5,
  stopBufferPct: 0.1,
  minRR: 2.0,
  maxHoldBars: 160,
  feePct: 0.05,
  slippagePct: 0.02,
  fundingRatePct8h: 0,
  intrabarOrder: "pessimistic",
  minimumScoreToTrade: 60,
  direction: "both",
  dailyBiasLookback: 20,
  volumeMultiplier: 1.0,
  volumeLookback: 20,
  partials: [
    { r: 1, size: 0.33 },
    { r: 2, size: 0.33 },
    { r: 3, size: 0.34 }
  ]
};

import { simulateTrade, calculateMetrics, buildEquityCurve } from "./tradeSimulator.mjs";

// ─── EMA ─────────────────────────────────────────────────────────────────────

function ema(values, length) {
  const k = 2 / (length + 1);
  const result = [];
  let e = values[0];
  for (const v of values) {
    e = v * k + e * (1 - k);
    result.push(e);
  }
  return result;
}

// ─── Swing detection ──────────────────────────────────────────────────────────

function detectSwings(candles, window = 3) {
  const highs = [], lows = [];
  for (let i = window; i < candles.length - window; i++) {
    const slice = candles.slice(i - window, i + window + 1);
    if (candles[i].high === Math.max(...slice.map(c => c.high))) {
      highs.push({ index: i, price: candles[i].high, time: candles[i].time });
    }
    if (candles[i].low === Math.min(...slice.map(c => c.low))) {
      lows.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
  }
  return { highs, lows };
}

// ─── Trend detection ──────────────────────────────────────────────────────────

function detectTrend(d1Candles, config) {
  if (!d1Candles || d1Candles.length < config.emaLength + 5) {
    return { direction: "neutral", strength: 0, emaValues: [] };
  }
  const closes = d1Candles.map(c => c.close);
  const emaValues = ema(closes, config.emaLength);
  const { highs, lows } = detectSwings(d1Candles, config.swingWindow);

  const recentBars = config.dailyBiasLookback;
  const recentHighs = highs.slice(-recentBars);
  const recentLows = lows.slice(-recentBars);

  // HH-HL count
  let hhCount = 0, hlCount = 0, llCount = 0, lhCount = 0;
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i].price > recentHighs[i - 1].price) hhCount++;
    else lhCount++;
  }
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i].price > recentLows[i - 1].price) hlCount++;
    else llCount++;
  }

  const lastClose = closes.at(-1);
  const lastEma = emaValues.at(-1);
  const aboveEma = lastClose > lastEma;

  const bullStrength = Math.min(100, (hhCount + hlCount) * 12 + (aboveEma ? 25 : 0));
  const bearStrength = Math.min(100, (llCount + lhCount) * 12 + (!aboveEma ? 25 : 0));

  if (bullStrength >= 60 && bullStrength > bearStrength) {
    return { direction: "long", strength: bullStrength, emaValues };
  }
  if (bearStrength >= 60 && bearStrength > bullStrength) {
    return { direction: "short", strength: bearStrength, emaValues };
  }
  return { direction: "neutral", strength: Math.max(bullStrength, bearStrength), emaValues };
}

// ─── Pullback zones (4H swing levels) ────────────────────────────────────────

function buildPullbackZones(h4Candles, trend, config) {
  const { highs, lows } = detectSwings(h4Candles, config.swingWindow);
  const zones = [];
  const tol = config.levelTolerancePct / 100;

  if (trend.direction === "long") {
    // Previous 4H higher lows = support zones for pullback entries
    const validLows = lows.filter((l, i) => i > 0 && l.price > lows[i - 1].price);
    for (const sw of validLows.slice(-12)) {
      zones.push({
        id: `tp-zone-${sw.index}`,
        price: sw.price,
        direction: "long",
        high: sw.price * (1 + tol),
        low: sw.price * (1 - tol * 2),
        time: sw.time,
        touchCount: 1,
        role: "support",
        broken: false
      });
    }
  } else if (trend.direction === "short") {
    // Previous 4H lower highs = resistance zones for short pullback entries
    const validHighs = highs.filter((h, i) => i > 0 && h.price < highs[i - 1].price);
    for (const sw of validHighs.slice(-12)) {
      zones.push({
        id: `tp-zone-${sw.index}`,
        price: sw.price,
        direction: "short",
        high: sw.price * (1 + tol * 2),
        low: sw.price * (1 - tol),
        time: sw.time,
        touchCount: 1,
        role: "resistance",
        broken: false
      });
    }
  }
  return zones;
}

// ─── Volume filter ────────────────────────────────────────────────────────────

function avgVolume(candles, i, lookback) {
  const slice = candles.slice(Math.max(0, i - lookback), i);
  return slice.reduce((s, c) => s + (c.volume ?? 0), 0) / (slice.length || 1);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreSetup({ trend, zoneQuality, pullbackDepth, rr }) {
  let score = 0;
  score += Math.min(25, trend.strength * 0.25);   // trend alignment (0-25)
  score += zoneQuality * 20;                        // zone quality (0-20)
  score += Math.min(20, pullbackDepth * 40);        // pullback depth quality (0-20)
  score += Math.min(15, (rr / 3) * 15);            // RR quality (0-15)
  score += 20;                                      // base entry execution credit
  return Math.round(Math.min(100, score));
}

// ─── Trade simulation ─────────────────────────────────────────────────────────

function simulateTrendPullbackTrades(candles, zones, trend, config) {
  const trades = [];
  const m3 = candles.m3;
  if (!m3.length || !zones.length) return trades;
  let openUntilIndex = -1;
  let tradeNum = 1;

  for (let i = config.volumeLookback + 5; i < m3.length - 2; i++) {
    if (i <= openUntilIndex) continue;

    const bar = m3[i];
    const avgVol = avgVolume(m3, i, config.volumeLookback);

    for (const zone of zones) {
      // Zone must not be in the future
      if (zone.time > bar.time) continue;

      const direction = trend.direction;
      if (config.direction !== "both" && config.direction !== direction) continue;

      let inZone = false;
      if (direction === "long" && bar.low <= zone.high && bar.low >= zone.low) inZone = true;
      if (direction === "short" && bar.high >= zone.low && bar.high <= zone.high) inZone = true;
      if (!inZone) continue;

      // 15m trigger: next candle reclaims zone
      const trigger = m3[i + 1];
      if (!trigger) continue;
      let triggered = false;
      if (direction === "long" && trigger.close > zone.high) triggered = true;
      if (direction === "short" && trigger.close < zone.low) triggered = true;
      if (!triggered) continue;

      // Entry candle
      const entryBar = m3[i + 2];
      if (!entryBar) continue;
      const entry = entryBar.open;

      // Stop below/above zone
      const stopRef = direction === "long" ? zone.low : zone.high;
      const buf = config.stopBufferPct / 100;
      const stop = direction === "long"
        ? round(stopRef * (1 - buf), 1)
        : round(stopRef * (1 + buf), 1);
      const risk = Math.abs(entry - stop);
      if (risk <= 0) continue;

      // Targets based on recent swing structure
      const recentHighs = candles.h4
        ? detectSwings(candles.h4, config.swingWindow).highs.filter(h => h.time < bar.time)
        : [];
      const recentLows = candles.h4
        ? detectSwings(candles.h4, config.swingWindow).lows.filter(l => l.time < bar.time)
        : [];

      let tp1, tp2, tp3;
      if (direction === "long") {
        const nexts = recentHighs.filter(h => h.price > entry).sort((a, b) => a.price - b.price);
        tp1 = nexts[0]?.price ?? round(entry + risk * 1.5, 1);
        tp2 = nexts[1]?.price ?? round(entry + risk * 3, 1);
        tp3 = round(entry + risk * 4, 1);
      } else {
        const nexts = recentLows.filter(l => l.price < entry).sort((a, b) => b.price - a.price);
        tp1 = nexts[0]?.price ?? round(entry - risk * 1.5, 1);
        tp2 = nexts[1]?.price ?? round(entry - risk * 3, 1);
        tp3 = round(entry - risk * 4, 1);
      }

      const rr = Math.abs((tp2 || tp1) - entry) / risk;
      if (rr < config.minRR) continue;

      const pullbackDepth = risk / (Math.abs(entry) * 0.01);
      const score = scoreSetup({ trend, zoneQuality: 0.7, pullbackDepth: Math.min(1, pullbackDepth), rr });
      if (score < config.minimumScoreToTrade) continue;

      const tradeResult = simulateTrade(m3, {
        direction,
        entryIndex:          i + 2,
        entry,
        stop,
        partials:            config.partials,
        moveStopToBEAfterTP: 1,
        maxHoldBars:         config.maxHoldBars,
        feePct:              config.feePct ?? 0,
        slippagePct:         config.slippagePct ?? 0,
        fundingRatePct8h:    config.fundingRatePct8h ?? 0,
        intrabarOrder:       config.intrabarOrder ?? "pessimistic",
        meta: {
          id:       `TP${tradeNum}`,
          tp1:      round(tp1, 1),
          tp2:      round(tp2, 1),
          tp3:      round(tp3, 1),
          score,
          stopMode: "pullback-zone"
        }
      });
      if (!tradeResult) continue;

      tradeNum++;
      trades.push(tradeResult);
      openUntilIndex = tradeResult.exitIndex;
      break; // one trade per candle
    }
  }
  return trades;
}

// ─── Public: backtest ─────────────────────────────────────────────────────────

export function runTrendPullbackBacktest({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const candles = {
    m3:    candlesByResolution["3m"]  ?? entryCandles,
    m15:   candlesByResolution["15m"] ?? entryCandles,
    h4:    candlesByResolution["4h"]  ?? levelCandles,
    daily: candlesByResolution["1D"]  ?? levelCandles,
    weekly:candlesByResolution["1W"]  ?? []
  };

  const trend = detectTrend(candles.daily, config);
  const zones = trend.direction !== "neutral"
    ? buildPullbackZones(candles.h4, trend, config)
    : [];

  const trades = simulateTrendPullbackTrades(candles, zones, trend, config);
  const metrics = calculateMetrics(trades);

  return {
    strategy: "trend-pullback-v1",
    options: config,
    levels: zones.map(z => ({
      id: z.id,
      price: z.price,
      role: z.role,
      direction: z.direction,
      touchCount: z.touchCount,
      score: 6,
      broken: z.broken,
      time: z.time
    })),
    trades,
    metrics,
    equityCurve: buildEquityCurve(trades),
    meta: { trendDirection: trend.direction, trendStrength: trend.strength }
  };
}

// ─── Public: scan (live advice) ───────────────────────────────────────────────

export function scanTrendPullback({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const candles = {
    m3:    candlesByResolution["3m"]  ?? entryCandles,
    m15:   candlesByResolution["15m"] ?? entryCandles,
    h4:    candlesByResolution["4h"]  ?? levelCandles,
    daily: candlesByResolution["1D"]  ?? levelCandles,
    weekly:candlesByResolution["1W"]  ?? []
  };

  const trend = detectTrend(candles.daily, config);
  const currentPrice = candles.m3.at(-1)?.close ?? 0;
  if (trend.direction === "neutral") return { setups: [], currentPrice };

  const zones = buildPullbackZones(candles.h4, trend, config);
  const setups = [];

  for (const zone of zones.slice(-6)) {
    const dir = trend.direction;
    if (config.direction !== "both" && config.direction !== dir) continue;

    const distPct = Math.abs(currentPrice - zone.price) / zone.price * 100;
    let status = "pending";
    if (distPct < 0.5) status = "ready";
    else if (distPct < 1.5) status = "watch";

    const risk = dir === "long"
      ? currentPrice - zone.low * (1 - config.stopBufferPct / 100)
      : zone.high * (1 + config.stopBufferPct / 100) - currentPrice;
    if (risk <= 0) continue;

    const entry = dir === "long" ? round(zone.high * 1.001, 1) : round(zone.low * 0.999, 1);
    const stop  = dir === "long"
      ? round(zone.low * (1 - config.stopBufferPct / 100), 1)
      : round(zone.high * (1 + config.stopBufferPct / 100), 1);
    const entryRisk = Math.abs(entry - stop);
    const tp1 = dir === "long" ? round(entry + entryRisk * 1.5, 1) : round(entry - entryRisk * 1.5, 1);
    const tp2 = dir === "long" ? round(entry + entryRisk * 3, 1)   : round(entry - entryRisk * 3, 1);
    const tp3 = dir === "long" ? round(entry + entryRisk * 4, 1)   : round(entry - entryRisk * 4, 1);
    const rr  = round(Math.abs(tp2 - entry) / entryRisk, 2);

    const score = scoreSetup({ trend, zoneQuality: 0.7, pullbackDepth: Math.min(1, distPct / 2), rr });

    setups.push({
      direction: dir,
      status,
      entryPrice: entry,
      stopPrice:  stop,
      tp1, tp2, tp3,
      rr,
      score,
      description: `Trend pullback naar 4H HL zone @ ${zone.price.toLocaleString("nl-NL")} · ${trend.direction === "long" ? "Daily bullish" : "Daily bearish"} trend · ${distPct.toFixed(1)}% van entry`,
      anchors: [
        { label: `4H HL zone top @ ${zone.high.toLocaleString("nl-NL")}`, price: zone.high, role: "entry-basis" },
        { label: `4H HL zone bodem @ ${zone.low.toLocaleString("nl-NL")}`, price: zone.low,  role: "stop-basis"  }
      ]
    });
  }

  setups.sort((a, b) => b.score - a.score);
  return { setups: setups.slice(0, 2), currentPrice };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function round(v, decimals) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

