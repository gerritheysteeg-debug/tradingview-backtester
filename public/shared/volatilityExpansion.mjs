// Volatility Expansion / Compression Breakout v1
// Detects compression via ATR percentile, then trades the confirmed breakout.

const DEFAULT_OPTIONS = {
  atrLength: 14,
  atrPercentileLookback: 30,
  compressionPercentileThreshold: 35,
  compressionBars: 8,
  volumeExpansionMultiplier: 1.3,
  volumeLookback: 20,
  stopBufferPct: 0.1,
  minRR: 2.0,
  maxHoldBars: 120,
  minimumScoreToTrade: 55,
  direction: "both",
  partials: [
    { r: 1, size: 0.40 },
    { r: 2, size: 0.35 },
    { r: 3, size: 0.25 }
  ]
};

import { simulateTrade, calculateMetrics, buildEquityCurve } from "./tradeSimulator.mjs";

// ─── ATR ─────────────────────────────────────────────────────────────────────

function atr(candles, length) {
  const trList = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur  = candles[i];
    const tr   = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close)
    );
    trList.push(tr);
  }
  // Wilder smoothing
  const result = [trList[0]];
  for (let i = 1; i < trList.length; i++) {
    result.push((result.at(-1) * (length - 1) + trList[i]) / length);
  }
  return result;
}

// ATR percentile rank within the lookback window
function atrPercentile(atrValues, i, lookback) {
  if (i < lookback) return 50;
  const window = atrValues.slice(i - lookback, i + 1);
  const current = window.at(-1);
  const below = window.filter(v => v <= current).length;
  return Math.round((below / window.length) * 100);
}

// ─── EMA bias ────────────────────────────────────────────────────────────────

function ema(values, length) {
  const k = 2 / (length + 1);
  let e = values[0];
  return values.map(v => { e = v * k + e * (1 - k); return e; });
}

function dailyBias(d1Candles) {
  if (!d1Candles || d1Candles.length < 21) return "neutral";
  const closes = d1Candles.map(c => c.close);
  const e20 = ema(closes, 20).at(-1);
  const e50 = ema(closes, 50).at(-1);
  const last = closes.at(-1);
  if (last > e20 && e20 > e50) return "long";
  if (last < e20 && e20 < e50) return "short";
  return "neutral";
}

// ─── Compression detection ────────────────────────────────────────────────────

function detectCompressionBlocks(h4Candles, config) {
  if (h4Candles.length < config.atrLength + config.atrPercentileLookback + config.compressionBars) {
    return [];
  }
  const atrValues = atr(h4Candles, config.atrLength);
  const blocks = [];
  let i = config.atrLength + config.atrPercentileLookback;

  while (i < h4Candles.length - config.compressionBars) {
    // Check if we have at least compressionBars consecutive low-ATR bars
    let compressedCount = 0;
    while (
      i + compressedCount < h4Candles.length &&
      atrPercentile(atrValues, i + compressedCount, config.atrPercentileLookback) <=
        config.compressionPercentileThreshold
    ) {
      compressedCount++;
    }

    if (compressedCount >= config.compressionBars) {
      const compRange = h4Candles.slice(i, i + compressedCount);
      const rangeHigh = Math.max(...compRange.map(c => c.high));
      const rangeLow  = Math.min(...compRange.map(c => c.low));
      const avgAtr    = atrValues.slice(i, i + compressedCount)
        .reduce((s, v) => s + v, 0) / compressedCount;

      blocks.push({
        startIndex: i,
        endIndex:   i + compressedCount - 1,
        startTime:  h4Candles[i].time,
        endTime:    h4Candles[i + compressedCount - 1].time,
        rangeHigh,
        rangeLow,
        rangeHeight: rangeHigh - rangeLow,
        avgAtr,
        breakoutHandled: false
      });
      i += compressedCount; // skip past compression block
    } else {
      i++;
    }
  }
  return blocks;
}

// ─── Volume average ───────────────────────────────────────────────────────────

function avgVol(candles, i, lookback) {
  const sl = candles.slice(Math.max(0, i - lookback), i);
  return sl.reduce((s, c) => s + (c.volume ?? 0), 0) / (sl.length || 1);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreSetup({ compressionBars, compressionQuality, breakoutStrength, volumeRatio, bias, rr }) {
  let score = 0;
  score += Math.min(25, compressionQuality * 25);   // compression quality (0-25)
  score += Math.min(20, breakoutStrength * 20);      // breakout close strength (0-20)
  score += Math.min(15, (volumeRatio - 1) * 15);    // volume expansion (0-15)
  score += bias === "long" || bias === "short" ? 15 : 5;  // daily bias (5-15)
  score += 15;                                        // base entry credit
  score += Math.min(10, (rr / 3) * 10);             // RR bonus
  return Math.round(Math.min(100, score));
}

// ─── Trade simulation ─────────────────────────────────────────────────────────

function simulateVolatilityExpansionTrades(candles, compressionBlocks, bias, config) {
  const trades = [];
  const m3   = candles.m3;
  const m15  = candles.m15;
  const h4   = candles.h4;
  if (!m3.length || !compressionBlocks.length) return trades;

  let openUntilIndex = -1;
  let tradeNum = 1;

  for (let i = 20; i < m3.length - 3; i++) {
    if (i <= openUntilIndex) continue;

    const bar = m3[i];

    for (const block of compressionBlocks) {
      if (block.breakoutHandled) continue;
      // Only look for breakouts after the compression block ended
      if (bar.time <= block.endTime) continue;

      const { rangeHigh, rangeLow, rangeHeight } = block;
      const volAvg = avgVol(m3, i, config.volumeLookback);
      const volCur = bar.volume ?? 0;
      const volRatio = volAvg > 0 ? volCur / volAvg : 1;

      let direction = null;
      // Long breakout: close above range high with volume
      if (
        bar.close > rangeHigh &&
        volRatio >= config.volumeExpansionMultiplier &&
        (config.direction === "both" || config.direction === "long") &&
        (bias === "long" || bias === "neutral")
      ) {
        direction = "long";
      }
      // Short breakout: close below range low with volume
      else if (
        bar.close < rangeLow &&
        volRatio >= config.volumeExpansionMultiplier &&
        (config.direction === "both" || config.direction === "short") &&
        (bias === "short" || bias === "neutral")
      ) {
        direction = "short";
      }

      if (!direction) continue;

      // Look for a 3m retest entry in the next bars
      let entryBar = null;
      let entryIndex = -1;
      for (let j = i + 1; j < Math.min(m3.length, i + 30); j++) {
        const rb = m3[j];
        if (direction === "long") {
          // Retest: price comes back to range high zone
          if (rb.low <= rangeHigh * 1.003 && rb.close > rangeHigh * 0.997) {
            entryBar = rb; entryIndex = j; break;
          }
        } else {
          // Retest: price comes back up to range low zone
          if (rb.high >= rangeLow * 0.997 && rb.close < rangeLow * 1.003) {
            entryBar = rb; entryIndex = j; break;
          }
        }
      }
      // If no retest in 30 bars, use the breakout bar directly
      if (!entryBar) {
        entryBar = m3[i + 1] ?? bar;
        entryIndex = i + 1;
      }

      const entry  = entryBar.open;
      const buf    = config.stopBufferPct / 100;
      const stop   = direction === "long"
        ? round(rangeHigh * (1 - buf), 1)   // stop below the retested range high
        : round(rangeLow  * (1 + buf), 1);   // stop above the retested range low
      const risk   = Math.abs(entry - stop);
      if (risk <= 0) continue;

      const tp1 = direction === "long"
        ? round(entry + rangeHeight * 1.0, 1)
        : round(entry - rangeHeight * 1.0, 1);
      const tp2 = direction === "long"
        ? round(entry + rangeHeight * 2.0, 1)
        : round(entry - rangeHeight * 2.0, 1);
      const tp3 = direction === "long"
        ? round(entry + rangeHeight * 3.0, 1)
        : round(entry - rangeHeight * 3.0, 1);
      const rr  = round(Math.abs(tp2 - entry) / risk, 2);
      if (rr < config.minRR) { block.breakoutHandled = true; continue; }

      const compressionQuality = Math.min(1, (block.endIndex - block.startIndex + 1) / (config.compressionBars * 2));
      const breakoutStrength   = Math.min(1, Math.abs(bar.close - (direction === "long" ? rangeHigh : rangeLow)) / (rangeHeight * 0.5));
      const score = scoreSetup({
        compressionBars: block.endIndex - block.startIndex + 1,
        compressionQuality,
        breakoutStrength,
        volumeRatio,
        bias,
        rr
      });

      if (score < config.minimumScoreToTrade) { block.breakoutHandled = true; continue; }

      const tradeResult = simulateTrade(m3, {
        direction,
        entryIndex,
        entry,
        stop,
        partials:            config.partials,
        moveStopToBEAfterTP: 1,
        maxHoldBars:         config.maxHoldBars,
        meta: {
          id:       `VE${tradeNum}`,
          tp1:      round(tp1, 1),
          tp2:      round(tp2, 1),
          tp3:      round(tp3, 1),
          score,
          stopMode: "range-boundary"
        }
      });

      block.breakoutHandled = true;
      if (!tradeResult) continue;

      tradeNum++;
      trades.push(tradeResult);
      openUntilIndex = tradeResult.exitIndex;
      break;
    }
  }
  return trades;
}

// ─── Public: backtest ─────────────────────────────────────────────────────────

export function runVolatilityExpansionBacktest({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const candles = {
    m3:    candlesByResolution["3m"]  ?? entryCandles,
    m15:   candlesByResolution["15m"] ?? entryCandles,
    h4:    candlesByResolution["4h"]  ?? levelCandles,
    daily: candlesByResolution["1D"]  ?? levelCandles
  };

  const bias             = dailyBias(candles.daily);
  const compressionBlocks = detectCompressionBlocks(candles.h4, config);

  // Expose blocks as "levels" for chart rendering
  const levels = compressionBlocks.map((b, idx) => ({
    id:         `ve-block-${idx}`,
    price:      (b.rangeHigh + b.rangeLow) / 2,
    role:       "compression",
    direction:  "both",
    touchCount: b.endIndex - b.startIndex + 1,
    score:      6,
    broken:     b.breakoutHandled,
    time:       b.startTime,
    rangeHigh:  b.rangeHigh,
    rangeLow:   b.rangeLow
  }));

  const trades  = simulateVolatilityExpansionTrades(candles, compressionBlocks, bias, config);
  const metrics = calculateMetrics(trades);

  return {
    strategy:   "volatility-expansion-v1",
    options:    config,
    levels,
    trades,
    metrics,
    equityCurve: buildEquityCurve(trades),
    meta:        { bias, compressionBlocksFound: compressionBlocks.length }
  };
}

// ─── Public: scan ─────────────────────────────────────────────────────────────

export function scanVolatilityExpansion({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const candles = {
    m3:    candlesByResolution["3m"]  ?? entryCandles,
    m15:   candlesByResolution["15m"] ?? entryCandles,
    h4:    candlesByResolution["4h"]  ?? levelCandles,
    daily: candlesByResolution["1D"]  ?? levelCandles
  };

  const bias              = dailyBias(candles.daily);
  const compressionBlocks = detectCompressionBlocks(candles.h4, config);
  const currentPrice      = candles.m3.at(-1)?.close ?? 0;
  const setups            = [];

  for (const block of compressionBlocks.slice(-4)) {
    const { rangeHigh, rangeLow, rangeHeight } = block;
    const distHigh = Math.abs(currentPrice - rangeHigh) / rangeHigh * 100;
    const distLow  = Math.abs(currentPrice - rangeLow) / rangeLow * 100;

    // Already inside the compression block = watch
    const inBlock = currentPrice >= rangeLow && currentPrice <= rangeHigh;
    const nearTop = distHigh < 0.5;
    const nearBot = distLow  < 0.5;

    let direction = null, status = "pending";
    if (nearTop && (bias === "long" || bias === "neutral")) { direction = "long"; status = "watch"; }
    if (nearBot && (bias === "short" || bias === "neutral")) { direction = "short"; status = "watch"; }
    if (inBlock) { direction = bias !== "neutral" ? bias : "long"; status = "watch"; }
    if (!direction) continue;

    const buf   = config.stopBufferPct / 100;
    const entry = direction === "long"
      ? round(rangeHigh * 1.001, 1)
      : round(rangeLow * 0.999, 1);
    const stop  = direction === "long"
      ? round(rangeHigh * (1 - buf), 1)
      : round(rangeLow  * (1 + buf), 1);
    const risk  = Math.abs(entry - stop);
    const tp1   = direction === "long" ? round(entry + rangeHeight, 1)       : round(entry - rangeHeight, 1);
    const tp2   = direction === "long" ? round(entry + rangeHeight * 2, 1)   : round(entry - rangeHeight * 2, 1);
    const tp3   = direction === "long" ? round(entry + rangeHeight * 3, 1)   : round(entry - rangeHeight * 3, 1);
    const rr    = round(Math.abs(tp2 - entry) / risk, 2);
    if (rr < config.minRR) continue;

    const score = scoreSetup({
      compressionBars: block.endIndex - block.startIndex + 1,
      compressionQuality: 0.8,
      breakoutStrength: 0.5,
      volumeRatio: config.volumeExpansionMultiplier,
      bias,
      rr
    });

    setups.push({
      direction,
      status,
      entry,
      stop,
      tp1, tp2, tp3,
      rr,
      score,
      description: `Compressie breakout · Range ${rangeLow.toLocaleString("nl-NL")}–${rangeHigh.toLocaleString("nl-NL")} · ${block.endIndex - block.startIndex + 1} 4H bars compressie · Bias ${bias}`
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

