// Shared trade execution engine.
// All strategies delegate stop/partial/break-even logic here so results are
// consistent and comparable across strategies.

/**
 * Simulate a single trade on an array of candles.
 *
 * @param {object[]} candles      - Array of { time, open, high, low, close }
 * @param {object}   setup
 * @param {string}   setup.direction         - "long" | "short"
 * @param {number}   setup.entryIndex        - First candle index to evaluate
 * @param {number}   setup.entry             - Entry price
 * @param {number}   setup.stop              - Initial stop price
 * @param {object[]} setup.partials          - [{ r, size }] fractions; sizes must sum to 1
 * @param {number|null} [setup.moveStopToBEAfterTP=1]
 *                                           - R level that moves stop to break-even (null = off)
 * @param {number}   [setup.maxHoldBars=180] - Max bars before time-exit
 * @param {object}   [setup.meta={}]         - Strategy-specific fields merged into result
 * @returns {object} Trade result
 */
export function simulateTrade(candles, {
  direction,
  entryIndex,
  entry,
  stop,
  partials,
  moveStopToBEAfterTP = 1,
  maxHoldBars = 180,
  meta = {},
  feePct = 0,
  slippagePct = 0
}) {
  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  // Both entry and exit sides: 2 × (fee + slippage) expressed as R-multiples
  const costR = entry > 0 ? round(2 * (feePct + slippagePct) / 100 * entry / risk, 4) : 0;

  const isLong = direction === "long";

  const partialSlots = partials.map(p => ({
    r: p.r,
    size: p.size,
    price: isLong ? entry + risk * p.r : entry - risk * p.r,
    hit: false
  }));

  let realizedR = 0;
  let remaining = 1;
  let activeStop = stop;
  let exitIndex = entryIndex;
  let exitReason = "max_hold";
  let exitPrice = entry;
  let maxFavR = 0;
  let maxAdvR = 0;

  const finalIndex = Math.min(candles.length - 1, entryIndex + maxHoldBars);

  for (let i = entryIndex; i <= finalIndex; i++) {
    const c = candles[i];
    exitIndex = i;

    const fav = isLong ? (c.high - entry) / risk : (entry - c.low) / risk;
    const adv = isLong ? (entry - c.low) / risk  : (c.high - entry) / risk;
    maxFavR = Math.max(maxFavR, fav);
    maxAdvR = Math.max(maxAdvR, adv);

    // ── Stop check ───────────────────────────────────────────────────────────
    const stopHit = isLong ? c.low <= activeStop : c.high >= activeStop;
    if (stopHit) {
      const stopR = isLong
        ? (activeStop - entry) / risk
        : (entry - activeStop) / risk;
      realizedR += stopR * remaining;
      exitPrice = activeStop;
      exitReason = activeStop === entry ? "breakeven_stop" : "stop";
      remaining = 0;
      break;
    }

    // ── Partial exits ─────────────────────────────────────────────────────────
    for (const slot of partialSlots) {
      if (slot.hit) continue;
      const hit = isLong ? c.high >= slot.price : c.low <= slot.price;
      if (!hit) continue;

      slot.hit = true;
      realizedR += slot.r * slot.size;
      remaining -= slot.size;
      exitPrice = slot.price;
      exitReason = `target_${slot.r}r`;

      // Move stop to break-even once the designated R level is hit
      if (moveStopToBEAfterTP !== null && slot.r === moveStopToBEAfterTP) {
        activeStop = entry;
      }
    }

    if (remaining <= 0.0001) { remaining = 0; break; }
  }

  // ── Time exit: close remaining at last candle close ───────────────────────
  if (remaining > 0) {
    const last = candles[exitIndex];
    const openR = isLong
      ? (last.close - entry) / risk
      : (entry - last.close) / risk;
    realizedR += openR * remaining;
    exitPrice = last.close;
    exitReason = "max_hold";
  }

  return {
    ...meta,
    direction,
    entryIndex,
    exitIndex,
    entryTime: candles[entryIndex]?.time ?? 0,
    exitTime:  candles[exitIndex]?.time  ?? 0,
    entry:     round(entry, 8),
    stop:      round(stop, 8),
    exitPrice: round(exitPrice, 8),
    exitReason,
    risk:      round(risk, 8),
    grossRMultiple: round(realizedR, 3),
    costR,
    rMultiple: round(realizedR - costR, 3),
    maxFavorableExcursionR: round(maxFavR, 2),
    maxAdverseExcursionR:   round(maxAdvR, 2),
    partials: partialSlots.map(({ r, size, price, hit }) => ({ r, size, price, hit }))
  };
}

// ─── Shared metrics ───────────────────────────────────────────────────────────

export function calculateMetrics(trades) {
  const wins      = trades.filter(t => t.rMultiple > 0);
  const losses    = trades.filter(t => t.rMultiple < 0);
  const grossWin  = wins.reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0));
  const totalR    = trades.reduce((s, t) => s + t.rMultiple, 0);
  const grossTotalR = trades.reduce((s, t) => s + (t.grossRMultiple ?? t.rMultiple), 0);
  const totalCostR  = trades.reduce((s, t) => s + (t.costR ?? 0), 0);
  const avgScore = trades.length
    ? trades.reduce((s, t) => s + (t.score ?? 0), 0) / trades.length
    : 0;
  const equity = buildEquityCurve(trades);

  return {
    trades:       trades.length,
    wins:         wins.length,
    losses:       losses.length,
    winRate:      trades.length ? round(wins.length / trades.length * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : round(grossWin, 2),
    grossTotalR:  round(grossTotalR, 2),
    totalCostR:   round(totalCostR, 2),
    totalR:       round(totalR, 2),
    averageR:     trades.length ? round(totalR / trades.length, 2) : 0,
    averageScore: round(avgScore, 1),
    maxDrawdownR: round(maxDrawdown(equity), 2)
  };
}

export function buildEquityCurve(trades) {
  let equity = 0;
  return trades.map(t => {
    equity += t.rMultiple;
    return { time: t.exitTime, value: round(equity, 3) };
  });
}

function maxDrawdown(eq) {
  let peak = 0, worst = 0;
  for (const pt of eq) {
    peak  = Math.max(peak, pt.value);
    worst = Math.min(worst, pt.value - peak);
  }
  return Math.abs(worst);
}

function round(v, decimals) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
