import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStrategyRouter,
  buildDecisionSummary
} from "../public/shared/decisionEngine.mjs";

// ─── buildStrategyRouter ──────────────────────────────────────────────────────

test("trend: trend-pullback-v1 is active", () => {
  const router = buildStrategyRouter("trend");
  const active = router.find(s => s.status === "active");
  assert.equal(active?.strategyId, "trend-pullback-v1");
});

test("trend: support-resistance-v1 is blocked", () => {
  const router = buildStrategyRouter("trend");
  const sr = router.find(s => s.strategyId === "support-resistance-v1");
  assert.equal(sr?.status, "blocked");
});

test("range: liquidity-driven-smc-v1 is active", () => {
  const router = buildStrategyRouter("range");
  const active = router.find(s => s.status === "active");
  assert.equal(active?.strategyId, "liquidity-driven-smc-v1");
});

test("range: trend-pullback-v1 is blocked", () => {
  const router = buildStrategyRouter("range");
  const tp = router.find(s => s.strategyId === "trend-pullback-v1");
  assert.equal(tp?.status, "blocked");
});

test("compression: volatility-expansion-v1 is active", () => {
  const router = buildStrategyRouter("compression");
  const active = router.find(s => s.status === "active");
  assert.equal(active?.strategyId, "volatility-expansion-v1");
});

test("expansion: volatility-expansion-v1 is active", () => {
  const router = buildStrategyRouter("expansion");
  const active = router.find(s => s.status === "active");
  assert.equal(active?.strategyId, "volatility-expansion-v1");
});

test("chop: all strategies are no_trade", () => {
  const router = buildStrategyRouter("chop");
  assert.ok(router.length > 0, "router must have entries");
  assert.ok(router.every(s => s.status === "no_trade"), "all must be no_trade in chop");
});

test("exhaustion: liquidity-driven-smc-v1 is active", () => {
  const router = buildStrategyRouter("exhaustion");
  const active = router.find(s => s.status === "active");
  assert.equal(active?.strategyId, "liquidity-driven-smc-v1");
});

test("all regimes return all 5 strategies", () => {
  for (const regime of ["trend", "range", "compression", "expansion", "chop", "exhaustion"]) {
    const router = buildStrategyRouter(regime);
    assert.equal(router.length, 5, `${regime} must return 5 strategies`);
  }
});

// ─── buildDecisionSummary ────────────────────────────────────────────────────

test("confidence >= 70 in trend → recommendation given", () => {
  const router = buildStrategyRouter("trend");
  const { isReliable, recommendedStrategyId } = buildDecisionSummary({ regime: "trend", confidence: 70, strategyRouter: router });
  assert.equal(isReliable, true);
  assert.ok(recommendedStrategyId !== null, "recommendation should be set");
});

test("confidence < 70 → no recommendation even in trend", () => {
  const router = buildStrategyRouter("trend");
  const { isReliable, recommendedStrategyId } = buildDecisionSummary({ regime: "trend", confidence: 69, strategyRouter: router });
  assert.equal(isReliable, false);
  assert.equal(recommendedStrategyId, null);
});

test("chop → no recommendation even at high confidence", () => {
  const router = buildStrategyRouter("chop");
  const { recommendedStrategyId } = buildDecisionSummary({ regime: "chop", confidence: 85, strategyRouter: router });
  assert.equal(recommendedStrategyId, null);
});

test("active strategy in recommendation matches the active status in router", () => {
  const router = buildStrategyRouter("range");
  const { recommendedStrategyId } = buildDecisionSummary({ regime: "range", confidence: 75, strategyRouter: router });
  const activeEntry = router.find(s => s.status === "active");
  assert.equal(recommendedStrategyId, activeEntry?.strategyId);
});
