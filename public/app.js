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
const walkforwardSectionEl = document.querySelector("#walkforward-section");
const wfSplitLabelEl = document.querySelector("#wf-split-label");
const wfMetricsIsEl = document.querySelector("#wf-metrics-is");
const wfMetricsOosEl = document.querySelector("#wf-metrics-oos");
const regimeCheckEl = document.querySelector("#regime-check");
const regimeSectionEl = document.querySelector("#regime-section");
const regimeBadgeEl = document.querySelector("#regime-badge");
const regimeConfidenceEl = document.querySelector("#regime-confidence");
const regimeBiasEl = document.querySelector("#regime-bias");
const regimeRiskEl = document.querySelector("#regime-risk");
const regimeRecEl = document.querySelector("#regime-rec");
const regimeRouterBodyEl = document.querySelector("#regime-router-body");
const regimeTimeEl = document.querySelector("#regime-time, .regime-updated-label");
const regimeSignalsEl = document.querySelector("#regime-signals");
const regimeAddAlertEl = document.querySelector("#regime-add-alert");

const scannerCheckEl = document.querySelector("#scanner-check");
const scannerSectionEl = document.querySelector("#scanner-section");
const scannerCloseEl = document.querySelector("#scanner-close");
const scannerChipsEl = document.querySelector("#scanner-chips");
const scannerAddInputEl = document.querySelector("#scanner-add-input");
const scannerAddBtnEl = document.querySelector("#scanner-add-btn");
const scannerResultsEl = document.querySelector("#scanner-results");
const runScannerEl = document.querySelector("#run-scanner");

const alertsCheckEl = document.querySelector("#alerts-check");
const alertsSectionEl = document.querySelector("#alerts-section");
const alertsCloseEl = document.querySelector("#alerts-close");
const alertsListEl = document.querySelector("#alerts-list");
const alertInstrumentSelEl = document.querySelector("#alert-instrument-sel");
const alertConditionSelEl = document.querySelector("#alert-condition-sel");
const addAlertBtnEl = document.querySelector("#add-alert-btn");
const alertsHintEl = document.querySelector("#alerts-hint");

const dataQualityRowEl = document.querySelector("#data-quality-row");

const tradeDetailPanelEl = document.querySelector("#trade-detail-panel");
const tradeDetailTitleEl = document.querySelector("#trade-detail-title");
const tradeDetailContentEl = document.querySelector("#trade-detail-content");
const tradeDetailCloseEl = document.querySelector("#trade-detail-close");

const presetCompareSectionEl = document.querySelector("#preset-compare-section");
const presetCompareCheckboxesEl = document.querySelector("#preset-compare-checkboxes");
const presetCompareResultsEl = document.querySelector("#preset-compare-results");
const runCompareEl = document.querySelector("#run-compare");
const presetCompareCloseEl = document.querySelector("#preset-compare-close");
const comparePresetsEl = document.querySelector("#compare-presets");

const exportRapportEl = document.querySelector("#export-rapport");
const optimizeCheckEl = document.querySelector("#optimize-check");
const optimizeSectionEl = document.querySelector("#optimize-section");
const optimizeCloseEl = document.querySelector("#optimize-close");
const optimizeParamGridEl = document.querySelector("#optimize-param-grid");
const optimizeComboCountEl = document.querySelector("#optimize-combo-count");
const runOptimizeEl = document.querySelector("#run-optimize");
const optimizeResultsEl = document.querySelector("#optimize-results");

const PRESET_STORAGE_KEY = "tradingResearch.presets.v1";

const PREFERRED_CURRENCIES = ["BTC", "ETH", "PAXG", "BNB", "SOL"];
let _allCurrencies = [];
let _showAllCurrencies = false;

const currencyToggleEl = document.querySelector("#currency-toggle");

let lastBacktestResult = null;

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
  ["totalFundingR", "Funding R"],
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
    slippagePct: Number(data.get("slippagePct") ?? 0.02),
    fundingRatePct8h: Number(data.get("fundingRatePct8h") ?? 0),
    intrabarOrder: data.get("intrabarOrder") ?? "pessimistic",
    outOfSamplePct: Number(data.get("outOfSamplePct") ?? 0)
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
    _allCurrencies = currencies;
    renderCurrencyOptions();
  } catch (error) {
    console.error(error);
    setStatus("Currencies konden niet worden geladen");
  }
}

function renderCurrencyOptions() {
  const prev = currencyEl.value;
  const visible = _showAllCurrencies
    ? _allCurrencies
    : _allCurrencies.filter(c => PREFERRED_CURRENCIES.includes(c.code));
  const list = visible.length ? visible : _allCurrencies;

  currencyEl.innerHTML = list
    .map(c => `<option value="${c.code}">${c.code} · ${c.name}</option>`)
    .join("");
  setSelectValue(currencyEl, PREFERRED_CURRENCIES.includes(prev) || _showAllCurrencies ? prev : "BTC");

  if (currencyToggleEl) {
    currencyToggleEl.textContent = _showAllCurrencies ? "− Minder valuta's" : "+ Meer valuta's";
    currencyToggleEl.classList.toggle("active", _showAllCurrencies);
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

// ─── Trade detail panel ───────────────────────────────────────────────────────

function openTradeDetail(trade) {
  if (!tradeDetailPanelEl) return;
  const dir = trade.direction === "long" ? "▲ LONG" : "▼ SHORT";
  const gradeClass = (trade.rMultiple ?? 0) >= 0 ? "positive" : "negative";

  const rows = [
    ["Richting",    `<strong>${dir}</strong>`],
    ["Entry",       formatPrice(trade.entry)],
    ["Stop",        formatPrice(trade.stop)],
    ["Stop type",   formatStopMode(trade.stopMode)],
    ["Exit",        formatPrice(trade.exitPrice)],
    ["Reden exit",  trade.exitReason ?? "—"],
    ["Score",       trade.score ?? "—"],
    ["Grade",       trade.grade ?? "—"],
    ["R (bruto)",   trade.grossR != null ? `${trade.grossR}R` : "—"],
    ["Kosten R",    trade.costR  != null ? `−${trade.costR}R`  : "—"],
    ["Funding R",   trade.fundingR != null && trade.fundingR !== 0 ? `−${trade.fundingR}R` : "—"],
    ["R (netto)",   `<span class="${gradeClass}">${trade.rMultiple}R</span>`],
    ["MFE",         trade.mfeR != null ? `${trade.mfeR}R max gunstig` : "—"],
    ["MAE",         trade.maeR != null ? `${trade.maeR}R max ongunstig` : "—"],
    ["Bars",        trade.barsHeld != null ? `${trade.barsHeld} bars` : "—"],
    ["Bias",        trade.dailyBias ?? trade.monthlyBias ?? "—"]
  ].filter(([, v]) => v !== "—");

  if (trade.description) {
    rows.push(["Setup uitleg", `<span style="white-space:normal;color:var(--muted);font-size:12px;">${escapeHtml(trade.description)}</span>`]);
  }
  if (trade.reasons?.length) {
    rows.push(["Redenen", escapeHtml(trade.reasons.join(" · "))]);
  }
  if (trade.penalties?.length) {
    rows.push(["Penalties", `<span style="color:var(--danger)">${escapeHtml(trade.penalties.join(" · "))}</span>`]);
  }

  const id = trade.id ?? "?";
  tradeDetailTitleEl.textContent = `Trade #${id} · ${dir}`;
  tradeDetailContentEl.innerHTML = `
    <dl class="trade-detail-grid">
      ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join("")}
    </dl>
  `;
  tradeDetailPanelEl.classList.remove("hidden");
}

function closeTradeDetail() {
  tradeDetailPanelEl?.classList.add("hidden");
}

// ─── Data quality ────────────────────────────────────────────────────────────

function computeDataQuality(entryCandles, levelCandles, entryResolution, levelResolution, lookbackDays) {
  const nowSec = Date.now() / 1000;
  const checks = [];
  const tfData = [
    { label: entryResolution, candles: entryCandles },
    { label: levelResolution, candles: levelCandles }
  ];
  for (const { label, candles } of tfData) {
    if (!Array.isArray(candles) || !label) continue;
    const count = candles.length;
    const lastTime = candles.at(-1)?.time ?? 0;
    const ageHours = lastTime ? Math.round((nowSec - lastTime) / 3600) : null;
    const ok = count >= 5 && (ageHours === null || ageHours < 24);
    checks.push({ label, count, ageHours, ok });
  }
  return checks;
}

function renderDataQuality(checks) {
  if (!dataQualityRowEl || !checks.length) return;
  dataQualityRowEl.classList.remove("hidden");
  dataQualityRowEl.innerHTML = checks.map(c => {
    const cls = c.ok ? "dq-pill ok" : "dq-pill warn";
    const age = c.ageHours != null ? ` · ${c.ageHours}u oud` : "";
    return `<span class="${cls}" title="${c.label}: ${c.count} candles${age}">${c.label} ${c.count}${c.ok ? "" : " ⚠"}</span>`;
  }).join("");
}

// ─── Multi-instrument scanner ─────────────────────────────────────────────────

const SCANNER_KEY = "tradingResearch.scannerInstruments.v1";
const DEFAULT_SCANNER = ["BTC-PERPETUAL", "ETH-PERPETUAL", "SOL-PERPETUAL"];

let _lastRegimeResult = null;

function getScannerInstruments() {
  try { return JSON.parse(localStorage.getItem(SCANNER_KEY) ?? "null") ?? DEFAULT_SCANNER; } catch { return DEFAULT_SCANNER; }
}
function setScannerInstruments(list) {
  localStorage.setItem(SCANNER_KEY, JSON.stringify(list));
}

function renderScannerChips() {
  const list = getScannerInstruments();
  scannerChipsEl.innerHTML = list.map(name => `
    <span class="scanner-chip">
      ${escapeHtml(name)}
      <button class="scanner-chip-remove" data-name="${escapeHtml(name)}" type="button" title="Verwijder">×</button>
    </span>
  `).join("");
  scannerChipsEl.querySelectorAll(".scanner-chip-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const updated = getScannerInstruments().filter(n => n !== btn.dataset.name);
      setScannerInstruments(updated);
      renderScannerChips();
    });
  });
}

async function runScanner() {
  scannerResultsEl.innerHTML = `<p class="scanner-hint">Scannen…</p>`;
  const instruments = getScannerInstruments();
  const results = await Promise.allSettled(instruments.map(async name => {
    const params = new URLSearchParams({ instrument: name, lookbackDays: 90 });
    const data = await getJson(`/api/regime-decision?${params}`);
    return { instrumentName: name, ...data };
  }));

  const rows = results.map((r, i) => ({
    instrumentName: instruments[i],
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? (r.reason?.message ?? "fout") : null,
    ...(r.status === "fulfilled" ? r.value : {})
  }));

  rows.sort((a, b) => {
    if (!a.ok && b.ok) return 1;
    if (a.ok && !b.ok) return -1;
    const aScore = (a.recommendedStrategyId ? 1 : 0) * 200 + (a.confidence ?? 0);
    const bScore = (b.recommendedStrategyId ? 1 : 0) * 200 + (b.confidence ?? 0);
    return bScore - aScore;
  });

  if (!rows.length) { scannerResultsEl.innerHTML = `<p class="scanner-hint">Geen instrumenten geconfigureerd.</p>`; return; }

  scannerResultsEl.innerHTML = `
    <table class="scanner-table">
      <thead><tr><th>Instrument</th><th>Regime</th><th>Conf.</th><th>Bias</th><th>Aanbeveling</th><th>MTF</th></tr></thead>
      <tbody>
        ${rows.map(r => {
          if (!r.ok) return `<tr><td>${escapeHtml(r.instrumentName)}</td><td colspan="5" class="negative">${escapeHtml(r.error)}</td></tr>`;
          const color = REGIME_COLORS[r.regime] ?? "#555";
          const reliCls = r.isReliable ? "positive" : (r.confidence >= 55 ? "" : "negative");
          const rec = r.recommendedStrategyId
            ? (r.strategyRouter?.find(s => s.strategyId === r.recommendedStrategyId)?.name ?? r.recommendedStrategyId)
            : (r.regime === "chop" ? "geen trade" : "—");
          const bias = r.bias === "long" ? "↑ Bull" : r.bias === "short" ? "↓ Bear" : "→";
          const mtf = r.confluence?.score != null ? `${r.confluence.score}%` : "—";
          return `
            <tr class="scanner-row" data-instrument="${escapeHtml(r.instrumentName)}" style="cursor:pointer" title="Klik om te laden">
              <td><strong>${escapeHtml(r.instrumentName)}</strong></td>
              <td style="color:${color};font-weight:700">${escapeHtml(r.regimeLabel ?? r.regime ?? "—")}</td>
              <td class="${reliCls}">${r.confidence ?? 0}%</td>
              <td>${bias}</td>
              <td>${escapeHtml(rec)}</td>
              <td>${mtf}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  scannerResultsEl.querySelectorAll(".scanner-row").forEach(row => {
    row.addEventListener("click", () => {
      const name = row.dataset.instrument;
      const instrEl = document.querySelector("#instrument");
      if (instrEl) {
        setSelectValue(instrEl, name);
        runBacktest();
        scannerSectionEl.classList.add("hidden");
      }
    });
  });
}

// ─── Alerts & watchlist ───────────────────────────────────────────────────────

const ALERTS_KEY = "tradingResearch.alerts.v2";
let _alertTimer = null;

const ALERT_CONDITION_LABELS = {
  regime_reliable: "Regime betrouwbaar (≥ 70%)",
  setup_ready:     "Setup actief voor huidige strategie"
};

function readAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) ?? "[]"); } catch { return []; }
}
function writeAlerts(list) { localStorage.setItem(ALERTS_KEY, JSON.stringify(list)); }

function renderAlertsList() {
  const alerts = readAlerts();
  if (!alerts.length) {
    alertsListEl.innerHTML = `<p class="alerts-hint">Geen actieve alerts.</p>`;
    alertsCheckEl.classList.remove("alerts-active");
    return;
  }
  alertsListEl.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.triggered ? "alert-triggered" : ""}">
      <div class="alert-item-info">
        <strong>${escapeHtml(a.instrumentName)}</strong>
        <span>${escapeHtml(ALERT_CONDITION_LABELS[a.condition] ?? a.condition)}</span>
        ${a.triggeredAt ? `<span class="alert-time">Getriggerd: ${new Date(a.triggeredAt).toLocaleTimeString("nl-NL")}</span>` : ""}
      </div>
      <button class="icon-button alert-remove-btn" data-id="${escapeHtml(a.id)}" type="button" title="Verwijder alert">×</button>
    </div>
  `).join("");
  alertsListEl.querySelectorAll(".alert-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      writeAlerts(readAlerts().filter(a => a.id !== btn.dataset.id));
      renderAlertsList();
    });
  });
  alertsCheckEl.classList.toggle("alerts-active", alerts.some(a => a.triggered));
}

function addAlert(instrumentName, condition) {
  const alerts = readAlerts();
  const existing = alerts.find(a => a.instrumentName === instrumentName && a.condition === condition);
  if (existing) { showToast(`Alert bestaat al: ${instrumentName}`); return; }
  alerts.push({ id: `alert-${Date.now()}`, instrumentName, condition, triggered: false, triggeredAt: null });
  writeAlerts(alerts);
  renderAlertsList();
  showToast(`Alert ingesteld: ${instrumentName}`);
  startAlertPolling();
}

async function checkAlerts() {
  const alerts = readAlerts();
  if (!alerts.length) return;
  let changed = false;
  await Promise.allSettled(alerts.map(async a => {
    if (a.triggered) return;
    try {
      let triggered = false;
      if (a.condition === "regime_reliable") {
        const params = new URLSearchParams({ instrument: a.instrumentName, lookbackDays: 90 });
        const data = await getJson(`/api/regime-decision?${params}`);
        triggered = data.isReliable === true;
      } else if (a.condition === "setup_ready") {
        const strategy = strategyEl.value ?? "support-resistance-v1";
        const params = new URLSearchParams({ instrument: a.instrumentName, strategy, lookbackDays: 90 });
        const data = await getJson(`/api/next-entry?${params}`);
        triggered = (data.setups ?? []).some(s => s.status === "ready");
      }
      if (triggered) {
        a.triggered = true;
        a.triggeredAt = Date.now();
        changed = true;
        fireNotification(a);
      }
    } catch {}
  }));
  if (changed) { writeAlerts(alerts); renderAlertsList(); }
}

function fireNotification(alert) {
  const label = ALERT_CONDITION_LABELS[alert.condition] ?? alert.condition;
  const body = `${alert.instrumentName}: ${label}`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Trading alert", { body, icon: "/favicon.ico" });
  }
  showToast(`🔔 Alert: ${body}`);
}

function startAlertPolling() {
  clearInterval(_alertTimer);
  if (readAlerts().length > 0) {
    _alertTimer = setInterval(checkAlerts, 60_000);
  }
}

function populateAlertInstrumentSel() {
  const instruments = getScannerInstruments();
  const current = document.querySelector("#instrument")?.value;
  const all = current && !instruments.includes(current) ? [current, ...instruments] : instruments;
  alertInstrumentSelEl.innerHTML = all.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (current) setSelectValue(alertInstrumentSelEl, current);
}

// ─── Preset comparison ────────────────────────────────────────────────────────

function openPresetCompare() {
  const presets = readPresets();
  if (presets.length === 0) {
    showToast("Sla eerst presets op om te vergelijken.");
    return;
  }
  presetCompareSectionEl?.classList.remove("hidden");

  presetCompareCheckboxesEl.innerHTML = presets.map(p => `
    <label class="preset-compare-check">
      <input type="checkbox" value="${escapeHtml(p.id)}" name="compare-preset">
      ${escapeHtml(p.name)}
    </label>
  `).join("");
  presetCompareResultsEl.innerHTML = "";
}

async function runPresetComparison() {
  const checked = [...presetCompareCheckboxesEl.querySelectorAll("input[name=compare-preset]:checked")];
  if (checked.length < 2) {
    showToast("Selecteer minimaal 2 presets om te vergelijken.");
    return;
  }
  const allPresets = readPresets();
  const selected = checked.map(cb => allPresets.find(p => p.id === cb.value)).filter(Boolean);
  const instrument = document.querySelector("#instrument")?.value ?? "BTC-PERPETUAL";

  presetCompareResultsEl.innerHTML = `<p style="color:var(--muted);font-size:13px;">Vergelijking laden…</p>`;

  const results = await Promise.allSettled(selected.map(async preset => {
    const v = preset.values;
    const options = {
      direction: v.direction ?? "both",
      stopMode: v.stopMode ?? "swing",
      volumeMultiplier: Number(v.volumeMultiplier ?? 1.5),
      levelTolerancePct: Number(v.levelTolerancePct ?? 0.5),
      maxLevelAgeDays: Number(v.maxLevelAgeDays ?? 0),
      minimumScoreToTrade: Number(v.minimumScoreToTrade ?? 70),
      smcMinimumScoreToTrade: Number(v.smcMinimumScoreToTrade ?? 65),
      entryModel: v.entryModel ?? "balanced",
      feePct: Number(v.feePct ?? 0.05),
      slippagePct: Number(v.slippagePct ?? 0.02),
      fundingRatePct8h: Number(v.fundingRatePct8h ?? 0),
      intrabarOrder: v.intrabarOrder ?? "pessimistic",
      outOfSamplePct: Number(v.outOfSamplePct ?? 0)
    };
    const resp = await fetch("/api/backtest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrumentName: instrument,
        strategyId: v.strategyId ?? "support-resistance-v1",
        lookbackDays: Number(v.lookbackDays ?? 90),
        options
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { preset, metrics: data.metrics, oos: data.oosMetrics ?? null };
  }));

  const cols = ["Trades", "Winrate", "Profit Factor", "Gross R", "Net R", "Max DD", "OOS R"];
  const rows = results.map((r, i) => {
    if (r.status === "rejected") {
      return `<tr><td colspan="${cols.length + 1}" style="color:var(--danger)">${escapeHtml(selected[i].name)}: fout — ${escapeHtml(r.reason?.message ?? "onbekend")}</td></tr>`;
    }
    const m = r.value.metrics;
    const oos = r.value.oos;
    return `
      <tr>
        <td><strong>${escapeHtml(r.value.preset.name)}</strong></td>
        <td>${m.trades ?? 0}</td>
        <td class="${(m.winRate ?? 0) >= 50 ? "positive" : "negative"}">${(m.winRate ?? 0).toFixed(1)}%</td>
        <td class="${(m.profitFactor ?? 0) >= 1.5 ? "positive" : (m.profitFactor ?? 0) >= 1 ? "" : "negative"}">${(m.profitFactor ?? 0).toFixed(2)}</td>
        <td>${(m.grossTotalR ?? 0).toFixed(1)}R</td>
        <td class="${(m.totalR ?? 0) >= 0 ? "positive" : "negative"}">${(m.totalR ?? 0).toFixed(1)}R</td>
        <td class="${(m.maxDrawdownR ?? 0) >= -3 ? "" : "negative"}">${(m.maxDrawdownR ?? 0).toFixed(1)}R</td>
        <td class="${oos ? ((oos.totalR ?? 0) >= 0 ? "positive" : "negative") : ""}">${oos ? `${(oos.totalR ?? 0).toFixed(1)}R` : "—"}</td>
      </tr>
    `;
  });

  presetCompareResultsEl.innerHTML = `
    <table class="preset-compare-table">
      <thead>
        <tr>
          <th>Preset</th>
          ${cols.map(c => `<th>${c}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
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

const WF_METRIC_DEFS = [
  ["trades", "Trades"],
  ["winRate", "Winrate", "%"],
  ["profitFactor", "PF"],
  ["totalR", "Net R"],
  ["averageR", "Avg R"],
  ["maxDrawdownR", "Max DD"]
];

function renderWalkForward(wf) {
  if (!wf || !walkforwardSectionEl) return;
  walkforwardSectionEl.classList.remove("hidden");

  const splitDate = new Date(wf.splitTime * 1000).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric"
  });
  wfSplitLabelEl.textContent = `Splitpunt: ${splitDate} · OOS ${wf.oosPct}%`;

  function buildMetrics(metrics, el) {
    el.innerHTML = WF_METRIC_DEFS
      .filter(([key]) => metrics[key] !== undefined)
      .map(([key, label, suffix = ""]) => {
        const value = metrics[key] ?? 0;
        let cls = "";
        if (key === "totalR" || key === "averageR") cls = value >= 0 ? "positive" : "negative";
        if (key === "maxDrawdownR") cls = value > 2 ? "negative" : "warning";
        return `<div class="wf-stat">
          <small>${label}</small>
          <strong class="${cls}">${value}${suffix}</strong>
        </div>`;
      }).join("");
  }

  buildMetrics(wf.metricsIS,  wfMetricsIsEl);
  buildMetrics(wf.metricsOOS, wfMetricsOosEl);
}

function renderResult(result) {
  lastBacktestResult = result;
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
  if (result.walkForward) {
    renderWalkForward(result.walkForward);
  } else {
    walkforwardSectionEl?.classList.add("hidden");
  }
  renderLevels(result.levels);
  renderTrades(result.trades);
  clearMonteCarlo();
  renderEquityCurve(result.trades);
  renderMonthlyBreakdown(result.trades);
  renderCorrelation(result.trades);
  chart.timeScale().fitContent();

  const dqChecks = computeDataQuality(
    result.entryCandles ?? [], result.levelCandles ?? [],
    result.entryResolution, result.levelResolution, result.lookbackDays
  );
  renderDataQuality(dqChecks);
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

// ─── HTML rapport export ──────────────────────────────────────────────────────

function buildEquitySvg(trades, width = 600, height = 120) {
  if (!trades.length) return "<p style='color:#666'>Geen trades</p>";
  const sorted = trades.slice().sort((a, b) => a.exitTime - b.exitTime);
  let cum = 0;
  const pts = sorted.map(t => { cum = parseFloat((cum + t.rMultiple).toFixed(4)); return cum; });
  const min = Math.min(0, ...pts);
  const max = Math.max(0, ...pts);
  const range = max - min || 1;
  const pad = 10;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i) => pad + (i / (pts.length - 1)) * w;
  const y = (v) => pad + h - ((v - min) / range) * h;
  const zeroY = y(0);
  const points = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = pts.at(-1) >= 0 ? "#4cc9b0" : "#ff6b6b";
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:${height}px">
    <line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${width - pad}" y2="${zeroY.toFixed(1)}" stroke="#444" stroke-width="1"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts.at(-1)).toFixed(1)}" r="3" fill="${color}"/>
  </svg>`;
}

function buildMonthlyTableRows(trades) {
  if (!trades.length) return "<tr><td colspan='8' style='color:#666'>Geen trades</td></tr>";
  const months = new Map();
  for (const t of trades) {
    const d = new Date(t.entryTime * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(t);
  }
  return [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, mTrades]) => {
    const wins = mTrades.filter(t => t.rMultiple > 0).length;
    const totalR = mTrades.reduce((s, t) => s + t.rMultiple, 0);
    const avgR = totalR / mTrades.length;
    const best = Math.max(...mTrades.map(t => t.rMultiple));
    const worst = Math.min(...mTrades.map(t => t.rMultiple));
    const winPct = ((wins / mTrades.length) * 100).toFixed(0);
    const [year, mon] = month.split("-");
    const label = new Date(+year, +mon - 1).toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
    const rColor = totalR >= 0 ? "#4cc9b0" : "#ff6b6b";
    return `<tr><td>${label}</td><td>${mTrades.length}</td><td>${wins}</td><td>${winPct}%</td>
      <td style="color:${rColor}">${totalR.toFixed(2)}R</td>
      <td style="color:${avgR >= 0 ? "#4cc9b0" : "#ff6b6b"}">${avgR.toFixed(2)}R</td>
      <td style="color:#4cc9b0">${best.toFixed(2)}R</td>
      <td style="color:#ff6b6b">${worst.toFixed(2)}R</td></tr>`;
  }).join("");
}

function generateHtmlReport(result) {
  const m = result.metrics ?? {};
  const wf = result.walkForward;
  const trades = result.trades ?? [];
  const sorted = trades.slice().sort((a, b) => b.rMultiple - a.rMultiple);
  const top10 = sorted.slice(0, 10);
  const worst10 = sorted.slice(-10).reverse();
  const now = new Date().toLocaleString("nl-NL");

  const mc = computeMonteCarlo(trades);

  const metricRow = (label, value, color = "") =>
    `<tr><td>${label}</td><td style="text-align:right;font-weight:600;color:${color}">${value}</td></tr>`;

  const wfSection = wf ? `
    <h2>Walk-forward validatie</h2>
    <p>Splitpunt: ${new Date(wf.splitTime * 1000).toLocaleDateString("nl-NL")} · OOS ${wf.oosPct}%</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div>
        <h3 style="margin:0 0 8px;font-size:13px;color:#aaa">In-sample</h3>
        <table class="rt">${["trades","winRate","totalR","maxDrawdownR"].filter(k => wf.metricsIS[k] !== undefined).map(k =>
          metricRow(k, wf.metricsIS[k] + (k === "winRate" ? "%" : "R"), k === "totalR" ? (wf.metricsIS[k] >= 0 ? "#4cc9b0" : "#ff6b6b") : "")
        ).join("")}</table>
      </div>
      <div>
        <h3 style="margin:0 0 8px;font-size:13px;color:#f2b84b">Out-of-sample</h3>
        <table class="rt">${["trades","winRate","totalR","maxDrawdownR"].filter(k => wf.metricsOOS[k] !== undefined).map(k =>
          metricRow(k, wf.metricsOOS[k] + (k === "winRate" ? "%" : "R"), k === "totalR" ? (wf.metricsOOS[k] >= 0 ? "#4cc9b0" : "#ff6b6b") : "")
        ).join("")}</table>
      </div>
    </div>` : "";

  const mcSection = mc ? `
    <h2>Monte Carlo (1000×)</h2>
    <table class="rt" style="margin-bottom:24px">
      ${metricRow("P95 eindstand", "+" + mc.p95End.toFixed(2) + "R", "#4cc9b0")}
      ${metricRow("P50 eindstand (mediaan)", (mc.p50.at(-1)?.value ?? 0).toFixed(2) + "R")}
      ${metricRow("P5 max drawdown", "-" + mc.worstDd.toFixed(2) + "R", "#ff6b6b")}
    </table>` : "";

  const tradeTableRows = (tradeList) => tradeList.map(t => {
    const color = t.rMultiple >= 0 ? "#4cc9b0" : "#ff6b6b";
    return `<tr>
      <td>${t.id ?? "-"}</td>
      <td>${t.direction}</td>
      <td>${formatTimestamp(t.entryTime)}</td>
      <td>${formatPrice(t.entry)}</td>
      <td>${formatPrice(t.stop)}</td>
      <td>${formatPrice(t.exitPrice)}</td>
      <td>${t.score ?? "-"}</td>
      <td style="color:${color};font-weight:600">${t.rMultiple}R</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Backtest rapport · ${result.instrumentName} · ${now}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #fff; color: #111; padding: 32px; font-size: 14px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 14px; }
  .metric-card small { display: block; color: #666; font-size: 11px; }
  .metric-card strong { font-size: 20px; }
  .positive { color: #0a7a5a; }
  .negative { color: #cc2222; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
  th { background: #f5f5f5; font-weight: 600; }
  .rt { width: auto; min-width: 220px; }
  .rt td:first-child { color: #666; width: 160px; }
  @media print {
    body { padding: 16px; }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>
<h1>${result.instrumentName} · ${result.strategyName ?? result.strategyId}</h1>
<p class="meta">Entry: ${result.entryResolution} · Levels: ${result.levelResolution} · ${result.lookbackDays} dagen lookback · Rapport gegenereerd ${now}</p>

<h2>Samenvatting</h2>
<div class="summary-grid">
  <div class="metric-card"><small>Trades</small><strong>${m.trades ?? 0}</strong></div>
  <div class="metric-card"><small>Winrate</small><strong class="${(m.winRate ?? 0) >= 50 ? "positive" : "negative"}">${m.winRate ?? 0}%</strong></div>
  <div class="metric-card"><small>Profit factor</small><strong class="${(m.profitFactor ?? 0) >= 1.5 ? "positive" : (m.profitFactor ?? 0) >= 1 ? "" : "negative"}">${m.profitFactor ?? 0}</strong></div>
  <div class="metric-card"><small>Gross R</small><strong>${m.grossTotalR ?? 0}R</strong></div>
  <div class="metric-card"><small>Net R</small><strong class="${(m.totalR ?? 0) >= 0 ? "positive" : "negative"}">${m.totalR ?? 0}R</strong></div>
  <div class="metric-card"><small>Avg R</small><strong class="${(m.averageR ?? 0) >= 0 ? "positive" : "negative"}">${m.averageR ?? 0}R</strong></div>
  <div class="metric-card"><small>Max DD R</small><strong class="${Math.abs(m.maxDrawdownR ?? 0) > 3 ? "negative" : ""}">${m.maxDrawdownR ?? 0}R</strong></div>
  <div class="metric-card"><small>Kosten R</small><strong class="negative">${m.totalCostR ?? 0}R</strong></div>
</div>

<h2>Equity curve</h2>
${buildEquitySvg(trades)}

${wfSection}
${mcSection}

<h2>Beste 10 trades</h2>
<table>
  <thead><tr><th>ID</th><th>Side</th><th>Entry tijd</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Score</th><th>R</th></tr></thead>
  <tbody>${tradeTableRows(top10)}</tbody>
</table>

<h2>Slechtste 10 trades</h2>
<table>
  <thead><tr><th>ID</th><th>Side</th><th>Entry tijd</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Score</th><th>R</th></tr></thead>
  <tbody>${tradeTableRows(worst10)}</tbody>
</table>

<h2>Maandelijks overzicht</h2>
<table>
  <thead><tr><th>Maand</th><th>Trades</th><th>Wins</th><th>Win%</th><th>Totaal R</th><th>Avg R</th><th>Best</th><th>Worst</th></tr></thead>
  <tbody>${buildMonthlyTableRows(trades)}</tbody>
</table>

<h2>Alle trades (${trades.length})</h2>
<table>
  <thead><tr><th>ID</th><th>Side</th><th>Entry tijd</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Score</th><th>R</th></tr></thead>
  <tbody>${tradeTableRows(trades.slice().sort((a, b) => a.entryTime - b.entryTime))}</tbody>
</table>

<p style="margin-top:32px;color:#999;font-size:11px">Trading Research Backtester · ${now}</p>
</body>
</html>`;
}

function exportReport() {
  if (!lastBacktestResult) { showToast("Voer eerst een backtest uit."); return; }
  const html = generateHtmlReport(lastBacktestResult);
  const win = window.open("", "_blank");
  if (!win) { showToast("Pop-up geblokkeerd — sta pop-ups toe."); return; }
  win.document.write(html);
  win.document.close();
}

// ─── Parameter optimalisatie ──────────────────────────────────────────────────

const STRATEGY_PARAM_GRIDS = {
  "support-resistance-v1": {
    volumeMultiplier:  { label: "Volume multiplier",  values: [1.0, 1.5, 2.0, 2.5, 3.0] },
    levelTolerancePct: { label: "Level tolerantie %", values: [0.3, 0.5, 0.8, 1.0] }
  },
  "doopiecash-naked-price-action-v1": {
    minimumScoreToTrade: { label: "Min. score",        values: [60, 65, 70, 75, 80, 85] },
    volumeMultiplier:    { label: "Volume multiplier", values: [1.0, 1.2, 1.5, 2.0] }
  },
  "liquidity-driven-smc-v1": {
    smcMinimumScoreToTrade: { label: "SMC min. score", values: [55, 60, 65, 70, 75] }
  },
  "trend-pullback-v1": {
    volumeMultiplier:  { label: "Volume multiplier",  values: [1.0, 1.5, 2.0, 2.5] },
    levelTolerancePct: { label: "Level tolerantie %", values: [0.3, 0.5, 0.8] }
  },
  "volatility-expansion-v1": {
    volumeMultiplier: { label: "Volume multiplier", values: [1.5, 2.0, 2.5, 3.0] }
  }
};

function getCheckedOptimizeGrid() {
  const grid = {};
  if (!optimizeParamGridEl) return grid;
  optimizeParamGridEl.querySelectorAll(".opt-param-group").forEach(group => {
    const param = group.dataset.param;
    const checked = [...group.querySelectorAll("input[type=checkbox]:checked")].map(cb => Number(cb.value));
    if (checked.length > 0) grid[param] = checked;
  });
  return grid;
}

function cartesianCount(grid) {
  return Object.values(grid).reduce((acc, vals) => acc * vals.length, 1);
}

function updateOptimizeComboCount() {
  const grid = getCheckedOptimizeGrid();
  const keys = Object.keys(grid);
  const count = keys.length === 0 ? 0 : cartesianCount(grid);
  if (optimizeComboCountEl) {
    const color = count > 200 ? "var(--danger)" : count > 100 ? "var(--warning)" : "";
    optimizeComboCountEl.textContent = `Combinaties: ${count}${count > 200 ? " (max 200)" : ""}`;
    optimizeComboCountEl.style.color = color;
  }
}

function renderOptimizeParams(strategyId) {
  if (!optimizeParamGridEl) return;
  const paramDefs = STRATEGY_PARAM_GRIDS[strategyId];
  if (!paramDefs) {
    optimizeParamGridEl.innerHTML = `<p style="color:var(--muted);font-size:13px">Geen parameteropties beschikbaar voor deze strategie.</p>`;
    updateOptimizeComboCount();
    return;
  }
  optimizeParamGridEl.innerHTML = Object.entries(paramDefs).map(([param, def]) => `
    <div class="opt-param-group" data-param="${param}">
      <div class="opt-param-label">${escapeHtml(def.label)}</div>
      <div class="opt-param-values">
        ${def.values.map(v => `
          <label class="opt-value-check">
            <input type="checkbox" value="${v}" checked>
            ${v}
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");
  optimizeParamGridEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", updateOptimizeComboCount);
  });
  updateOptimizeComboCount();
}

async function runOptimize() {
  if (!optimizeResultsEl) return;
  const strategyId = strategyEl.value;
  const instrument = instrumentEl.value;
  const lookbackDays = Number(form.elements.lookbackDays.value ?? 90);
  const paramGrid = getCheckedOptimizeGrid();

  if (!Object.keys(paramGrid).length) {
    showToast("Selecteer minimaal één parameter om te optimaliseren.");
    return;
  }
  const count = cartesianCount(paramGrid);
  if (count > 200) {
    showToast(`Te veel combinaties: ${count}. Verwijder enkele waarden (max 200).`);
    return;
  }

  optimizeResultsEl.innerHTML = `<p class="optimize-running">Bezig met ${count} combinaties op ${instrument}…</p>`;
  if (runOptimizeEl) runOptimizeEl.disabled = true;

  const baseOptions = {
    direction: form.elements.direction.value ?? "both",
    stopMode: form.elements.stopMode.value ?? "swing",
    feePct: Number(form.elements.feePct?.value ?? 0.05),
    slippagePct: Number(form.elements.slippagePct?.value ?? 0.02),
    fundingRatePct8h: Number(form.elements.fundingRatePct8h?.value ?? 0),
    intrabarOrder: form.elements.intrabarOrder?.value ?? "pessimistic"
  };

  try {
    const result = await postJson("/api/optimize", {
      instrumentName: instrument,
      strategyId,
      lookbackDays,
      outOfSamplePct: 20,
      paramGrid,
      baseOptions
    });

    const paramKeys = Object.keys(result.results[0]?.params ?? {});
    const rows = result.results.map(r => {
      const isM  = r.isMetrics  ?? {};
      const oosM = r.oosMetrics ?? {};
      const ratio = r.ratio;
      const paramCells = paramKeys.map(k => `<td>${r.params[k] ?? "—"}</td>`).join("");
      const ratioColor = ratio == null ? "" : ratio >= 80 ? "#4cc9b0" : ratio >= 50 ? "#f2b84b" : "#ff6b6b";
      return `<tr>
        ${paramCells}
        <td>${isM.trades ?? 0}</td>
        <td class="${(isM.winRate ?? 0) >= 50 ? "positive" : "negative"}">${(isM.winRate ?? 0).toFixed(1)}%</td>
        <td class="${(isM.totalR ?? 0) >= 0 ? "positive" : "negative"}">${(isM.totalR ?? 0).toFixed(1)}R</td>
        <td>${oosM ? oosM.trades ?? 0 : "—"}</td>
        <td class="${oosM ? ((oosM.winRate ?? 0) >= 50 ? "positive" : "negative") : ""}">${oosM ? `${(oosM.winRate ?? 0).toFixed(1)}%` : "—"}</td>
        <td class="${oosM ? ((oosM.totalR ?? 0) >= 0 ? "positive" : "negative") : ""}">${oosM ? `${(oosM.totalR ?? 0).toFixed(1)}R` : "—"}</td>
        <td style="color:${ratioColor}">${ratio != null ? `${ratio}%` : "—"}</td>
      </tr>`;
    });

    const paramHeaders = paramKeys.map(k => {
      const stratParams = STRATEGY_PARAM_GRIDS[strategyId] ?? {};
      return `<th>${escapeHtml(stratParams[k]?.label ?? k)}</th>`;
    }).join("");

    optimizeResultsEl.innerHTML = `
      <p class="optimize-meta">${result.totalCombinations} combinaties · ${result.instrumentName} · OOS ${result.oosPct}% · Gesorteerd op OOS R</p>
      <div class="table-wrap">
        <table class="optimize-table">
          <thead>
            <tr>
              ${paramHeaders}
              <th>IS trades</th><th>IS win%</th><th>IS R</th>
              <th>OOS trades</th><th>OOS win%</th><th>OOS R</th>
              <th title="OOS R / |IS R| × 100%">IS/OOS</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`;
  } catch (err) {
    optimizeResultsEl.innerHTML = `<p class="optimize-error">${escapeHtml(err instanceof Error ? err.message : "Optimalisatie mislukt")}</p>`;
  } finally {
    if (runOptimizeEl) runOptimizeEl.disabled = false;
  }
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

const REGIME_COLORS = {
  trend:       "#4cc9b0",
  range:       "#f2b84b",
  compression: "#93a1a8",
  expansion:   "#d6ff62",
  chop:        "#ff6b6b",
  exhaustion:  "#ff9966",
  unknown:     "#555"
};

const STATUS_LABELS = {
  active:   "Actief",
  allowed:  "Toegestaan",
  watch:    "Let op",
  blocked:  "Geblokkeerd",
  no_trade: "Geen trade"
};

async function fetchRegimeDecision() {
  const payload = formPayload();
  setStatus("Regime analyse…");

  const params = new URLSearchParams({
    instrument:   payload.instrumentName,
    lookbackDays: payload.lookbackDays,
    options:      JSON.stringify(payload.options)
  });

  const result = await getJson(`/api/regime-decision?${params}`);
  renderRegimeDecision(result);
  setStatus(`Bijgewerkt ${new Date().toLocaleTimeString("nl-NL")}`);
}

function renderRegimeDecision(result) {
  regimeSectionEl.classList.remove("hidden");

  const color = REGIME_COLORS[result.regime] ?? "#555";
  regimeBadgeEl.textContent = result.regimeLabel ?? result.regime;
  regimeBadgeEl.style.color = color;
  regimeBadgeEl.style.borderColor = color;

  const reliabilityLabel = result.isReliable
    ? "betrouwbaar"
    : (result.confidence ?? 0) >= 55 ? "twijfelachtig" : "onbetrouwbaar";
  regimeConfidenceEl.textContent = `${result.confidence ?? 0}% · ${reliabilityLabel}`;

  regimeBiasEl.textContent = result.bias === "long" ? "↑ Bullish"
    : result.bias === "short" ? "↓ Bearish"
    : "→ Neutraal";

  regimeRiskEl.textContent = `Risico ×${result.riskModifier ?? 1}`;

  if (result.recommendedStrategyId) {
    const rec = (result.strategyRouter ?? []).find(s => s.strategyId === result.recommendedStrategyId);
    regimeRecEl.textContent = rec?.name ?? result.recommendedStrategyId;
    regimeRecEl.className = "regime-rec-name positive";
  } else {
    regimeRecEl.textContent = result.regime === "chop"
      ? "Geen trade aanbevolen"
      : "Vertrouwen te laag voor aanbeveling";
    regimeRecEl.className = "regime-rec-name negative";
  }

  if (regimeSignalsEl) {
    const signals = result.regimeSignals ?? [];
    if (signals.length > 0) {
      regimeSignalsEl.classList.remove("hidden");
      regimeSignalsEl.innerHTML = signals.map(s => `
        <div class="regime-signal-pill signal-${s.type}" title="${escapeHtml(s.interpretation)}">
          <span class="signal-label">${escapeHtml(s.label)}</span>
          <span class="signal-value">${escapeHtml(s.value)}</span>
        </div>
      `).join("");
    } else {
      regimeSignalsEl.classList.add("hidden");
    }
  }

  regimeRouterBodyEl.innerHTML = (result.strategyRouter ?? []).map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td><span class="regime-status-badge status-${s.status}">${STATUS_LABELS[s.status] ?? s.status}</span></td>
      <td class="regime-score">${s.score}</td>
      <td class="regime-reason">${escapeHtml(s.reason)}</td>
    </tr>
  `).join("");

  const regimeConfluenceEl = document.querySelector("#regime-confluence");
  const confluenceDetailsEl = document.querySelector("#confluence-details");
  if (result.confluence && regimeConfluenceEl && confluenceDetailsEl) {
    const { score, dominant, details } = result.confluence;
    regimeConfluenceEl.classList.remove("hidden");
    const domLabel = dominant === "long" ? "↑ bullish" : dominant === "short" ? "↓ bearish" : "→ neutraal";
    const tfsHtml = details.map(d => {
      const icon = d.bias === "long" ? "↑" : d.bias === "short" ? "↓" : "→";
      const cls  = d.bias === "long" ? "conf-tf positive" : d.bias === "short" ? "conf-tf negative" : "conf-tf neutral";
      return `<span class="${cls}" title="${escapeHtml(d.reason ?? d.bias)}">${d.tf} ${icon}</span>`;
    }).join("");
    confluenceDetailsEl.innerHTML =
      `<span class="conf-score">${score}%</span><span class="conf-dominant">${domLabel}</span>${tfsHtml}`;
  } else if (regimeConfluenceEl) {
    regimeConfluenceEl.classList.add("hidden");
  }

  regimeTimeEl.textContent = `Bijgewerkt: ${new Date().toLocaleTimeString("nl-NL")}`;
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
      if (key === "totalCostR" || key === "totalFundingR") className = "negative";
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
        <tr data-trade-entry="${trade.entryTime}" class="${focusedTrade?.entryTime === trade.entryTime ? "focused-trade" : ""}"${trade.description ? ` title="${escapeHtml(trade.description)}"` : ""}>
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
        closeTradeDetail();
      } else {
        focusTrade(trade);
        openTradeDetail(trade);
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

currencyToggleEl?.addEventListener("click", (e) => {
  e.preventDefault();
  _showAllCurrencies = !_showAllCurrencies;
  renderCurrencyOptions();
});

kindEl.addEventListener("change", () => {
  loadInstruments({ preferredInstrument: "" });
});

strategyEl.addEventListener("change", () => {
  updateStrategyOptions();
  if (!optimizeSectionEl?.classList.contains("hidden")) renderOptimizeParams(strategyEl.value);
});

exportCsvEl.addEventListener("click", exportCsv);
exportRapportEl?.addEventListener("click", exportReport);

optimizeCheckEl?.addEventListener("click", () => {
  const isHidden = optimizeSectionEl?.classList.toggle("hidden");
  if (!isHidden) renderOptimizeParams(strategyEl.value);
});
optimizeCloseEl?.addEventListener("click", () => optimizeSectionEl?.classList.add("hidden"));
runOptimizeEl?.addEventListener("click", runOptimize);

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

regimeCheckEl?.addEventListener("click", async () => {
  try {
    await fetchRegimeDecision();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Regime analyse mislukt");
    setStatus("Fout");
  }
});
savePresetEl.addEventListener("click", saveCurrentPreset);
deletePresetEl.addEventListener("click", deleteSelectedPreset);
presetSelectEl.addEventListener("change", applySelectedPreset);
liveRefreshEl.addEventListener("change", configureLiveRefresh);

tradeDetailCloseEl?.addEventListener("click", () => { resetFocus(); closeTradeDetail(); });

comparePresetsEl?.addEventListener("click", (e) => { e.preventDefault(); openPresetCompare(); });
presetCompareCloseEl?.addEventListener("click", () => presetCompareSectionEl?.classList.add("hidden"));
runCompareEl?.addEventListener("click", runPresetComparison);

// ─── Scanner ──────────────────────────────────────────────────────────────────
scannerCheckEl?.addEventListener("click", () => {
  scannerSectionEl?.classList.toggle("hidden");
  if (!scannerSectionEl?.classList.contains("hidden")) renderScannerChips();
});
scannerCloseEl?.addEventListener("click", () => scannerSectionEl?.classList.add("hidden"));
scannerAddBtnEl?.addEventListener("click", () => {
  const name = scannerAddInputEl?.value.trim().toUpperCase();
  if (!name) return;
  const list = getScannerInstruments();
  if (!list.includes(name)) { setScannerInstruments([...list, name]); renderScannerChips(); }
  if (scannerAddInputEl) scannerAddInputEl.value = "";
});
scannerAddInputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") scannerAddBtnEl?.click();
});
runScannerEl?.addEventListener("click", runScanner);

// ─── Alerts ───────────────────────────────────────────────────────────────────
alertsCheckEl?.addEventListener("click", () => {
  alertsSectionEl?.classList.toggle("hidden");
  if (!alertsSectionEl?.classList.contains("hidden")) {
    populateAlertInstrumentSel();
    renderAlertsList();
    if (Notification.permission === "default") Notification.requestPermission();
  }
});
alertsCloseEl?.addEventListener("click", () => alertsSectionEl?.classList.add("hidden"));
addAlertBtnEl?.addEventListener("click", () => {
  const name = alertInstrumentSelEl?.value;
  const cond = alertConditionSelEl?.value;
  if (name && cond) addAlert(name, cond);
});
regimeAddAlertEl?.addEventListener("click", () => {
  const name = document.querySelector("#instrument")?.value ?? "BTC-PERPETUAL";
  addAlert(name, "regime_reliable");
  alertsSectionEl?.classList.remove("hidden");
  populateAlertInstrumentSel();
  renderAlertsList();
});

// Start polling for any existing alerts on load
startAlertPolling();

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
