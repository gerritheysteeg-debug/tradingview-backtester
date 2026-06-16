# Trading Research Backtester

Lokale dashboard-app voor visueel backtesten, live marktadvies en strategie-onderzoek op crypto-futures. Draait volledig lokaal — geen externe accounts of API-keys nodig.

> **Disclaimer:** deze tool plaatst geen orders en heeft geen koppeling met een broker. Data is afkomstig van de publieke Deribit REST API. Resultaten zijn uitsluitend bedoeld voor onderzoek, niet als financieel advies.

## Aanbevolen workflow

1. Kies instrument en markt
2. Klik **Welke strategie nu?** → regime-analyse bepaalt welke strategie logisch is
3. Draai een **backtest** op de aanbevolen strategie
4. Controleer metrics, equity curve, drawdown en walk-forward
5. Klik **Advies** voor concrete actuele setup-zones
6. Analyseer trade details via klik op trade-rij
7. Exporteer rapport of gebruik Scanner / Optimaliseer voor verder onderzoek

## Snel starten

Vereist **Node.js 24** of hoger (ESM-modules, geen npm-packages).

```powershell
npm start
```

Open daarna `http://localhost:5173` in de browser.

```powershell
npm test          # 95 tests (unit + API integratie)
```

---

## Strategieën (5 uitvoerende strategieën + 1 beslislaag)

De tool heeft **vijf backtestbare strategieën**. Daarnaast bestaat de **Market Regime Decision Layer** — een aparte analyse-laag die bepaalt welke strategie het meest passend is voor de huidige marktomgeving. De decision layer is géén zesde strategie; hij backtestet niet en handelt niet.

| Strategie | Type | Beschrijving |
|---|---|---|
| **Support / Resistance v1** | Reversal / Range | Detecteert HTF support- en resistanceniveaus op basis van swing-pivots en touches. Entries op retest met swing high/low stop of level-2 stop. |
| **Doopiecash Naked Price Action v1** | Price Action | Maandelijkse + daily bias → 4H zone-setup → 15m trigger → 3m sniper-entry. Scoringsmodel (max 130 pts, min 70 voor entry). Wick-fill targets bij rejection-signalen. Setup-uitleg per trade als tooltip. |
| **Liquidity Driven / SMC-lite v1** | SMC / Liquiditeit | Detecteert buy-side en sell-side liquiditeitspools (equal highs/lows, prev-day/week, range boundaries). Wacht op sweep en reclaim binnen 5 bars, entry op CHOCH/BOS bevestiging. Scoringsmodel min. 65. |
| **Trend Pullback v1** | Continuation | Daily EMA50 + HH-HL/LH-LL swing-structuur. Handelt pullbacks naar 4H Higher Lows. Partial exits op TP1/TP2/TP3. |
| **Volatility Expansion v1** | Breakout / Momentum | ATR-percentiel detecteert compressie op 4H. Handelt de bevestigde breakout met volume-expansie. Stop onder/boven retested range boundary. |

Elke strategie heeft een documentatiepagina beschikbaar via de **↗ Meer info** link in de sidebar.

---

## Functionaliteit

### Backtester

- **Multi-timeframe candles** van Deribit publieke API (3m, 15m, 1h, 4h, 1D, 1W)
- **Configureerbare parameters**: entry-resolutie, level-resolutie, lookback-periode, volume-multiplier, level-tolerantie, richting (long/short/beide), stop-mode
- **Strategie-specifieke opties**: min. score (Doopiecash), entry model (SMC: balanced / conservative / aggressive)
- **Equity curve** — cumulatieve R-grafiek gesynchroniseerd met de prijsgrafiek
- **Chart timeframe switcher** — wissel de chart-weergave tussen 3m / 15m / 1h / 4h / 1D
- **Trade focus** — klik op een trade-rij om in de chart in te zoomen met entry/stop/TP-lijnen
- **Trade detailpaneel** — klik op een trade voor een volledig paneel: entry/stop/TP, R bruto/netto, kosten, MFE/MAE, exitreden, score, grade, setup-uitleg, redenen en penalties
- **Maandelijkse breakdown** — wins, win%, totaal R, gemiddeld R, best en worst per maand
- **Datakwaliteit-paneel** — pill-rij onder metrics na elke backtest: candle-teller + staleness per timeframe
- **CSV-export** van alle trades
- **HTML rapport** — "↗ Rapport" genereert een printbare HTML-pagina met equity curve SVG, walk-forward, Monte Carlo, top/worst 10 trades, maandelijks overzicht en volledige tradelijst

### Backtest-realisme opties

Beschikbaar via **Executiekosten & realisme**:

| Optie | Beschrijving |
|---|---|
| **Fee %** | Takerkosten per kant (bijv. 0.05% voor Deribit) |
| **Slippage %** | Spread-slippage per kant |
| **Funding % per 8u** | Fundingrente voor perpetuals; accumuleert per gestarted 8-uursperiode |
| **Intrabar candle volgorde** | Pessimistisch (stop wint bij ambiguïteit), Optimistisch (TP wint), Willekeurig (deterministisch per candle via hash) |
| **Out-of-sample %** | Walk-forward validatie: splits trades tijdlijn in IS (optimalisatie) en OOS (validatie); toont beide metrieken naast elkaar |

### Monte Carlo simulatie

Schudt de R-waarden van alle trades 1000× door elkaar en berekent drie uitkomstpaden:

- **P95** — beste 5% scenario
- **P50** — mediaan (verwacht scenario)
- **P5** — slechtste 5% scenario

Toont max drawdown op P5 en eindstand op P95 als samenvattende statistiek.

### Correlatie & streak-analyse

Visuele trade-strip met win/loss patroon en vier statistieken:

- **Max verliesreeks** en **max winreeks**
- **Verlies clustering** — percentage verliezen dat in een reeks van ≥2 valt
- **Gemiddelde verliesreeks** — hoe lang duurt een verliesperiode gemiddeld?

### Live marktadvies (Advies-knop)

Voert voor elke handelsstijl tegelijk een scan uit op de actuele marktstructuur en toont de resultaten in drie kolommen:

| Kolom | Entry | Levels | Lookback |
|---|---|---|---|
| **Swing** | 4h | 1D | 180 dagen |
| **Day** | 15m | 4h | 90 dagen |
| **Scalp** | 3m | 15m | 14 dagen |

Per setup: entry-prijs, stop, TP1/TP2/TP3, risk/reward, score en status (**Nu** / **Let op** / **Wacht**).

- **Klik op een kaart** om de setup in de chart te tonen: dikke gestippelde lijnen voor entry/stop/TP, plus dunne anchor-lijnen die uitleggen *waarom* die prijsniveaus gekozen zijn (bijv. "Support entry (3×)", "Compressie top (12 bars)")
- De kaart met de hoogste score wordt automatisch geselecteerd bij laden
- **📓 Log trade** slaat de setup op in het Trade Journaal voor handmatige opvolging

### Welke strategie nu? (Regime Decision)

De **"Welke strategie nu?"**-knop voert een live marktregime-analyse uit en geeft een concreet advies:

- **Marktregime** met confidence % en betrouwbaarheidslabel (betrouwbaar ≥ 70% / twijfelachtig ≥ 55% / onbetrouwbaar)
- **Bias** (bullish / bearish / neutraal) en **risico-modifier** (0.75× – 1.1×)
- **Aanbeveling** — één specifieke strategie als het regime betrouwbaar is
- **Regime-signalen** — gekleurde pills (ATR%, bull/bear structuurscore, HTF-overlap, EMA-uitlijning, wick-bars) met tooltip per signaal
- **Routeringstabel** — voor alle 5 strategieën: status (actief / toegestaan / observeer / geblokkeerd / geen trade) + score + reden
- **MTF Confluence** — percentage 1W/1D/4H-timeframes dat dezelfde richting aangeeft, met per-TF bias-badge

Regimes: Trend · Range · Compressie · Expansie · Chop · Uitputting

### Parameter optimalisatie

De **"⚙ Optimaliseer"**-knop opent een grid search paneel voor de huidige strategie en instrument:

- Per strategie worden de relevante parameters getoond als aanvinkbare waarden (bijv. S/R: volume multiplier × level tolerantie)
- Live **"Combinaties: X"** teller past zich aan bij iedere wijziging (max 200)
- Candles worden éénmaal opgehaald; alle combinaties draaien server-side met verplichte 20% OOS split
- Resultaten gesorteerd op **OOS R** met IS/OOS robustness-ratio per combinatie

### Multi-instrument scanner

De **"⊞ Scanner"**-knop scant meerdere instrumenten tegelijk:

- Configureerbare instrumentenlijst opgeslagen in localStorage (standaard BTC/ETH/SOL-PERPETUAL)
- Per instrument: regime, confidence %, bias, aanbevolen strategie en MTF confluence-score
- Klik op een rij om het instrument direct te laden en een backtest te starten

### Alerts & watchlist

De **"🔔 Alerts"**-knop beheert een watchlist met twee condities:

- **Regime betrouwbaar** — trigged wanneer confidence ≥ 70%
- **Setup actief** — triggered wanneer een setup de status "ready" heeft
- Polling elke 60 seconden; browser Notification API + toast bij trigger
- Alert toevoegen vanuit het regime-paneel via "+ Alert"

### Trade Journaal

`/journal.html` — standalone pagina voor het bijhouden van handmatig geplaatste trades:

- **Log trade** vanuit een advice-kaart: vult entry, stop, TP1/2/3, score en beschrijving automatisch voor
- **Werkelijke uitkomst** invullen: status (open/gesloten/geannuleerd), werkelijk exit, exit-reden (TP1/TP2/SL/BE/Trail/Manueel), R en notities
- **Bereken R** automatisch uit werkelijk entry/exit vs. geplande stop-afstand
- **Manuele trades** toevoegen zonder advies-context
- **Stats-rij**: totaal gelogd, open, gesloten, win rate, totaal R, gemiddeld R
- **Filter-tabs**: Alle / Open / Gesloten / Geannuleerd
- **CSV-export** van het volledige journaal
- Data opgeslagen in localStorage (`tradingResearch.journal.v1`); live gesynchroniseerd wanneer je logt vanuit het hoofdscherm

### Preset vergelijking

**"Vergelijk presets"** link in de sidebar laadt 2–3 opgeslagen presets parallel op hetzelfde instrument en toont een vergelijkingstabel: trades, winrate, profit factor, gross R, net R, max DD en OOS R.

### Presets

Sla favoriete parameterinstellingen op als preset en laad ze terug via het preset-dropdown.

### Ondersteunde markten

- **Standaard currencies**: BTC, ETH, PAXG, BNB, SOL (beschikbaar op Deribit)
- **Alle currencies**: klikbaar via "+ Meer valuta's"
- **Types**: Futures (perpetual en leveraged), Options, Spot
- **Instruments**: automatisch geladen op basis van geselecteerde currency en type

---

## Architectuur

```
server/
  index.mjs             # HTTP-server; routes: /api/backtest, /api/next-entry,
                        # /api/regime-decision, /api/optimize, /api/candles,
                        # /api/instruments, /api/currencies, /api/strategies
                        # Input-validatie, Promise.allSettled, HTTP-timeout 12s
                        # cartesianProduct helper voor optimize grid search
  deribit.mjs           # Deribit API-client; candles, currencies, instruments; AbortSignal timeout

public/
  app.js                # Frontend: charts, form, Monte Carlo, walk-forward, regime, confluence,
                        # scanner, alerts, preset-vergelijking, trade-detail, rapport, optimalisatie,
                        # advice-kaart klikinteractie, anchor-visualisatie, trade-journaal logging
  index.html            # UI shell
  journal.html          # Trade Journaal — zelfstandige pagina, geen imports, localStorage
  styles.css            # Dark-theme styling
  docs/                 # Strategie-documentatiepagina's (HTML)

  shared/               # Gedeelde logica — server én browser importeren via ESM
    tradeSimulator.mjs            # Kern-engine: simulateTrade, calculateMetrics, buildEquityCurve
                                  # intrabarOrder, fundingRatePct8h, MAE/MFE, grossR vs netR
    strategyRegistry.mjs          # Registry: run + scan + walk-forward split per strategie
    supportResistance.mjs         # S/R pivot-detectie, backtest en scan
    doopiecashNakedPriceAction.mjs# Price action: daily+maandelijkse bias, 4H setup,
                                  # 15m trigger, 3m entry, scoringsmodel, wick-fill, beschrijving
    liquidityDrivenSMC.mjs        # SMC: liquiditeitspools, sweep+reclaim+CHOCH, scoringsmodel
    trendPullback.mjs             # Trend Pullback: EMA50, swing-zones, backtest en scan
    volatilityExpansion.mjs       # Volatility Expansion: ATR-compressie, breakout, backtest en scan
    marketRegimeEngine.mjs        # Regime-classificatie: ATR, swing-structuur, EMA, chop, uitputting
                                  # Exporteert signals (atrPct, bullScore, bearScore, overlap, wicky, emaAligned)
    decisionEngine.mjs            # Beslislaag: regime → strategie-routing, risico-modifier
                                  # buildStrategyRouter, buildDecisionSummary (testbaar export)
    confluenceScore.mjs           # MTF confluence: bias-overeenstemming 1W/1D/4H → score 0–100

test/
  tradeSimulator.test.mjs           # 17 tests: stop, TP, BE, MAE/MFE, intrabar, funding
  supportResistance.test.mjs        # S/R pivot-detectie en level2-stop
  trendPullback.test.mjs            # Trend Pullback backtest en scan
  volatilityExpansion.test.mjs      # Volatility Expansion backtest en scan
  doopiecashNakedPriceAction.test.mjs # Fixture-tests: signal → verwachte trade-velden en score
  liquidityDrivenSMC.test.mjs       # Fixture-tests: prev_day_low sweep+reclaim+CHOCH → long trade
  strategyRegistry.test.mjs         # Registry: dispatcher, walk-forward
  scan.test.mjs                     # Scan edge-cases voor alle strategieën
  decisionEngine.test.mjs           # 13 tests: strategie-routing per regime, confidence-drempel, chop
```

De server en browser delen dezelfde strategie-logica via ESM-modules in `public/shared/`. De server importeert ze rechtstreeks via Node.js; de browser laadt ze als `<script type="module">`.

---

## Ontwerpkeuzes

- **Geen buildstap** — pure ESM, geen bundler, werkt direct in Node 24 en moderne browsers
- **Geen npm-packages** — nul dependencies; alleen de standaard library en de Deribit publieke REST API
- **Gedeelde business-logica** — `public/shared/` bevat de strategie-engines die zowel server (backtest-endpoint) als browser (scan) gebruiken
- **Deterministisch "willekeurig"** — de `random` intrabar-volgorde gebruikt een bitwise hash van de candle-timestamp zodat backtests reproduceerbaar blijven
- **Promise.allSettled** — een Deribit-fout op één tijdframe laat de rest doorgaan; strategieën ontvangen een lege array voor dat tijdframe
- **Testbare beslislogica** — `buildStrategyRouter` en `buildDecisionSummary` in `decisionEngine.mjs` zijn pure functies zonder candle-afhankelijkheid, direct te testen zonder fixtures
