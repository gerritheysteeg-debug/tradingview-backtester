// Multi-timeframe confluence score.
// Determines how many key timeframes (1W / 1D / 4h) agree on direction,
// returning a 0–100 score plus per-TF details.

const TF_CHECKS = [
  { tf: "1W", lookback: 8,  minCandles: 8  },
  { tf: "1D", lookback: 18, minCandles: 8  },
  { tf: "4h", lookback: 12, minCandles: 8  }
];

/**
 * @param {{ candlesByResolution: Record<string, Array<{time,open,high,low,close}>> }} params
 * @returns {{
 *   score: number,        // 0–100 (% of TFs aligned with dominant direction)
 *   dominant: "long"|"short"|"neutral",
 *   aligned: number,      // count of TFs agreeing with dominant
 *   total: number,        // count of TFs with enough data
 *   details: Array<{ tf: string, bias: string, reason?: string }>
 * }}
 */
export function calcConfluenceScore({ candlesByResolution }) {
  const details = [];
  let longCount = 0, shortCount = 0;

  for (const { tf, lookback, minCandles } of TF_CHECKS) {
    const candles = candlesByResolution[tf] ?? [];
    if (candles.length < minCandles) {
      details.push({ tf, bias: "neutral", reason: "te weinig data" });
      continue;
    }
    const bias = detectBias(candles, candles.length - 1, lookback);
    details.push({ tf, bias });
    if (bias === "long") longCount++;
    else if (bias === "short") shortCount++;
  }

  const total = details.filter(d => !d.reason).length;
  const dominant = longCount > shortCount ? "long" : shortCount > longCount ? "short" : "neutral";
  const aligned = dominant === "long" ? longCount : dominant === "short" ? shortCount : 0;
  const score = total > 0 ? Math.round((aligned / total) * 100) : 0;

  return { score, dominant, aligned, total, details };
}

function detectBias(candles, index, lookback) {
  const sample = candles.slice(Math.max(0, index - lookback), index + 1);
  if (sample.length < 8) return "neutral";
  const closes = sample.map(c => c.close);
  const half = Math.floor(closes.length / 2);
  const firstAvg = avg(closes.slice(0, half));
  const secondAvg = avg(closes.slice(half));
  const lastClose = closes.at(-1);
  const recentHigh = Math.max(...sample.slice(0, -1).map(c => c.high));
  const recentLow  = Math.min(...sample.slice(0, -1).map(c => c.low));
  if (secondAvg > firstAvg && lastClose > recentLow)  return "long";
  if (secondAvg < firstAvg && lastClose < recentHigh) return "short";
  return "neutral";
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
