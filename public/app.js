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
const toastEl = document.querySelector("#toast");

const PRESET_STORAGE_KEY = "tradingResearch.presets.v1";

let chart;
let candleSeries;
let liveTimer;
let toastTimer;
let lastTrades = [];
let sortState = { col: null, asc: true };

const metricDefs = [
  ["trades", "Trades"],
  ["winRate", "Winrate", "%"],
  ["profitFactor", "Profit factor"],
  ["totalR", "Total R"],
  ["averageR", "Avg R"],
  ["averageScore", "Avg score"],
  ["maxDrawdownR", "Max DD R"]
];

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
  const isDoopie = strategyEl.value === "doopiecash-naked-price-action-v1";
  srOptionsEl.classList.toggle("hidden", isDoopie);
  doopieOptionsEl.classList.toggle("hidden", !isDoopie);
}

function formPayload() {
  const data = new FormData(form);
  return {
    strategyId: data.get("strategyId"),
    instrumentName: data.get("instrument"),
    entryResolution: data.get("entryResolution"),
    levelResolution: data.get("levelResolution"),
    lookbackDays: Number(data.get("lookbackDays")),
    options: {
      volumeMultiplier: Number(data.get("volumeMultiplier")),
      levelTolerancePct: Number(data.get("levelTolerancePct")),
      direction: data.get("direction"),
      stopMode: data.get("stopMode"),
      maxLevelAgeDays: Number(data.get("maxLevelAgeDays") ?? 0),
      minimumScoreToTrade: Number(data.get("minimumScoreToTrade") ?? 70)
    }
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
    minimumScoreToTrade: Number(data.get("minimumScoreToTrade") ?? 70)
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

function renderResult(result) {
  ensureChart();
  strategyLabelEl.textContent = result.strategyName ?? result.strategy;
  titleEl.textContent =
    `${result.instrumentName} · ${result.entryResolution} entries · ` +
    `${result.levelResolution} levels · ${formatStopMode(result.options.stopMode)}`;

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
      const className = key.includes("R") && value < 0 ? "negative" : "";
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
        <tr>
          <td>${trade.id}</td>
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
  return mode === "level2" ? "Level 2" : "Swing";
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

savePresetEl.addEventListener("click", saveCurrentPreset);
deletePresetEl.addEventListener("click", deleteSelectedPreset);
presetSelectEl.addEventListener("change", applySelectedPreset);
liveRefreshEl.addEventListener("change", configureLiveRefresh);

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
