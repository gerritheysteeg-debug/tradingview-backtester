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
- [ ] Trend break / retest entry-module.
- [ ] Multi-timeframe confluence score: 1W, 1D, 4h, entry timeframe.
- [x] Doopiecash Naked Price Action als tweede strategie toevoegen.
- [ ] Doopiecash v2: maandelijkse context en meer precieze wick-fill targets toevoegen.
- [ ] Doopiecash v2: setup-uitleg per trade zichtbaar maken in detailpaneel.
- [ ] Presets importeren/exporteren als JSON.
- [ ] Presets vergelijken op performance.
- [ ] Walk-forward test en out-of-sample splits.
- [ ] Monte Carlo analyse voor drawdown en losing streaks.
- [ ] TradingView webhook endpoint voor alerts uit Pine Script.
- [ ] Paper trading mode met journaling.
- [ ] Aandelen-data provider toevoegen.
- [ ] Goud/zilver via futures, CFD of broker/data-provider toevoegen.
- [ ] Rapport export naar CSV/PDF.

## Later pas met expliciete toestemming

- [ ] API-key opslag.
- [ ] Broker/exchange account uitlezen.
- [ ] Live orders plaatsen.
- [ ] Automatische order management.
