const form = document.querySelector("#control-form");
const statusEl = document.querySelector("#status");
const metricsEl = document.querySelector("#metrics");
const levelsListEl = document.querySelector("#levels-list");
const tradesBodyEl = document.querySelector("#trades-body");
const levelCountEl = document.querySelector("#level-count");
const tradeCountEl = document.querySelector("#trade-count");
const titleEl = document.querySelector("#active-title");
const liveRefreshEl = document.querySelector("#live-refresh");
const chartEl = document.querySelector("#chart");
const strategyEl = document.querySelector("#strategy");
const strategyLabelEl = document.querySelector("#strategy-label");
const currencyEl = document.querySelector("#currency");
const kindEl = document.querySelector("#instrument-kind");
const instrumentEl = document.querySelector("#instrument");
const presetSelectEl = document.querySelector("#preset-select");
const presetNameEl = document.querySelector("#preset-name");
const savePresetEl = document.querySelector("#save-preset");
const deletePresetEl = document.querySelector("#delete-preset");
const srOptionsEl = document.querySelector("#sr-options");
const doopieOptionsEl = document.querySelector("#doopiecash-options");
const smcOptionsEl = document.querySelector("#smc-options");
const strategyDocLinkEl = document.querySelector("#strategy-doc-link");
const strategyDocAnchorEl = document.querySelector("#strategy-doc-anchor");
const toastEl = document.querySelector("#toast");

let _strategiesMeta = [];
const equityChartEl = document.querySelector("#equity-chart");
const monteCarloEl = document.querySelector("#monte-carlo");
const mcStatsEl = document.querySelector("#mc-stats");
const legendMcEl = document.querySelector("#legend-mc");
const streakStripEl = document.querySelector("#streak-strip");
const correlationStatsEl = document.querySelector("#correlation-stats");
const exportCsvEl = document.querySelector("#export-csv");
const monthlyBodyEl = document.querySelector("#monthly-body");
const adviceSectionEl = document.querySelector("#advice-section");
const adviceCardsSwingEl = document.querySelector("#advice-cards-swing");
const adviceCardsDayEl   = document.querySelector("#advice-cards-day");
const adviceCardsScalpEl = document.querySelector("#advice-cards-scalp");
const adviceTimeEl = document.querySelector("#advice-time");
const refreshAdviceEl = document.querySelector("#refresh-advice");

const PRESET_STORAGE_KEY = "tradingResearch.presets.v1";

let chart;
let candleSeries;
let equityChart;
let equitySeries;
let mcSeries = [];
let liveTimer;
let toastTimer;
let lastTrades = [];
let sortState = { col: null, asc: true };
let adviceLines = [];
let focusedTrade = null;
let focusLines = [];
let chartResolution = null;

const metricDefs = [
  ["trades", "Trades"],
  ["winRate", "Winrate", "%"],
  ["profitFactor", "Profit factor"],
  ["grossTotalR", "Gross R"],
  ["totalCostR", "Kosten R"],
  ["totalR", "Net R"],
  ["averageR", "Avg R"],
  ["averageScore", "Avg score"],
  ["maxDrawdownR", "Max DD R"]
];

const TRADING_STYLES = {
  swing: { entryResolution: "4h",  levelResolution: "1D",  lookbackDays: 180 },
  day:   { entryResolution: "15m", levelResolution: "4h",  lookbackDays: 90  },
  scalp: { entryResolution: "3m",  levelResolution: "15m", lookbackDays: 14  }
};

function setStatus(message) {
  statusEl.textContent = message;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 5000);
}

function updateStrategyOptions() {
  const id = strategyEl.value;
  const isDoopie = id === "doopiecash-naked-price-action-v1";
  const isSMC = id === "liquidity-driven-smc-v1";
  const isSROnly = id === "support-resistance-v1";
  srOptionsEl.classList.toggle("hidden", !isSROnly);
  doopieOptionsEl.classList.toggle("hidden", !isDoopie);
  smcOptionsEl.classList.toggle("hidden", !isSMC);

  const meta = _strategiesMeta.find(s => s.id === id);
  if (meta?.docUrl && strategyDocLinkEl && strategyDocAnchorEl) {
    strategyDocAnchorEl.href = meta.docUrl;
    strategyDocLinkEl.classList.remove("hidden");
  } else if (strategyDocLinkEl) {
    strategyDocLinkEl.classList.add("hidden");
  }
}

function formPayload() {
  const data = new FormData(form);
  return {
    strategyId: data.get("strategyId"),
    instrumentName: data.get("instrument"),
    entryResolution: data.get("entryResolution"),
    levelResolution: data.get("levelResolution"),
    lookbackDays: Number(data.get("lookbackDays")),
    options: resolveOptions(data)
  };
}

function resolveOptions(data) {
  const strategyId = data.get("strategyId");
  const isSMC = strategyId === "liquidity-driven-smc-v1";
  return {
    volumeMultiplier: Number(data.get("volumeMultiplier")),
    levelTolerancePct: Number(data.get("levelTolerancePct")),
    direction: data.get("direction"),
    stopMode: data.get("stopMode"),
    maxLevelAgeDays: Number(data.get("maxLevelAgeDays") ?? 0),
    minimumScoreToTrade: isSMC
      ? Number(data.get("smcMinimumScoreToTrade") ?? 65)
      : Number(data.get("minimumScoreToTrade") ?? 70),
    entryModel: data.get("entryModel") ?? "balanced",
    feePct: Number(data.get("feePct") ?? 0.05),
    slippagePct: Number(data.get("slippagePct") ?? 0.02)
  };
}

function currentPresetValues() {
  const data = new FormData(form);
  return {
    currency: data.get("currency"),
    kind: data.get("kind"),
    strategyId: data.get("strategyId"),
    instrument: data.get("instrument"),
    entryResolution: data.get("entryResolution"),
    levelResolution: data.get("levelResolution"),
    lookbackDays: Number(data.get("lookbackDays")),
    volumeMultiplier: Number(data.get("volumeMultiplier")),
    levelTolerancePct: Number(data.get("levelTolerancePct")),
    direction: data.get("direction"),
    stopMode: data.get("stopMode"),
    maxLevelAgeDays: Number(data.get("maxLevelAgeDays") ?? 0),
    minimumScoreToTrade: Number(data.get("minimumScoreToTrade") ?? 70),
    smcMinimumScoreToTrade: Number(data.get("smcMinimumScoreToTrade") ?? 65),
    entryModel: data.get("entryModel") ?? "balanced"
  };
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

async function loadCurrencies() {
  try {
    const { currencies } = await getJson("/api/currencies");
    currencyEl.innerHTML = currencies
      .map(
        (currency) =>
          `<option value="${currency.code}">${currency.code} · ${currency.name}</option>`
      )
      .join("");
    setSelectValue(currencyEl, "BTC");
  } catch (error) {
    console.error(error);
    setStatus("Currencies konden niet worden geladen");
  }
}

async function loadStrategies() {
  try {
    const { strategies } = await getJson("/api/strategies");
    _strategiesMeta = strategies;
    strategyEl.innerHTML = strategies
      .map(
        (strategy) =>
          `<option value="${strategy.id}">${escapeHtml(strategy.name)}</option>`
      )
      .join("");
    setSelectValue(strategyEl, "support-resistance-v1");
    updateStrategyOptions();
  } catch (error) {
    console.error(error);
    showToast("Strategieën konden niet worden geladen");
  }
}

async function loadInstruments({ preferredInstrument = instrumentEl.value } = {}) {
  const currency = currencyEl.value || "BTC";
  const kind = kindEl.value || "future";
  instrumentEl.disabled = true;
  setStatus("Instrumenten laden");

  try {
    const url = `/api/instruments?currency=${encodeURIComponent(currency)}&kind=${encodeURIComponent(kind)}`;
    const { instruments } = await getJson(url);

    if (!instruments.length) {
      instrumentEl.innerHTML = `<option value="${preferredInstrument}">${preferredInstrument}</option>`;
      setStatus(`Geen ${kind}-instrumenten voor ${currency}`);
      return;
    }

    instrumentEl.innerHTML = instruments
      .map(
        (instrument) =>
          `<option value="${instrument.name}">${formatInstrumentLabel(instrument)}</option>`
      )
      .join("");

    const nextInstrument = instruments.some((item) => item.name === preferredInstrument)
      ? preferredInstrument
      : instruments[0].name;
    instrumentEl.value = nextInstrument;
    setStatus("Instrumenten geladen");
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "Instrumenten fout");
  } finally {
    instrumentEl.disabled = false;
  }
}

async function runBacktest() {
  const button = form.querySelector(".primary-button");
  const payload = formPayload();
  button.disabled = true;
  setStatus("Backtest draait");

  try {
    const result = await postJson("/api/backtest", payload);
    renderResult(result);
    setStatus(`Bijgewerkt ${new Date().toLocaleTimeString("nl-NL")}`);
  } catch (error) {
    console.error(error);
    setStatus("Fout");
    showToast(error instanceof Error ? error.message : "Backtest mislukt");
  } finally {
    button.disabled = false;
  }
}

function ensureChart() {
  if (chart) return;

  chart = LightweightCharts.createChart(chartEl, {
    autoSize: true,
    layout: {
      background: { color: "#1a1f22" },
      textColor: "#93a1a8"
    },
    grid: {
      vertLines: { color: "#263036" },
      horzLines: { color: "#263036" }
    },
    rightPriceScale: {
      borderColor: "#323b40"
    },
    timeScale: {
      borderColor: "#323b40",
      timeVisible: true,
      secondsVisible: false
    }
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: "#4cc9b0",
    downColor: "#ff6b6b",
    borderVisible: false,
    wickUpColor: "#4cc9b0",
    wickDownColor: "#ff6b6b"
  });
}

function clearFocusLines() {
  for (const line of focusLines) {
    try { candleSeries.removePriceLine(line); } catch {}
  }
  focusLines = [];
}

function focusTrade(trade) {
  if (!chart || !candleSeries) return;
  focusedTrade = trade;
  clearFocusLines();

  const isLong = trade.direction === "long";

  focusLines.push(candleSeries.createPriceLine({
    price: trade.entry,
    color: isLong ? "#4cc9b0" : "#ff9966",
    lineWidth: 2,
    lineStyle: LightweightCharts.LineStyle.Solid,
    title: `Entry (${trade.id ?? ""})`,
    axisLabelVisible: true
  }));

  focusLines.push(candleSeries.createPriceLine({
    price: trade.stop,
    color: "#ff4040",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    title: "Stop",
    axisLabelVisible: true
  }));

  for (const partial of trade.partials ?? []) {
    if (!Number.isFinite(partial.price)) continue;
    focusLines.push(candleSeries.createPriceLine({
      price: partial.price,
      color: partial.hit ? "#d6ff62" : "rgba(214,255,98,0.3)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      title: `TP${partial.r}R${partial.hit ? " ✓" : ""}`,
      axisLabelVisible: false
    }));
  }

  // Zoom to the trade's time range with breathing room
  const duration = Math.max(trade.exitTime - trade.entryTime, 3600);
  const pad = duration * 0.5;
  try {
    chart.timeScale().setVisibleRange({
      from: trade.entryTime - pad,
      to:   trade.exitTime  + pad
    });
  } catch {}

  document.querySelectorAll("#trades-body tr").forEach(row => {
    const active = row.dataset.tradeEntry === String(trade.entryTime);
    row.classList.toggle("focused-trade", active);
    if (active) row.scrollIntoView({ block: "nearest" });
  });

  document.getElementById("chart-reset-view")?.classList.remove("hidden");
}

function resetFocus() {
  focusedTrade = null;
  clearFocusLines();
  document.querySelectorAll("#trades-body tr").forEach(row => row.classList.remove("focused-trade"));
  document.getElementById("chart-reset-view")?.classList.add("hidden");
  chart?.timeScale().fitContent();
}

async function loadChartCandles(resolution) {
  if (!chart) return;
  const instrument = instrumentEl.value;
  const lookbackDays = Number(form.elements.lookbackDays.value);
  chartResolution = resolution;

  document.querySelectorAll(".tf-btn[data-resolution]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.resolution === resolution);
  });

  try {
    clearFocusLines();
    const { candles } = await getJson(
      `/api/candles?instrument=${encodeURIComponent(instrument)}&resolution=${encodeURIComponent(resolution)}&lookbackDays=${lookbackDays}`
    );
    candleSeries.setData(candles.map(c => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
    })));
    candleSeries.setMarkers(buildMarkers(lastTrades));
    if (focusedTrade) {
      focusTrade(focusedTrade);
    } else {
      chart.timeScale().fitContent();
    }
  } catch {
    showToast("Candles konden niet worden geladen");
  }
}

function renderResult(result) {
  ensureChart();
  strategyLabelEl.textContent = result.strategyName ?? result.strategy;
  titleEl.textContent =
    `${result.instrumentName} · ${result.entryResolution} entries · ` +
    `${result.levelResolution} levels · ${formatStopMode(result.options.stopMode)}`;

  // Reset focus state before loading new data
  focusedTrade = null;
  clearFocusLines();
  document.getElementById("chart-reset-view")?.classList.add("hidden");

  // Update active timeframe button
  chartResolution = result.entryResolution;
  document.querySelectorAll(".tf-btn[data-resolution]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.resolution === result.entryResolution);
  });

  candleSeries.setData(
    result.entryCandles.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }))
  );

  candleSeries.setMarkers(buildMarkers(result.trades));
  renderPriceLines(result.levels);
  renderMetrics(result.metrics);
  renderLevels(result.levels);
  renderTrades(result.trades);
  clearMonteCarlo();
  renderEquityCurve(result.trades);
  renderMonthlyBreakdown(result.trades);
  renderCorrelation(result.trades);
  chart.timeScale().fitContent();
}

function renderPriceLines(levels) {
  if (candleSeries.priceLines) {
    for (const line of candleSeries.priceLines) {
      candleSeries.removePriceLine(line);
    }
  }

  candleSeries.priceLines = levels.slice(0, 8).map((level) =>
    candleSeries.createPriceLine({
      price: level.price,
      color:
        level.type === "support"
          ? "#4cc9b0"
          : level.type === "resistance"
            ? "#ff6b6b"
            : "#f2b84b",
      lineWidth: Math.min(3, Math.max(1, Math.round(level.touches / 2))),
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: false,
      title: ""
    })
  );
}

function ensureEquityChart() {
  if (equityChart) return;
  equityChart = LightweightCharts.createChart(equityChartEl, {
    autoSize: true,
    layout: { background: { color: "#1a1f22" }, textColor: "#93a1a8" },
    grid: { vertLines: { color: "#263036" }, horzLines: { color: "#263036" } },
    rightPriceScale: { borderColor: "#323b40" },
    timeScale: { borderColor: "#323b40", timeVisible: false, secondsVisible: false },
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
  });
  equitySeries = equityChart.addAreaSeries({
    lineColor: "#f2b84b",
    topColor: "rgba(242,184,75,0.22)",
    bottomColor: "rgba(0,0,0,0)",
    lineWidth: 1.5,
    priceFormat: {
      type: "custom",
      formatter: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "R"
    }
  });
  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range) equityChart.timeScale().setVisibleLogicalRange(range);
  });
}

function renderEquityCurve(trades) {
  ensureEquityChart();
  if (!trades.length) { equitySeries.setData([]); return; }
  const sorted = trades.slice().sort((a, b) => a.exitTime - b.exitTime);
  let cumR = 0;
  let lastTime = 0;
  const data = [];
  for (const t of sorted) {
    cumR = parseFloat((cumR + t.rMultiple).toFixed(4));
    const time = Math.max(t.exitTime, lastTime + 1);
    data.push({ time, value: cumR });
    lastTime = time;
  }
  equitySeries.setData(data);
  equityChart.timeScale().fitContent();
}

function clearMonteCarlo() {
  for (const s of mcSeries) {
    try { equityChart.removeSeries(s); } catch (_) {}
  }
  mcSeries = [];
  if (mcStatsEl) mcStatsEl.classList.add("hidden");
  if (legendMcEl) legendMcEl.classList.add("hidden");
}

function computeMonteCarlo(trades, iterations = 1000) {
  if (trades.length < 3) return null;
  const sorted = trades.slice().sort((a, b) => a.exitTime - b.exitTime);
  const rValues = sorted.map(t => t.rMultiple);
  const times = [];
  let lastTime = 0;
  for (const t of sorted) {
    const time = Math.max(t.exitTime, lastTime + 1);
    times.push(time);
    lastTime = time;
  }
  const n = rValues.length;

  // Build [iterations x n] cumulative-R matrix by shuffling R values
  const allPaths = [];
  for (let iter = 0; iter < iterations; iter++) {
    const shuffled = rValues.slice().sort(() => Math.random() - 0.5);
    const path = [];
    let cum = 0;
    for (const r of shuffled) {
      cum = parseFloat((cum + r).toFixed(4));
      path.push(cum);
    }
    allPaths.push(path);
  }

  // Per trade-index: percentile bands
  const p5 = [], p50 = [], p95 = [];
  for (let i = 0; i < n; i++) {
    const col = allPaths.map(path => path[i]).sort((a, b) => a - b);
    const time = times[i];
    p5.push({ time, value: col[Math.floor(iterations * 0.05)] });
    p50.push({ time, value: col[Math.floor(iterations * 0.50)] });
    p95.push({ time, value: col[Math.floor(iterations * 0.95)] });
  }

  // Worst max drawdown in P5 path
  let peak = 0, worstDd = 0;
  for (const pt of p5) {
    if (pt.value > peak) peak = pt.value;
    const dd = peak - pt.value;
    if (dd > worstDd) worstDd = dd;
  }

  return { p5, p50, p95, worstDd, p95End: p95.at(-1)?.value ?? 0 };
}

function renderMonteCarlo(trades) {
  ensureEquityChart();
  clearMonteCarlo();
  const result = computeMonteCarlo(trades);
  if (!result) return;

  const lineSeries = (color, title) => equityChart.addLineSeries({
    color,
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    title,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    priceFormat: { type: "custom", formatter: v => (v >= 0 ? "+" : "") + v.toFixed(2) + "R" }
  });

  const s95 = lineSeries("#4cc9b0", "P95");
  const s50 = lineSeries("#93a1a8", "P50");
  const s5  = lineSeries("#ff6b6b", "P5");
  s95.setData(result.p95);
  s50.setData(result.p50);
  s5.setData(result.p5);
  mcSeries = [s95, s50, s5];

  mcStatsEl.textContent =
    `Monte Carlo 1000× · P5 max drawdown: -${result.worstDd.toFixed(2)}R · P95 eindstand: +${result.p95End.toFixed(2)}R`;
  mcStatsEl.classList.remove("hidden");
  if (legendMcEl) legendMcEl.classList.remove("hidden");
}

function renderMonthlyBreakdown(trades) {
  if (!monthlyBodyEl || !trades.length) {
    if (monthlyBodyEl) monthlyBodyEl.innerHTML = "";
    return;
  }
  const months = new Map();
  for (const t of trades) {
    const d = new Date(t.entryTime * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(t);
  }
  const sorted = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  monthlyBodyEl.innerHTML = sorted
    .map(([month, mTrades]) => {
      const wins = mTrades.filter((t) => t.rMultiple > 0).length;
      const totalR = mTrades.reduce((s, t) => s + t.rMultiple, 0);
      const avgR = totalR / mTrades.length;
      const best = Math.max(...mTrades.map((t) => t.rMultiple));
      const worst = Math.min(...mTrades.map((t) => t.rMultiple));
      const winPct = ((wins / mTrades.length) * 100).toFixed(0);
      const [year, mon] = month.split("-");
      const label = new Date(+year, +mon - 1).toLocaleDateString("nl-NL", {
        month: "short",
        year: "numeric"
      });
      return `<tr>
        <td>${label}</td>
        <td>${mTrades.length}</td>
        <td>${wins}</td>
        <td>${winPct}%</td>
        <td class="${totalR >= 0 ? "positive" : "negative"}">${totalR.toFixed(2)}</td>
        <td class="${avgR >= 0 ? "positive" : "negative"}">${avgR.toFixed(2)}</td>
        <td class="positive">${best.toFixed(2)}</td>
        <td class="negative">${worst.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
}

function renderCorrelation(trades) {
  if (!streakStripEl || !correlationStatsEl) return;
  if (!trades.length) {
    streakStripEl.innerHTML = "";
    correlationStatsEl.innerHTML = "";
    return;
  }

  const sorted = trades.slice().sort((a, b) => a.exitTime - b.exitTime);
  const seq = sorted.map(t => t.rMultiple > 0);

  // Streak analysis
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  const lossStreaks = []; // lengths of each losing streak
  let inLossStreak = false, curLossLen = 0;

  for (const win of seq) {
    if (win) {
      curWin++; curLoss = 0;
      if (inLossStreak) { lossStreaks.push(curLossLen); curLossLen = 0; inLossStreak = false; }
      maxWin = Math.max(maxWin, curWin);
    } else {
      curLoss++; curWin = 0;
      inLossStreak = true; curLossLen++;
      maxLoss = Math.max(maxLoss, curLoss);
    }
  }
  if (inLossStreak) lossStreaks.push(curLossLen);

  const totalLosses = seq.filter(w => !w).length;
  const clusteredLosses = lossStreaks.filter(l => l >= 2).reduce((s, l) => s + l, 0);
  const clusterPct = totalLosses > 0 ? Math.round(clusteredLosses / totalLosses * 100) : 0;
  const avgLossStreak = lossStreaks.length
    ? (lossStreaks.reduce((s, l) => s + l, 0) / lossStreaks.length).toFixed(1)
    : "0";

  // Streak strip — mark first dot of each losing streak
  const streakStarts = new Set();
  let prev = true;
  for (let i = 0; i < seq.length; i++) {
    if (!seq[i] && prev) streakStarts.add(i);
    prev = seq[i];
  }

  streakStripEl.innerHTML = seq.map((win, i) => {
    const cls = win ? "win" : "loss";
    const start = !win && streakStarts.has(i) ? " streak-start" : "";
    const trade = sorted[i];
    const tip = `${trade.direction ?? ""} ${win ? "+" : ""}${trade.rMultiple?.toFixed(2)}R`;
    return `<div class="streak-dot ${cls}${start}" title="${tip}"></div>`;
  }).join("");

  const clusterColor = clusterPct >= 60 ? "danger" : clusterPct >= 40 ? "warning" : "positive";

  correlationStatsEl.innerHTML = `
    <div class="corr-stat">
      <small>Max verliesreeks</small>
      <strong class="danger">${maxLoss}×</strong>
    </div>
    <div class="corr-stat">
      <small>Max winreeks</small>
      <strong class="positive">${maxWin}×</strong>
    </div>
    <div class="corr-stat">
      <small>Verlies clustering</small>
      <strong class="${clusterColor}">${clusterPct}%</strong>
    </div>
    <div class="corr-stat">
      <small>Gem. verliesreeks</small>
      <strong>${avgLossStreak}×</strong>
    </div>
  `;
}

function exportCsv() {
  if (!lastTrades.length) return;
  const rows = [
    ["ID", "Side", "Entry tijd", "Entry", "Stop", "Stop type", "Exit tijd", "Exit prijs", "Score", "R"],
    ...lastTrades.map((t) => [
      t.id,
      t.direction,
      formatTimestamp(t.entryTime),
      t.entry,
      t.stop,
      formatStopMode(t.stopMode),
      formatTimestamp(t.exitTime),
      t.exitPrice,
      t.score ?? "",
      t.rMultiple
    ])
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16);
}

async function fetchAdvice() {
  const payload = formPayload();
  setStatus("Advies ophalen…");

  const scanFor = async (styleKey) => {
    const style = TRADING_STYLES[styleKey];
    const strategy = _strategiesMeta.find(s => s.id === payload.strategyId) ?? {};
    const entryRes   = strategy.chartResolution  ?? style.entryResolution;
    const levelRes   = strategy.levelResolution  ?? style.levelResolution;
    const params = new URLSearchParams({
      instrument:      payload.instrumentName,
      strategy:        payload.strategyId,
      lookbackDays:    style.lookbackDays,
      entryResolution: entryRes,
      levelResolution: levelRes,
      options:         JSON.stringify(payload.options)
    });
    try {
      return await getJson(`/api/next-entry?${params}`);
    } catch {
      return { setups: [], currentPrice: 0 };
    }
  };

  const [swing, day, scalp] = await Promise.all([
    scanFor("swing"),
    scanFor("day"),
    scanFor("scalp")
  ]);

  renderAdvice({ swing, day, scalp });
  setStatus(`Bijgewerkt ${new Date().toLocaleTimeString("nl-NL")}`);
}

function clearAdviceLines() {
  for (const line of adviceLines) {
    try { candleSeries.removePriceLine(line); } catch {}
  }
  adviceLines = [];
}

function setupCardHtml(setup) {
  if (!setup) return `<div class="advice-empty">Geen setup</div>`;
  const isLong = setup.direction === "long";
  const dirLabel = isLong ? "▲ LONG" : "▼ SHORT";
  const grade = setup.score >= 85 ? "A+" : setup.score >= 75 ? "A" : setup.score >= 65 ? "B" : "–";
  return `
    <div class="advice-card ${setup.direction}">
      <div class="advice-header">
        <span class="badge ${setup.status}">${statusLabel(setup.status)}</span>
        <strong>${dirLabel}</strong>
        <span class="advice-score">Score ${setup.score} · ${grade} · RR ${setup.rr}×</span>
      </div>
      <div class="advice-prices">
        <div><small>Entry</small><strong>${formatPrice(setup.entryPrice)}</strong></div>
        <div><small>Stop</small><strong class="negative">${formatPrice(setup.stopPrice)}</strong></div>
        <div><small>TP1</small><strong class="positive">${formatPrice(setup.tp1)}</strong></div>
        <div><small>TP2</small><strong class="positive">${formatPrice(setup.tp2)}</strong></div>
        <div><small>TP3</small><strong class="positive">${formatPrice(setup.tp3)}</strong></div>
      </div>
      <small class="advice-desc">${escapeHtml(setup.description)} · ${escapeHtml(setup.distance)}</small>
    </div>
  `;
}

function renderAdvice({ swing, day, scalp }) {
  const anySetup = swing.setups?.length || day.setups?.length || scalp.setups?.length;
  adviceSectionEl.classList.toggle("hidden", !anySetup);
  if (!anySetup) { clearAdviceLines(); return; }

  adviceTimeEl.textContent = `Bijgewerkt: ${new Date().toLocaleTimeString("nl-NL")}`;

  adviceCardsSwingEl.innerHTML = (swing.setups ?? []).map(setupCardHtml).join("") || `<div class="advice-empty">Geen setup</div>`;
  adviceCardsDayEl.innerHTML   = (day.setups   ?? []).map(setupCardHtml).join("") || `<div class="advice-empty">Geen setup</div>`;
  adviceCardsScalpEl.innerHTML = (scalp.setups ?? []).map(setupCardHtml).join("") || `<div class="advice-empty">Geen setup</div>`;

  if (!candleSeries) return;
  clearAdviceLines();
  for (const setup of [...(day.setups ?? [])].slice(0, 1)) {
    const isLong = setup.direction === "long";
    adviceLines.push(
      candleSeries.createPriceLine({ price: setup.entryPrice, color: "#ffffff", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: `Entry ${setup.direction}`, axisLabelVisible: true }),
      candleSeries.createPriceLine({ price: setup.stopPrice, color: "#ff4040", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: "SL", axisLabelVisible: true }),
      candleSeries.createPriceLine({ price: setup.tp1, color: isLong ? "#4cc9b0" : "#ff9966", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: "TP1", axisLabelVisible: false }),
      candleSeries.createPriceLine({ price: setup.tp2, color: isLong ? "#4cc9b0" : "#ff9966", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: "TP2", axisLabelVisible: false }),
      candleSeries.createPriceLine({ price: setup.tp3, color: "#d6ff62", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: "TP3", axisLabelVisible: true })
    );
  }
}

function statusLabel(status) {
  if (status === "ready") return "Nu";
  if (status === "watch") return "Let op";
  return "Wacht";
}

function buildMarkers(trades) {
  const markers = [];
  const showLabels = trades.length <= 25;

  for (const trade of trades) {
    markers.push({
      time: trade.entryTime,
      position: trade.direction === "long" ? "belowBar" : "aboveBar",
      color: trade.direction === "long" ? "#4cc9b0" : "#ff6b6b",
      shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
      text: showLabels ? `${trade.id} ${trade.rMultiple}R` : ""
    });
    markers.push({
      time: trade.exitTime,
      position: trade.direction === "long" ? "aboveBar" : "belowBar",
      color: trade.rMultiple >= 0 ? "#d6ff62" : "#ff6b6b",
      shape: "circle",
      text: showLabels ? `Exit ${trade.rMultiple}R` : ""
    });
  }
  return markers;
}

function renderMetrics(metrics) {
  metricsEl.innerHTML = metricDefs
    .filter(([key]) => metrics[key] !== undefined)
    .map(([key, label, suffix = ""]) => {
      const value = metrics[key] ?? 0;
      let className = "";
      if (key === "totalCostR") className = "negative";
      else if (key === "grossTotalR") className = value >= 0 ? "positive" : "negative";
      else if (key === "totalR") className = value >= 0 ? "positive" : "negative";
      else if (key.includes("R") && value < 0) className = "negative";
      return `
        <div class="metric">
          <span>${label}</span>
          <strong class="${className}">${value}${suffix}</strong>
        </div>
      `;
    })
    .join("");
}

function renderLevels(levels) {
  levelCountEl.textContent = String(levels.length);
  levelsListEl.innerHTML = levels
    .map((level) => {
      const broken = level.active === false;
      return `
        <div class="level-row${broken ? " invalidated" : ""}">
          <div>
            <strong>${formatPrice(level.price)}</strong>
            <small>${level.type} · ${level.touches} touches${broken ? " · gebroken" : ""}</small>
          </div>
          <small>${level.strength.toFixed(1)}</small>
        </div>
      `;
    })
    .join("");
}

function sortTrades(trades) {
  const { col, asc } = sortState;
  if (!col) return trades.slice().reverse();
  return trades.slice().sort((a, b) => {
    let av = col === "num" ? parseInt(a.id.slice(1)) || 0 : a[col];
    let bv = col === "num" ? parseInt(b.id.slice(1)) || 0 : b[col];
    if (typeof av === "string") return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    av = av ?? 0;
    bv = bv ?? 0;
    return asc ? av - bv : bv - av;
  });
}

function renderTrades(trades) {
  lastTrades = trades;
  tradeCountEl.textContent = String(trades.length);
  tradesBodyEl.innerHTML = sortTrades(trades)
    .map(
      (trade) => `
        <tr data-trade-entry="${trade.entryTime}" class="${focusedTrade?.entryTime === trade.entryTime ? "focused-trade" : ""}">
          <td>${trade.id ?? "-"}</td>
          <td>${trade.direction}</td>
          <td>${formatPrice(trade.entry)}</td>
          <td>${formatPrice(trade.stop)}</td>
          <td>${formatStopMode(trade.stopMode)}</td>
          <td>${formatPrice(trade.exitPrice)}</td>
          <td>${trade.score ?? "-"}</td>
          <td class="${trade.rMultiple >= 0 ? "positive" : "negative"}">${trade.rMultiple}</td>
        </tr>
      `
    )
    .join("");

  tradesBodyEl.querySelectorAll("tr[data-trade-entry]").forEach(row => {
    row.addEventListener("click", () => {
      const entryTime = Number(row.dataset.tradeEntry);
      const trade = lastTrades.find(t => t.entryTime === entryTime);
      if (!trade) return;
      if (focusedTrade?.entryTime === trade.entryTime) {
        resetFocus();
      } else {
        focusTrade(trade);
      }
    });
  });
}

function configureLiveRefresh() {
  clearInterval(liveTimer);
  if (liveRefreshEl.checked) {
    liveTimer = setInterval(runBacktest, 60_000);
  }
}

function renderPresetOptions(selectedId = presetSelectEl.value) {
  const presets = readPresets();
  presetSelectEl.innerHTML = [
    `<option value="">Manual</option>`,
    ...presets.map(
      (preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`
    )
  ].join("");
  presetSelectEl.value = selectedId;
}

function readPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writePresets(presets) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function saveCurrentPreset() {
  const presets = readPresets();
  const existing = presets.find((preset) => preset.id === presetSelectEl.value);
  const name = presetNameEl.value.trim() || existing?.name;

  if (!name) {
    setStatus("Geef de preset een naam");
    return;
  }

  const nextPreset = {
    id: existing?.id ?? `preset-${Date.now()}`,
    name,
    values: currentPresetValues()
  };
  const nextPresets = existing
    ? presets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
    : [...presets, nextPreset];

  writePresets(nextPresets);
  renderPresetOptions(nextPreset.id);
  presetNameEl.value = name;
  setStatus(`Preset opgeslagen: ${name}`);
}

async function applySelectedPreset() {
  const preset = readPresets().find((item) => item.id === presetSelectEl.value);
  if (!preset) {
    presetNameEl.value = "";
    return;
  }

  presetNameEl.value = preset.name;
  await applyPresetValues(preset.values);
  runBacktest();
}

function deleteSelectedPreset() {
  const presetId = presetSelectEl.value;
  if (!presetId) {
    setStatus("Geen preset geselecteerd");
    return;
  }

  const presets = readPresets();
  const preset = presets.find((item) => item.id === presetId);
  writePresets(presets.filter((item) => item.id !== presetId));
  renderPresetOptions("");
  presetNameEl.value = "";
  setStatus(`Preset verwijderd: ${preset?.name ?? "onbekend"}`);
}

async function applyPresetValues(values) {
  setSelectValue(currencyEl, values.currency ?? "BTC");
  setSelectValue(kindEl, values.kind ?? "future");
  setSelectValue(strategyEl, values.strategyId ?? "support-resistance-v1");
  setSelectValue(form.elements.entryResolution, values.entryResolution ?? "15m");
  setSelectValue(form.elements.levelResolution, values.levelResolution ?? "4h");
  setSelectValue(form.elements.direction, values.direction ?? "both");
  setSelectValue(form.elements.stopMode, values.stopMode ?? "swing");
  form.elements.lookbackDays.value = values.lookbackDays ?? 90;
  form.elements.volumeMultiplier.value = values.volumeMultiplier ?? 1.15;
  form.elements.levelTolerancePct.value = values.levelTolerancePct ?? 0.35;
  form.elements.maxLevelAgeDays.value = values.maxLevelAgeDays ?? 0;
  form.elements.minimumScoreToTrade.value = values.minimumScoreToTrade ?? 70;
  form.elements.smcMinimumScoreToTrade.value = values.smcMinimumScoreToTrade ?? 65;
  setSelectValue(form.elements.entryModel, values.entryModel ?? "balanced");
  updateStrategyOptions();
  await loadInstruments({ preferredInstrument: values.instrument ?? "BTC-PERPETUAL" });
}

function setSelectValue(select, value) {
  if (!select || value === undefined || value === null) return;
  const hasValue = [...select.options].some((option) => option.value === value);
  if (!hasValue) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

function formatInstrumentLabel(instrument) {
  if (!instrument.expirationTimestamp || instrument.name.endsWith("PERPETUAL")) {
    return instrument.name;
  }

  const expiry = new Date(instrument.expirationTimestamp).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "2-digit"
  });
  return `${instrument.name} · ${expiry}`;
}

function formatStopMode(mode) {
  if (mode === "structure") return "Structure";
  if (mode === "swing_fallback") return "Swing fallback";
  if (mode === "sweep") return "Sweep low/high";
  if (mode === "level2") return "Level 2";
  return mode === "swing" ? "Swing" : (mode ?? "-");
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return value.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
  if (value >= 10) return value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 5 });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function initialize() {
  renderPresetOptions();
  await loadStrategies();
  await loadCurrencies();
  await loadInstruments({ preferredInstrument: "BTC-PERPETUAL" });
  runBacktest();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runBacktest();
});

currencyEl.addEventListener("change", () => {
  loadInstruments({ preferredInstrument: "" });
});

kindEl.addEventListener("change", () => {
  loadInstruments({ preferredInstrument: "" });
});

strategyEl.addEventListener("change", updateStrategyOptions);

exportCsvEl.addEventListener("click", exportCsv);

monteCarloEl.addEventListener("click", () => {
  if (lastTrades.length < 3) return;
  renderMonteCarlo(lastTrades);
});

refreshAdviceEl.addEventListener("click", async () => {
  try {
    await fetchAdvice();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Advies ophalen mislukt");
  }
});
savePresetEl.addEventListener("click", saveCurrentPreset);
deletePresetEl.addEventListener("click", deleteSelectedPreset);
presetSelectEl.addEventListener("change", applySelectedPreset);
liveRefreshEl.addEventListener("change", configureLiveRefresh);

document.querySelectorAll(".tf-btn[data-resolution]").forEach(btn => {
  btn.addEventListener("click", () => loadChartCandles(btn.dataset.resolution));
});

document.getElementById("chart-reset-view")?.addEventListener("click", resetFocus);

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (sortState.col === col) {
      sortState.asc = !sortState.asc;
    } else {
      sortState.col = col;
      sortState.asc = true;
    }
    document.querySelectorAll("th[data-sort]").forEach((el) => {
      el.classList.remove("sort-asc", "sort-desc");
    });
    th.classList.add(sortState.asc ? "sort-asc" : "sort-desc");
    renderTrades(lastTrades);
  });
});

initialize();
