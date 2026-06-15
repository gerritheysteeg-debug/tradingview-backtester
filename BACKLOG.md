# Backlog

## MVP: live Deribit support/resistance backtester

- [x] Lokale dashboard-app zonder buildstap.
- [x] Deribit publieke candles ophalen voor BTC/ETH futures en perpetuals.
- [x] Support/resistance-levels detecteren op higher timeframe.
- [x] Entry-timeframe backtest met candle-close en volume-filter.
- [x] Stop loss onder/boven recente swing low/high.
- [x] Partial exits met einddoel rond 1:3R.
- [x] Metrics, chart, levels en trade-log tonen.
- [x] Live refresh op interval.
- [x] Strategie-register en strategie-dropdown voorbereiden.

## Eerstvolgende verbeteringen

- [x] Deribit instrument picker per currency en instrument type.
- [x] Strategy parameters opslaan als presets.
- [x] Level 2 stop loss optie naast swing stop.
- [x] Doopiecash Naked Price Action als tweede strategie toevoegen.
- [x] Liquidity Driven / SMC-lite als derde strategie toevoegen.
- [x] Trend Pullback v1 als vierde strategie toevoegen.
- [x] Volatility Expansion v1 als vijfde strategie toevoegen.
- [x] Market Regime Engine v1 als zesde strategie toevoegen.
- [x] Strategie-documentatiepagina's per strategie (HTML docs).
- [x] Shared trade execution engine (tradeSimulator.mjs) voor consistente stop/TP/BE-logica.
- [x] Break-even bug in trendPullback.mjs opgelost.
- [x] Monte Carlo analyse voor drawdown en losing streaks.
- [x] CSV-export van trades.
- [x] Correlatie & streak-analyse panel.
- [x] Maandelijks breakdown tabel.
- [x] Live marktadvies (3-koloms: Swing / Day / Scalp).
- [x] Chart timeframe switcher (3m / 15m / 1h / 4h / 1D).
- [x] Trade focus: klik op trade-row → chart zoomt in met entry/stop/TP-lijnen.
- [x] Executiekosten: feePct + slippagePct in simulator (gross vs net R).
- [x] Testdekking: tradeSimulator (22 tests), supportResistance, trendPullback, volatilityExpansion, scan edge cases (45 tests totaal).

- [x] Market Regime Decision Layer: decisionEngine.mjs, /api/regime-decision endpoint, "Welke strategie nu?" knop met routing-tabel per regime.

## Volgende sprint — betrouwbaarheid & realisme

- [x] Backtest-realisme: candle-intrabar ambiguïteit — intrabarOrder pessimistisch/optimistisch/willekeurig in simulator.
- [x] Walk-forward / out-of-sample splits — outOfSamplePct optie, IS vs OOS metrics panel in UI.
- [x] Backtest-realisme: funding rate impact voor perpetuals — fundingRatePct8h per 8u in simulator en UI.
- [x] Live advies endpoint hardening: input-validatie (onbekende strategie → 400), Promise.allSettled voor partiële Deribit-fouten, HTTP-timeout van 12s.
- [x] Doopiecash v2: maandelijkse context (laatste 4 wekelijkse candles als proxy) en wick-fill targets voor rejection-signalen.
- [x] Doopiecash v2: setup-uitleg (description) per trade, zichtbaar als tooltip op trade-rij.
- [x] SMC/Doopiecash testfixtures met verwachte signalen (16 nieuwe tests, 64 totaal).
- [x] Instrument-filter: standaard BTC/ETH/PAXG/BNB/SOL; toggle "+ Meer valuta's" voor alle Deribit-currencies.
- [x] Multi-timeframe confluence score: confluenceScore.mjs (1W/1D/4h), geïntegreerd in regime-panel.

## Sprint 2 — Bruikbaarheid & inzicht

- [ ] Decision Engine explainability: regime-signalen (ATR, structuur, overlap, EMA, wicky bars) zichtbaar in "Welke strategie nu?" panel.
- [ ] Unit tests voor `decisionEngine.mjs`: per regime strategie-routing getest, confidence-drempel, chop-blokkering (13 tests, 77 totaal).
- [ ] Trade detailpaneel: klik op een trade → paneel toont entry/stop/TP, R bruto/netto, kosten, MFE/MAE, exitReden, score, grade, setup-uitleg, redenen en penalties.
- [ ] Preset vergelijking: "Vergelijk presets" link in sidebar → selecteer 2–3 presets → vergelijkingstabel met trades, winrate, PF, gross R, net R, max DD en OOS R.
- [x] Multi-instrument scanner: scan BTC/ETH/SOL/+ tegelijk, toon regime + confidence + bias + aanbeveling + MTF confluence. Configureerbare instrumentenlijst (localStorage). Klik op rij laadt instrument.
- [x] Alert/watchlist workflow: "regime betrouwbaar" en "setup actief" als alert-condities, polling elke 60s, browser Notification API, "+ Alert" vanuit regime-paneel en alerts-sectie. Actieve alerts tonen in Alerts-sectie.
- [x] Datakwaliteit-paneel: pill-rij onder metrics met candle-teller + staleness per timeframe na elke backtest.
- [x] Rapport/export: HTML/PDF backtest-rapport met equity curve, maandelijks breakdown, walk-forward en Monte Carlo.
- [x] Parameter optimalisatie (gecontroleerd): grid search + OOS ranking op robustness.

## Later pas met expliciete toestemming

- [ ] API-key opslag.
- [ ] Broker/exchange account uitlezen.
- [ ] Live orders plaatsen.
- [ ] Automatische order management.
- [ ] Presets importeren/exporteren als JSON.
- [ ] Presets vergelijken op performance.
- [ ] TradingView webhook endpoint voor alerts uit Pine Script.
- [ ] Paper trading mode met journaling.
- [ ] Aandelen-data provider toevoegen.
- [ ] Goud/zilver via futures, CFD of broker/data-provider toevoegen.
