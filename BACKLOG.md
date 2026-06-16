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

## Sprint 1 — Strategieën & realisme

- [x] Deribit instrument picker per currency en instrument type.
- [x] Strategy parameters opslaan als presets.
- [x] Level 2 stop loss optie naast swing stop.
- [x] Doopiecash Naked Price Action als tweede strategie.
- [x] Liquidity Driven / SMC-lite als derde strategie.
- [x] Trend Pullback v1 als vierde strategie.
- [x] Volatility Expansion v1 als vijfde strategie.
- [x] Strategie-documentatiepagina's per strategie (HTML docs).
- [x] Gedeelde trade-executie engine (tradeSimulator.mjs).
- [x] Monte Carlo analyse voor drawdown en losing streaks.
- [x] CSV-export van trades.
- [x] Correlatie & streak-analyse panel.
- [x] Maandelijks breakdown tabel.
- [x] Live marktadvies (3-koloms: Swing / Day / Scalp).
- [x] Chart timeframe switcher.
- [x] Trade focus: klik op trade-row → chart zoomt in.
- [x] Executiekosten: feePct + slippagePct (gross vs net R).
- [x] Testdekking: tradeSimulator, supportResistance, trendPullback, volatilityExpansion, scan.
- [x] Market Regime Decision Layer: beslislaag (niet een zesde strategie) — decisionEngine.mjs,
      /api/regime-decision, "Welke strategie nu?" knop met routing-tabel per regime.

## Sprint 2 — Bruikbaarheid & inzicht

- [x] Backtest-realisme: intrabarOrder pessimistisch/optimistisch/willekeurig.
- [x] Walk-forward / out-of-sample splits — IS vs OOS metrics panel.
- [x] Backtest-realisme: funding rate impact voor perpetuals.
- [x] Live advies endpoint hardening: input-validatie, Promise.allSettled, HTTP-timeout.
- [x] Doopiecash v2: maandelijkse context en wick-fill targets.
- [x] Doopiecash v2: setup-uitleg (description) per trade, zichtbaar als tooltip.
- [x] SMC/Doopiecash testfixtures (64 tests totaal).
- [x] Instrument-filter: BTC/ETH/PAXG/BNB/SOL; toggle "+ Meer valuta's".
- [x] Multi-timeframe confluence score (1W/1D/4H) in regime-panel.
- [x] Decision Engine explainability: regime-signalen (ATR, structuur, overlap, EMA, wicky bars)
      zichtbaar in "Welke strategie nu?" panel.
- [x] Unit tests voor decisionEngine.mjs: 13 tests, 77 totaal.
- [x] Trade detailpaneel: klik op een trade → paneel met entry/stop/TP, R bruto/netto,
      kosten, MFE/MAE, exitReden, score, grade, setup-uitleg, redenen en penalties.
- [x] Preset vergelijking: "Vergelijk presets" → vergelijkingstabel trades/winrate/PF/R/DD/OOS.
- [x] Multi-instrument scanner: regime + confidence + bias + aanbeveling + MTF confluence.
- [x] Alert/watchlist: "regime betrouwbaar" en "setup actief", polling 60s, Notification API.
- [x] Datakwaliteit-paneel: pill-rij per timeframe na elke backtest.
- [x] Rapport/export: HTML backtest-rapport met equity curve, walk-forward, Monte Carlo.
- [x] Parameter optimalisatie: grid search + OOS ranking.

## Sprint 3 — Stabilisatie basisproduct

- [x] P0: Onbekende strategie geeft altijd 400 — findStrategy() strict lookup in server,
      getStrategy() behoud fallback voor UI defaults.
- [x] API-endpoint tests: health, strategies, backtest (400 onbekend), next-entry (400 onbekend),
      optimize (400 onbekend, 400 te veel combos, 400 leeg grid). Server spawnt op testpoort.
- [x] Advice-kaarten klikbaar: klik toont entry/stop/TP-lijnen + anchor-uitleglijnen in chart.
      Beste setup auto-geselecteerd; TrendPullback + VE scan-veldnamen gecorrigeerd (entry→entryPrice).
- [x] Trade Journaal: /journal.html voor handmatig bijhouden van trades.
      Log-knop op advice-kaart, stats, filter, CSV-export, berekend R.
- [x] Backlog opgeschoond: Market Regime Engine was incorrect "zesde strategie" — nu beslislaag.
      Sprint 2-items gecontroleerd en afgevinkt.
- [x] README en HANDLEIDING bijgewerkt met alle sprint 3 features.
- [x] UX: duidelijke "geen trades" melding met tips bij 0 backtest-resultaten.

## Later (expliciet niet in deze basisversie)

- [ ] Directe API/broker-koppeling (Deribit, Binance of ander exchange).
- [ ] API-key opslag en beheer.
- [ ] Broker/exchange account uitlezen (balans, open posities, order history).
- [ ] Live orders plaatsen via broker-API.
- [ ] Automatisch order management (trailing stop, partial close via API).
- [ ] Strategie-editor: de 5 strategieën inhoudelijk aanpasbaar maken via UI.
- [ ] Strategieparameter templates importeren/exporteren als JSON.
- [ ] Paper trading mode.
- [ ] TradingView webhook endpoint voor Pine Script alerts.
- [ ] Aandelen-data provider toevoegen.
- [ ] Goud/zilver via futures, CFD of broker/data-provider.
