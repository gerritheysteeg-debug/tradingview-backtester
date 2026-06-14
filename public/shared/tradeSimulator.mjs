// Shared trade execution engine.
// All strategies delegate stop/partial/break-even logic here so results are
// consistent and comparable across strategies.

/**
 * Simulate a single trade on an array of candles.
 *
 * @param {object[]} candles
 * @param {object}   setup
 * @param {string}   setup.direction             - "long" | "short"
 * @param {number}   setup.entryIndex
 * @param {number}   setup.entry
 * @param {number}   setup.stop
 * @param {object[]} setup.partials              - [{ r, size }]; sizes must sum to 1
 * @param {number|null} [setup.moveStopToBEAfterTP=1]
 * @param {number}   [setup.maxHoldBars=180]
 * @param {object}   [setup.meta={}]
 * @param {number}   [setup.feePct=0]            - Entry+exit fee per side (%)
 * @param {number}   [setup.slippagePct=0]       - Slippage per side (%)
 * @param {number}   [setup.fundingRatePct8h=0]  - Perpetual funding per 8h period (%)
 * @param {string}   [setup.intrabarOrder]       - "pessimistic" | "optimistic" | "random"
 *   Controls what happens when stop AND a TP are both breached on the same candle:
 *   "pessimistic" (default) = stop resolved first → worst realistic outcome.
 *   "optimistic"            = TP resolved first  → best realistic outcome.
 *   "random"                = deterministic per-candle coin flip (reproducible).
 * @returns {object|null}
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
  slippagePct = 0,
  fundingRatePct8h = 0,
  intrabarOrder = "pessimistic"
}) {
  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  // Entry/exit transaction costs — paid once regardless of hold time
  const costR = entry > 0 ? round(2 * (feePct + slippagePct) / 100 * entry / risk, 4) : 0;

  const isLong = direction === "long";

  const partialSlots = partials.map(p => ({
    r: p.r,
    size: p.size,
    price: isLong ? entry + risk * p.r : entry - risk * p.r,
    hit: false
  }));

  let realizedR  = 0;
  let remaining  = 1;
  let activeStop = stop;
  let exitIndex  = entryIndex;
  let exitReason = "max_hold";
  let exitPrice  = entry;
  let maxFavR    = 0;
  let maxAdvR    = 0;

  const finalIndex = Math.min(candles.length - 1, entryIndex + maxHoldBars);

  for (let i = entryIndex; i <= finalIndex; i++) {
    const c = candles[i];
    exitIndex = i;

    const fav = isLong ? (c.high - entry) / risk : (entry - c.low)  / risk;
    const adv = isLong ? (entry - c.low)  / risk : (c.high - entry) / risk;
    maxFavR = Math.max(maxFavR, fav);
    maxAdvR = Math.max(maxAdvR, adv);

    // Determine whether stop or partials are evaluated first this candle.
    // When both are breached on the same candle the order matters.
    const stopFirst = intrabarOrder === "pessimistic"
      || (intrabarOrder === "random" && deterministicRand(c.time) >= 0.5);

    if (!stopFirst) {
      // ── Optimistic: TPs first (may move stop to BE before checking stop) ──
      for (const slot of partialSlots) {
        if (slot.hit) continue;
        if (!(isLong ? c.high >= slot.price : c.low <= slot.price)) continue;
        slot.hit   = true;
        realizedR += slot.r * slot.size;
        remaining -= slot.size;
        exitPrice  = slot.price;
        exitReason = `target_${slot.r}r`;
        if (moveStopToBEAfterTP !== null && slot.r === moveStopToBEAfterTP) activeStop = entry;
      }
      if (remaining <= 0.0001) { remaining = 0; break; }
    }

    // ── Stop check (uses activeStop, which may have just moved to BE) ────────
    if (isLong ? c.low <= activeStop : c.high >= activeStop) {
      const stopRmul = isLong
        ? (activeStop - entry) / risk
        : (entry - activeStop) / risk;
      realizedR += stopRmul * remaining;
      exitPrice  = activeStop;
      exitReason = activeStop === entry ? "breakeven_stop" : "stop";
      remaining  = 0;
      break;
    }

    if (stopFirst) {
      // ── Pessimistic: TPs after stop (stop not hit this candle) ───────────
      for (const slot of partialSlots) {
        if (slot.hit) continue;
        if (!(isLong ? c.high >= slot.price : c.low <= slot.price)) continue;
        slot.hit   = true;
        realizedR += slot.r * slot.size;
        remaining -= slot.size;
        exitPrice  = slot.price;
        exitReason = `target_${slot.r}r`;
        if (moveStopToBEAfterTP !== null && slot.r === moveStopToBEAfterTP) activeStop = entry;
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
    exitPrice  = last.close;
    exitReason = "max_hold";
  }

  // ── Funding cost: every started 8h period while the trade is open ─────────
  const entryTime    = candles[entryIndex]?.time ?? 0;
  const exitTime     = candles[exitIndex]?.time  ?? 0;
  const holdHours    = (exitTime - entryTime) / 3600;
  const periods8h    = Math.ceil(holdHours / 8) || 0;
  const fundingCostR = entry > 0
    ? round(periods8h * fundingRatePct8h / 100 * entry / risk, 4)
    : 0;

  return {
    ...meta,
    direction,
    entryIndex,
    exitIndex,
    entryTime,
    exitTime,
    entry:     round(entry, 8),
    stop:      round(stop, 8),
    exitPrice: round(exitPrice, 8),
    exitReason,
    risk:      round(risk, 8),
    grossRMultiple: round(realizedR, 3),
    costR,
    fundingCostR,
    rMultiple: round(realizedR - costR - fundingCostR, 3),
    maxFavorableExcursionR: round(maxFavR, 2),
    maxAdverseExcursionR:   round(maxAdvR, 2),
    partials: partialSlots.map(({ r, size, price, hit }) => ({ r, size, price, hit }))
  };
}

// ─── Deterministic per-candle random ────────────────────────────────────────
// Same candle time always yields the same coin flip — reproducible across runs.

function deterministicRand(seed) {
  let x = ((seed >>> 0) ^ 0xdeadbeef) * 0x9e3779b9;
  x = ((x ^ (x >>> 16)) * 0x85ebca6b) >>> 0;
  return (x >>> 0) / 0xffffffff;
}

// ─── Shared metrics ───────────────────────────────────────────────────────────

export function calculateMetrics(trades) {
  const wins      = trades.filter(t => t.rMultiple > 0);
  const losses    = trades.filter(t => t.rMultiple < 0);
  const grossWin  = wins.reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0));
  const totalR         = trades.reduce((s, t) => s + t.rMultiple, 0);
  const grossTotalR    = trades.reduce((s, t) => s + (t.grossRMultiple ?? t.rMultiple), 0);
  const totalCostR     = trades.reduce((s, t) => s + (t.costR ?? 0), 0);
  const totalFundingR  = trades.reduce((s, t) => s + (t.fundingCostR ?? 0), 0);
  const avgScore = trades.length
    ? trades.reduce((s, t) => s + (t.score ?? 0), 0) / trades.length
    : 0;
  const equity = buildEquityCurve(trades);

  return {
    trades:         trades.length,
    wins:           wins.length,
    losses:         losses.length,
    winRate:        trades.length ? round(wins.length / trades.length * 100, 1) : 0,
    profitFactor:   grossLoss > 0 ? round(grossWin / grossLoss, 2) : round(grossWin, 2),
    grossTotalR:    round(grossTotalR, 2),
    totalCostR:     round(totalCostR, 2),
    totalFundingR:  round(totalFundingR, 2),
    totalR:         round(totalR, 2),
    averageR:       trades.length ? round(totalR / trades.length, 2) : 0,
    averageScore:   round(avgScore, 1),
    maxDrawdownR:   round(maxDrawdown(equity), 2)
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
