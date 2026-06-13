const DERIBIT_HTTP_URL =
  process.env.DERIBIT_HTTP_URL ?? "https://www.deribit.com/api/v2";

const RESOLUTION_SPECS = {
  "1m": { apiResolution: "1", intervalMs: 60_000 },
  "3m": { apiResolution: "3", intervalMs: 3 * 60_000 },
  "5m": { apiResolution: "5", intervalMs: 5 * 60_000 },
  "15m": { apiResolution: "15", intervalMs: 15 * 60_000 },
  "30m": { apiResolution: "30", intervalMs: 30 * 60_000 },
  "1h": { apiResolution: "60", intervalMs: 60 * 60_000 },
  "4h": {
    apiResolution: "60",
    intervalMs: 60 * 60_000,
    aggregate: "4h"
  },
  "1D": { apiResolution: "1D", intervalMs: 24 * 60 * 60_000 },
  "1W": {
    apiResolution: "1D",
    intervalMs: 24 * 60 * 60_000,
    aggregate: "1W"
  }
};

const DERIBIT_MAX_BARS_PER_REQUEST = 4_500;

export const SUPPORTED_RESOLUTIONS = Object.keys(RESOLUTION_SPECS);

export function toDeribitResolution(resolution) {
  const spec = RESOLUTION_SPECS[resolution];
  if (!spec) {
    throw new Error(`Unsupported resolution: ${resolution}`);
  }
  return spec.apiResolution;
}

export async function fetchDeribit(path, params = {}) {
  const url = new URL(`${DERIBIT_HTTP_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Deribit HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "Deribit API error");
  }

  return payload.result;
}

export async function getCurrencies() {
  const result = await fetchDeribit("/public/get_currencies");

  return result
    .map((currency) => ({
      code: currency.currency,
      name: currency.currency_long ?? currency.currency
    }))
    .sort((a, b) => {
      const priority = ["BTC", "ETH", "SOL", "XRP", "PAXG"];
      const aPriority = priority.indexOf(a.code);
      const bPriority = priority.indexOf(b.code);
      if (aPriority !== -1 || bPriority !== -1) {
        return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
      }
      return a.code.localeCompare(b.code);
    });
}

export async function getInstruments(currency = "BTC", kind = "future") {
  const result = await fetchDeribit("/public/get_instruments", {
    currency,
    kind,
    expired: false
  });

  return result
    .filter((instrument) => instrument.is_active)
    .map((instrument) => ({
      name: instrument.instrument_name,
      baseCurrency: instrument.base_currency,
      quoteCurrency: instrument.quote_currency,
      kind: instrument.kind,
      tickSize: instrument.tick_size,
      expirationTimestamp: instrument.expiration_timestamp
    }))
    .sort((a, b) => {
      if (a.name.endsWith("PERPETUAL")) return -1;
      if (b.name.endsWith("PERPETUAL")) return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function getCandles({
  instrumentName,
  resolution,
  startTimestamp,
  endTimestamp
}) {
  const spec = RESOLUTION_SPECS[resolution];
  if (!spec) {
    throw new Error(`Unsupported resolution: ${resolution}`);
  }

  const rawCandles = await getRawCandlesInChunks({
    instrumentName,
    apiResolution: spec.apiResolution,
    intervalMs: spec.intervalMs,
    startTimestamp,
    endTimestamp
  });

  if (spec.aggregate === "4h") {
    return aggregateCandles(rawCandles, (timestamp) =>
      Math.floor(timestamp / (4 * 60 * 60_000)) * (4 * 60 * 60_000)
    );
  }

  if (spec.aggregate === "1W") {
    return aggregateCandles(rawCandles, weekBucketTimestamp);
  }

  return rawCandles;
}

async function getRawCandlesInChunks({
  instrumentName,
  apiResolution,
  intervalMs,
  startTimestamp,
  endTimestamp
}) {
  const candlesByTime = new Map();
  const chunkMs = intervalMs * DERIBIT_MAX_BARS_PER_REQUEST;
  let cursor = startTimestamp;

  while (cursor < endTimestamp) {
    const chunkEnd = Math.min(endTimestamp, cursor + chunkMs);
    const candles = await getRawCandles({
      instrumentName,
      apiResolution,
      startTimestamp: cursor,
      endTimestamp: chunkEnd
    });

    for (const candle of candles) {
      candlesByTime.set(candle.timestamp, candle);
    }

    cursor = chunkEnd + intervalMs;
  }

  return [...candlesByTime.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function getRawCandles({
  instrumentName,
  apiResolution,
  startTimestamp,
  endTimestamp
}) {
  const result = await fetchDeribit("/public/get_tradingview_chart_data", {
    instrument_name: instrumentName,
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    resolution: apiResolution
  });

  if (result.status !== "ok") {
    return [];
  }

  return result.ticks.map((timestamp, index) => ({
    time: Math.floor(timestamp / 1000),
    timestamp,
    open: result.open[index],
    high: result.high[index],
    low: result.low[index],
    close: result.close[index],
    volume: result.volume[index] ?? 0
  }));
}

function aggregateCandles(candles, bucketForTimestamp) {
  const buckets = new Map();

  for (const candle of candles) {
    const bucket = bucketForTimestamp(candle.timestamp);
    const existing = buckets.get(bucket);

    if (!existing) {
      buckets.set(bucket, {
        time: Math.floor(bucket / 1000),
        timestamp: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function weekBucketTimestamp(timestamp) {
  const date = new Date(timestamp);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - day
  );
}
