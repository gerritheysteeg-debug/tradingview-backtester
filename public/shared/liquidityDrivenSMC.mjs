const DEFAULT_OPTIONS = {
  equalLevelTolerancePct: 0.2,
  swingWindow: 3,
  stopBufferPct: 0.05,
  maxBarsToReclaim: 5,
  maxBarsForChoch: 20,
  maxHoldBars: 240,
  minRR: 2.0,
  entryModel: "balanced",
  minimumScoreToTrade: 65,
  direction: "both",
  volumeLookback: 20,
  dailyBiasLookback: 18,
  stopMode: "sweep",
  partials: [
    { r: 1, size: 0.33 },
    { r: 2, size: 0.33 },
    { r: 3, size: 0.34 }
  ]
};

export function runLiquidityDrivenSMCBacktest({
  entryCandles,
  levelCandles,
  candlesByResolution = {},
  options = {}
}) {
  const config = normalizeOptions(options);
  const candles = {
    m3: candlesByResolution["3m"] ?? entryCandles,
    m15: candlesByResolution["15m"] ?? entryCandles,
    h4: candlesByResolution["4h"] ?? levelCandles,
    daily: candlesByResolution["1D"] ?? levelCandles,
    weekly: candlesByResolution["1W"] ?? []
  };

  const pools = buildAllLiquidityPools(candles, config);
  const trades = simulateSMCTrades(candles, pools, config);
  const metrics = calculateMetrics(trades);
  const equityCurve = buildEquityCurve(trades);

  return {
    strategy: "liquidity-driven-smc-v1",
    options: config,
    levels: pools.map(poolToLevel),
    trades,
    metrics,
    equityCurve
  };
}

// ─── Pool detection ───────────────────────────────────────────────────────────

function buildAllLiquidityPools(candles, config) {
  const pools = [];
  let nextId = 1;

  function add(pool) {
    pools.push({ id: `smc-${nextId++}`, swept: false, active: true, ...pool });
  }

  // Equal highs/lows from 4H (strongest)
  for (const pool of detectEqualLevels(candles.h4, config, 1.0)) add(pool);

  // Equal highs/lows from 15m (lower weight)
  for (const pool of detectEqualLevels(candles.m15, config, 0.6)) add(pool);

  // Previous day high/low
  for (const pool of detectPrevDayLevels(candles.daily)) add(pool);

  // Previous week high/low
  for (const pool of detectPrevWeekLevels(candles.weekly)) add(pool);

  // Range boundaries from 4H consolidation
  for (const pool of detectRangeLevels(candles.h4, config)) add(pool);

  return pools;
}

function detectSwings(candles, window) {
  const swings = [];
  for (let i = window; i < candles.length - window; i++) {
    const c = candles[i];
    const left = candles.slice(i - window, i);
    const right = candles.slice(i + 1, i + window + 1);
    if (left.every(x => c.high >= x.high) && right.every(x => c.high >= x.high)) {
      swings.push({ type: "high", price: c.high, time: c.time });
    }
    if (left.every(x => c.low <= x.low) && right.every(x => c.low <= x.low)) {
      swings.push({ type: "low", price: c.low, time: c.time });
    }
  }
  return swings;
}

function detectEqualLevels(candles, config, strengthMultiplier = 1) {
  const pools = [];
  const tol = config.equalLevelTolerancePct / 100;
  const swings = detectSwings(candles, config.swingWindow);
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  function groupLevels(points, direction) {
    const used = new Set();
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const group = [points[i]];
      for (let j = i + 1; j < points.length; j++) {
        if (!used.has(j) && Math.abs(points[j].price - points[i].price) <= points[i].price * tol) {
          group.push(points[j]);
          used.add(j);
        }
      }
      if (group.length < 2) continue;
      const avgPrice = group.reduce((s, x) => s + x.price, 0) / group.length;
      pools.push({
        type: direction === "buy_side" ? "equal_highs" : "equal_lows",
        direction,
        level: avgPrice,
        touchCount: group.length,
        firstTime: group[0].time,
        lastTime: group[group.length - 1].time,
        strength: round(group.length * 3 * strengthMultiplier, 1)
      });
    }
  }

  groupLevels(highs, "buy_side");
  groupLevels(lows, "sell_side");
  return pools;
}

function detectPrevDayLevels(dailyCandles) {
  const pools = [];
  for (let i = 0; i < dailyCandles.length - 1; i++) {
    const d = dailyCandles[i];
    pools.push({
      type: "prev_day_high", direction: "buy_side",
      level: d.high, touchCount: 1,
      firstTime: d.time, lastTime: d.time, strength: 4
    });
    pools.push({
      type: "prev_day_low", direction: "sell_side",
      level: d.low, touchCount: 1,
      firstTime: d.time, lastTime: d.time, strength: 4
    });
  }
  return pools;
}

function detectPrevWeekLevels(weeklyCandles) {
  const pools = [];
  for (let i = 0; i < weeklyCandles.length - 1; i++) {
    const w = weeklyCandles[i];
    pools.push({
      type: "prev_week_high", direction: "buy_side",
      level: w.high, touchCount: 1,
      firstTime: w.time, lastTime: w.time, strength: 7
    });
    pools.push({
      type: "prev_week_low", direction: "sell_side",
      level: w.low, touchCount: 1,
      firstTime: w.time, lastTime: w.time, strength: 7
    });
  }
  return pools;
}

function detectRangeLevels(h4Candles, config) {
  const pools = [];
  const windowSize = 20;
  const seen = { high: [], low: [] };
  const dupTol = 0.003;

  for (let i = windowSize; i < h4Candles.length; i++) {
    const sample = h4Candles.slice(i - windowSize, i);
    const high = Math.max(...sample.map(c => c.high));
    const low = Math.min(...sample.map(c => c.low));
    const mid = (high + low) / 2;
    const rangePct = ((high - low) / mid) * 100;
    if (rangePct >= 8) continue;

    if (!seen.high.some(p => Math.abs(p - high) <= high * dupTol)) {
      seen.high.push(high);
      pools.push({
        type: "range_high", direction: "buy_side",
        level: high, touchCount: 1,
        firstTime: sample[0].time, lastTime: h4Candles[i].time, strength: 3
      });
    }
    if (!seen.low.some(p => Math.abs(p - low) <= low * dupTol)) {
      seen.low.push(low);
      pools.push({
        type: "range_low", direction: "sell_side",
        level: low, touchCount: 1,
        firstTime: sample[0].time, lastTime: h4Candles[i].time, strength: 3
      });
    }
  }
  return pools;
}

// ─── Trade simulation ─────────────────────────────────────────────────────────

function simulateSMCTrades(candles, pools, config) {
  const m3 = candles.m3;
  const trades = [];
  let openUntilIndex = -1;
  const usedPools = new Set();

  // Mutable sweep/reclaim state per pool
  const states = pools.map(pool => ({
    pool,
    swept: false, sweepIndex: -1, sweepExtreme: null,
    reclaimed: false, reclaimIndex: -1
  }));

  for (let i = 30; i < m3.length - 2; i++) {
    const candle = m3[i];

    // Step 1: update sweep states
    for (const st of states) {
      if (st.swept || usedPools.has(st.pool.id)) continue;
      if (st.pool.lastTime >= candle.time) continue;

      if (st.pool.direction === "buy_side" && candle.high > st.pool.level) {
        st.swept = true;
        st.sweepIndex = i;
        st.sweepExtreme = candle.high;
      } else if (st.pool.direction === "sell_side" && candle.low < st.pool.level) {
        st.swept = true;
        st.sweepIndex = i;
        st.sweepExtreme = candle.low;
      }
    }

    // Step 2: update reclaim states
    for (const st of states) {
      if (!st.swept || st.reclaimed || usedPools.has(st.pool.id)) continue;
      if (i - st.sweepIndex > config.maxBarsToReclaim) continue;

      const buyReclaim = st.pool.direction === "buy_side" && candle.close < st.pool.level;
      const sellReclaim = st.pool.direction === "sell_side" && candle.close > st.pool.level;
      if (buyReclaim || sellReclaim) {
        st.reclaimed = true;
        st.reclaimIndex = i;
      }
    }

    if (i <= openUntilIndex) continue;

    // Step 3: build context and find best setup
    const dailyIdx = findCandleIndexAtOrBefore(candles.daily, candle.time);
    const h4Idx = findCandleIndexAtOrBefore(candles.h4, candle.time);
    if (dailyIdx < 12 || h4Idx < 6) continue;

    const dailyBias = detectBias(candles.daily, dailyIdx, config.dailyBiasLookback);
    const h4Bias = detectBias(candles.h4, h4Idx, 12);
    const h4Range = getH4Range(candles.h4, h4Idx);
    const premDisc = getPremiumDiscount(candle.close, h4Range);

    let bestSetup = null;

    for (const st of states) {
      if (!st.reclaimed || usedPools.has(st.pool.id)) continue;
      if (i - st.reclaimIndex > config.maxBarsForChoch) continue;

      const tradeDir = st.pool.direction === "sell_side" ? "long" : "short";
      if (config.direction !== "both" && config.direction !== tradeDir) continue;

      const structShift = detectChochBos(m3, st.reclaimIndex, i, tradeDir, config);
      const needsChoch = config.entryModel !== "aggressive";
      if (needsChoch && !structShift.detected) continue;

      const barsToReclaim = st.reclaimIndex - st.sweepIndex;
      const scoreResult = scoreSetup({
        tradeDir, dailyBias, h4Bias,
        pool: st.pool, barsToReclaim,
        structShift, premDisc, h4Range
      }, config);

      if (scoreResult.total < config.minimumScoreToTrade) continue;

      if (!bestSetup || scoreResult.total > bestSetup.scoreResult.total) {
        bestSetup = { st, tradeDir, structShift, scoreResult, h4Range, dailyBias, h4Bias };
      }
    }

    if (!bestSetup) continue;

    const { st, tradeDir, structShift, scoreResult, dailyBias: dBias, h4Range: range } = bestSetup;
    const buf = config.stopBufferPct / 100;
    const stopPrice = tradeDir === "long"
      ? st.sweepExtreme * (1 - buf)
      : st.sweepExtreme * (1 + buf);

    const entry = candle.close;
    const risk = Math.abs(entry - stopPrice);
    if (!Number.isFinite(risk) || risk <= 0) continue;

    const targetLevel = tradeDir === "long" ? range.high : range.low;
    const estRR = Math.abs(targetLevel - entry) / risk;
    if (estRR < config.minRR) continue;

    const trade = playTrade(m3, i, {
      direction: tradeDir,
      entry,
      stop: stopPrice,
      score: scoreResult.total,
      grade: gradeScore(scoreResult.total),
      poolId: st.pool.id,
      poolType: st.pool.type,
      dailyBias: dBias,
      reasons: scoreResult.reasons,
      initialRR: round(estRR, 2)
    }, config);

    if (!trade) continue;

    usedPools.add(st.pool.id);
    openUntilIndex = trade.exitIndex;
    trades.push({ id: `S${trades.length + 1}`, ...trade });
  }

  for (const st of states) {
    st.pool.active = !usedPools.has(st.pool.id) && !st.swept;
  }

  return trades;
}

// ─── Feature detection helpers ────────────────────────────────────────────────

function detectBias(candles, index, lookback) {
  const sample = candles.slice(Math.max(0, index - lookback), index + 1);
  if (sample.length < 8) return "neutral";
  const closes = sample.map(c => c.close);
  const half = Math.floor(closes.length / 2);
  const firstAvg = avg(closes.slice(0, half));
  const secondAvg = avg(closes.slice(half));
  const lastClose = closes.at(-1);
  const recentHigh = Math.max(...sample.slice(0, -1).map(c => c.high));
  const recentLow = Math.min(...sample.slice(0, -1).map(c => c.low));
  if (secondAvg > firstAvg && lastClose > recentLow) return "long";
  if (secondAvg < firstAvg && lastClose < recentHigh) return "short";
  return "neutral";
}

function detectChochBos(m3, reclaimIndex, currentIndex, direction, config) {
  const lookbackStart = Math.max(0, reclaimIndex - config.maxBarsForChoch);

  if (direction === "long") {
    let refHigh = -Infinity;
    for (let j = lookbackStart; j <= reclaimIndex; j++) {
      refHigh = Math.max(refHigh, m3[j].high);
    }
    for (let j = reclaimIndex; j <= currentIndex; j++) {
      if (m3[j].close > refHigh) {
        return { detected: true, type: "bullish_bos", level: refHigh };
      }
    }
  } else {
    let refLow = Infinity;
    for (let j = lookbackStart; j <= reclaimIndex; j++) {
      refLow = Math.min(refLow, m3[j].low);
    }
    for (let j = reclaimIndex; j <= currentIndex; j++) {
      if (m3[j].close < refLow) {
        return { detected: true, type: "bearish_bos", level: refLow };
      }
    }
  }

  return { detected: false };
}

function getH4Range(h4Candles, h4Idx) {
  const sample = h4Candles.slice(Math.max(0, h4Idx - 30), h4Idx + 1);
  const high = Math.max(...sample.map(c => c.high));
  const low = Math.min(...sample.map(c => c.low));
  return { high, low, midpoint: (high + low) / 2 };
}

function getPremiumDiscount(price, range) {
  if (price > range.midpoint) return "premium";
  if (price < range.midpoint) return "discount";
  return "equilibrium";
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreSetup({ tradeDir, dailyBias, h4Bias, pool, barsToReclaim, structShift, premDisc, h4Range }, config) {
  let total = 0;
  const reasons = [];

  // 1. HTF bias alignment (20pts)
  const dailyAligned = (tradeDir === "long" && dailyBias === "long") ||
                        (tradeDir === "short" && dailyBias === "short");
  const h4Aligned = (tradeDir === "long" && h4Bias === "long") ||
                     (tradeDir === "short" && h4Bias === "short");
  if (dailyAligned && h4Aligned) {
    total += 20; reasons.push("daily + 4H bias aligned");
  } else if (dailyAligned) {
    total += 14; reasons.push("daily bias aligned");
  } else if (dailyBias === "neutral" && h4Aligned) {
    total += 10; reasons.push("neutral daily, 4H aligned");
  } else if (h4Aligned) {
    total += 6; reasons.push("4H bias aligned only");
  }

  // 2. Liquidity pool quality (20pts)
  const poolBaseScore = {
    "prev_week_high": 20, "prev_week_low": 20,
    "prev_day_high": 16, "prev_day_low": 16,
    "equal_highs": 13, "equal_lows": 13,
    "range_high": 9, "range_low": 9
  };
  const pq = Math.min(20, (poolBaseScore[pool.type] ?? 8) + Math.min(4, (pool.touchCount - 1) * 2));
  total += pq;
  reasons.push(`pool: ${pool.type}`);

  // 3. Sweep quality (20pts)
  if (barsToReclaim <= 1) { total += 20; reasons.push("instant reclaim"); }
  else if (barsToReclaim <= 2) { total += 16; reasons.push("fast reclaim (2 bars)"); }
  else if (barsToReclaim <= 3) { total += 12; reasons.push("medium reclaim (3 bars)"); }
  else { total += 7; reasons.push("slow reclaim"); }

  // 4. Structure shift (15pts)
  if (structShift?.detected) {
    total += 15; reasons.push(structShift.type ?? "BOS/CHOCH");
  } else {
    total += 4; // aggressive entry without confirmed structure
  }

  // 5. Premium/discount (10pts)
  const pdOk = (tradeDir === "long" && premDisc === "discount") ||
               (tradeDir === "short" && premDisc === "premium");
  if (pdOk) { total += 10; reasons.push(`in ${premDisc}`); }
  else if (premDisc === "equilibrium") { total += 5; }

  // 6. Entry quality (10pts) — candle close entry always gets partial score
  total += 7;
  reasons.push("close entry");

  // 7. RR quality (5pts)
  total += 5;

  return { total: Math.min(100, total), reasons };
}

function gradeScore(score) {
  if (score >= 85) return "A_plus";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  return "no_trade";
}

// ─── Trade execution ──────────────────────────────────────────────────────────

function playTrade(m3, signalIndex, setup, config) {
  const entryCandle = m3[signalIndex];
  const entry = entryCandle.close;
  const stop = setup.stop;
  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const partials = config.partials.map(p => ({
    ...p,
    hit: false,
    price: setup.direction === "long" ? entry + risk * p.r : entry - risk * p.r
  }));

  let realizedR = 0;
  let remaining = 1;
  let activeStop = stop;
  let exitIndex = signalIndex;
  let exitTime = entryCandle.time;
  let exitPrice = entry;
  let exitReason = "time_exit";
  let maxFavR = 0;
  let maxAdvR = 0;
  const finalIndex = Math.min(m3.length - 1, signalIndex + config.maxHoldBars);

  for (let i = signalIndex + 1; i <= finalIndex; i++) {
    const candle = m3[i];
    exitIndex = i;
    exitTime = candle.time;

    const fav = setup.direction === "long"
      ? (candle.high - entry) / risk
      : (entry - candle.low) / risk;
    const adv = setup.direction === "long"
      ? (entry - candle.low) / risk
      : (candle.high - entry) / risk;
    maxFavR = Math.max(maxFavR, fav);
    maxAdvR = Math.max(maxAdvR, adv);

    const stopHit = setup.direction === "long"
      ? candle.low <= activeStop
      : candle.high >= activeStop;

    if (stopHit) {
      const stopR = setup.direction === "long"
        ? (activeStop - entry) / risk
        : (entry - activeStop) / risk;
      realizedR += stopR * remaining;
      exitPrice = activeStop;
      exitReason = activeStop === entry ? "breakeven_stop" : "stop";
      remaining = 0;
      break;
    }

    for (const partial of partials) {
      if (partial.hit) continue;
      const hit = setup.direction === "long"
        ? candle.high >= partial.price
        : candle.low <= partial.price;
      if (hit) {
        partial.hit = true;
        realizedR += partial.r * partial.size;
        remaining -= partial.size;
        exitPrice = partial.price;
        exitReason = `target_${partial.r}r`;
        if (partial.r === 1) activeStop = entry;
      }
    }

    if (remaining <= 0.0001) { remaining = 0; break; }
  }

  if (remaining > 0) {
    const last = m3[exitIndex];
    const openR = setup.direction === "long"
      ? (last.close - entry) / risk
      : (entry - last.close) / risk;
    realizedR += openR * remaining;
    exitPrice = last.close;
  }

  return {
    direction: setup.direction,
    poolType: setup.poolType,
    poolId: setup.poolId,
    dailyBias: setup.dailyBias,
    score: setup.score,
    grade: setup.grade,
    reasons: setup.reasons ?? [],
    signalIndex,
    entryIndex: signalIndex,
    exitIndex,
    signalTime: entryCandle.time,
    entryTime: entryCandle.time,
    exitTime,
    entry,
    stop,
    exitPrice,
    exitReason,
    risk,
    initialRR: setup.initialRR ?? 0,
    maxFavorableExcursionR: round(maxFavR, 2),
    maxAdverseExcursionR: round(maxAdvR, 2),
    rMultiple: round(realizedR, 3),
    partials: partials.map(({ r, size, price, hit }) => ({ r, size, price, hit }))
  };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function calculateMetrics(trades) {
  const wins = trades.filter(t => t.rMultiple > 0);
  const losses = trades.filter(t => t.rMultiple < 0);
  const grossWin = wins.reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0));
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const avgScore = trades.length
    ? trades.reduce((s, t) => s + t.score, 0) / trades.length
    : 0;
  const equity = buildEquityCurve(trades);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : round(grossWin, 2),
    totalR: round(totalR, 2),
    averageR: trades.length ? round(totalR / trades.length, 2) : 0,
    averageScore: round(avgScore, 1),
    maxDrawdownR: round(maxDrawdown(equity), 2)
  };
}

function buildEquityCurve(trades) {
  let equity = 0;
  return trades.map(t => {
    equity += t.rMultiple;
    return { time: t.exitTime, value: round(equity, 3) };
  });
}

function maxDrawdown(equityCurve) {
  let peak = 0;
  let worst = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.value);
    worst = Math.min(worst, pt.value - peak);
  }
  return Math.abs(worst);
}

function poolToLevel(pool) {
  return {
    id: pool.id,
    price: pool.level,
    type: pool.direction === "sell_side" ? "support" : "resistance",
    touches: pool.touchCount,
    firstTouchTime: pool.firstTime,
    lastTouchTime: pool.lastTime,
    strength: pool.strength ?? 1,
    active: pool.active !== false,
    poolType: pool.type
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findCandleIndexAtOrBefore(candles, time) {
  let lo = 0;
  let hi = candles.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (candles[mid].time <= time) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round(value, decimals = 2) {
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

// ─── Live Signal Scanner ──────────────────────────────────────────────────────

export function scanLiquidityDrivenSMC({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = normalizeOptions(options);
  const m3 = candlesByResolution["3m"] ?? entryCandles;
  const m15 = candlesByResolution["15m"] ?? [];
  const h4 = candlesByResolution["4h"] ?? levelCandles;
  const d1 = candlesByResolution["1D"] ?? [];
  const w1 = candlesByResolution["1W"] ?? [];

  if (!m3.length) return { setups: [], currentPrice: 0 };

  const currentPrice = m3[m3.length - 1].close;
  const pools = buildAllLiquidityPools({ h4, m15, daily: d1, weekly: w1 }, config);
  const d1Bias = d1.length >= 8 ? detectBias(d1, d1.length - 1, 14) : "neutral";

  const sellSideBelow = pools
    .filter(p => !p.swept && p.direction === "sell_side" && p.level < currentPrice * 0.9995)
    .sort((a, b) => b.level - a.level);

  const buySideAbove = pools
    .filter(p => !p.swept && p.direction === "buy_side" && p.level > currentPrice * 1.0005)
    .sort((a, b) => a.level - b.level);

  const setups = [];

  if (sellSideBelow.length && config.direction !== "short") {
    const pool = sellSideBelow[0];
    const stop = round(pool.level * (1 - config.stopBufferPct / 100), 1);
    const risk = currentPrice - stop;
    const tp3 = buySideAbove[0]?.level ?? currentPrice + risk * 3;
    const dist = round((currentPrice - pool.level) / currentPrice * 100, 2);
    const biasBonus = d1Bias === "long" ? 20 : d1Bias === "neutral" ? 10 : 0;

    setups.push({
      direction: "long",
      status: "watch",
      entryPrice: round(currentPrice, 1),
      stopPrice: stop,
      tp1: round(currentPrice + risk, 1),
      tp2: round(currentPrice + risk * 2, 1),
      tp3: round(tp3, 1),
      score: Math.min(100, 40 + Math.round(pool.strength * 4) + biasBonus),
      rr: round(risk > 0 ? (tp3 - currentPrice) / risk : 0, 2),
      description: `${smcPoolFmt(pool.type)} @ ${round(pool.level, 1)} · wacht op sweep & reclaim · D1: ${smcBiasFmt(d1Bias)}`,
      distance: `Liquiditeitspool ${dist}% onder prijs`
    });
  }

  if (buySideAbove.length && config.direction !== "long") {
    const pool = buySideAbove[0];
    const stop = round(pool.level * (1 + config.stopBufferPct / 100), 1);
    const risk = stop - currentPrice;
    const tp3 = sellSideBelow[0]?.level ?? currentPrice - risk * 3;
    const dist = round((pool.level - currentPrice) / currentPrice * 100, 2);
    const biasBonus = d1Bias === "short" ? 20 : d1Bias === "neutral" ? 10 : 0;

    setups.push({
      direction: "short",
      status: "watch",
      entryPrice: round(currentPrice, 1),
      stopPrice: stop,
      tp1: round(currentPrice - risk, 1),
      tp2: round(currentPrice - risk * 2, 1),
      tp3: round(tp3, 1),
      score: Math.min(100, 40 + Math.round(pool.strength * 4) + biasBonus),
      rr: round(risk > 0 ? (currentPrice - tp3) / risk : 0, 2),
      description: `${smcPoolFmt(pool.type)} @ ${round(pool.level, 1)} · wacht op sweep & reclaim · D1: ${smcBiasFmt(d1Bias)}`,
      distance: `Liquiditeitspool ${dist}% boven prijs`
    });
  }

  return { setups, currentPrice };
}

function smcBiasFmt(bias) {
  return bias === "long" ? "bullish" : bias === "short" ? "bearish" : "neutraal";
}

function smcPoolFmt(type) {
  const map = { equal_highs: "Equal Highs", equal_lows: "Equal Lows", prev_day_high: "Prev Day High", prev_day_low: "Prev Day Low", prev_week_high: "Prev Week High", prev_week_low: "Prev Week Low", range_high: "Range High", range_low: "Range Low" };
  return map[type] ?? type;
}

function normalizeOptions(options) {
  const merged = { ...DEFAULT_OPTIONS, ...options, stopMode: "sweep" };
  const total = merged.partials.reduce((s, p) => s + Number(p.size), 0);
  return {
    ...merged,
    partials: merged.partials.map(p => ({
      r: Number(p.r),
      size: Number(p.size) / total
    }))
  };
}
