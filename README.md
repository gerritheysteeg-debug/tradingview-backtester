# Trading Research Backtester

Lokale dashboard-app voor visueel backtesten, live marktadvies en strategie-onderzoek op crypto-futures. Draait volledig lokaal — geen externe accounts of API-keys nodig.

## Strategieën

| Strategie | Type | Beschrijving |
|---|---|---|
| **Support / Resistance v1** | Reversal / Range | Detecteert HTF support- en resistanceniveaus op basis van touches en volume. Entries op breakout/retest met swing high/low stop. |
| **Doopiecash Naked Price Action v1** | Price Action | Daily bias → 4H zone-setup → 15m trigger → 3m entry. Scoort elke setup op bias-kwaliteit, zonegrootte en confluentiefactoren. |
| **Liquidity Driven / SMC-lite v1** | SMC / Liquiditeit | Detecteert buy-side en sell-side liquiditeitspools (equal highs/lows). Wacht op sweep en reclaim voor entry. Multi-timeframe bias via Weekly/Daily/4H. |
| **Trend Pullback v1** | Continuation | Daily EMA50 + HH-HL/LH-LL swing structuur. Handelt pullbacks naar 4H Higher Lows. Partial exits op TP1/TP2/TP3. |
| **Volatility Expansion v1** | Breakout / Momentum | ATR-percentiel detecteert compressie op 4H. Handelt de bevestigde breakout met volume-expansie. Stop onder/boven retested range boundary. |
| **Market Regime Engine v1** | Meta-filter | Classificeert het marktregime (trend / range / compressie / expansie / chop / uitputting) en geeft aan welke strategie op dat moment geschikt is. |

Elke strategie heeft een documentatiepagina beschikbaar via de **↗ Meer info** link in de sidebar.

## Functionaliteit

### Backtester

- **Multi-timeframe candles** van Deribit publieke API (3m, 15m, 4h, 1D, 1W)
- **Configureerbare parameters**: entry-resolutie, level-resolutie, lookback-periode, volume-multiplier, level-tolerantie, richting (long/short/beide), stop-mode
- **Strategie-specifieke opties**: min. score, entry model (balanced / conservative / aggressive)
- **Equity curve** — cumulatieve R-grafiek gesynchroniseerd met de prijsgrafiek
- **Chart-legenda** — kleur en lijnstijl per prijslijn (S/R, entry, stop, take profit)
- **Maandelijkse breakdown** — wins, win%, totaal R, gemiddeld R, best en worst per maand
- **CSV-export** van alle trades

### Monte Carlo simulatie

Schudt de R-waarden van alle trades 1000× door elkaar en berekent drie uitkomstpaden:

- **P95** — beste 5% scenario
- **P50** — mediaan (verwacht scenario)
- **P5** — slechtste 5% scenario

Toont max drawdown op P5 en eindstand op P95 als samenvattende statistiek.

### Correlatie & streak analyse

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

Per setup: entry-prijs, stop, TP1/TP2/TP3, risk/reward, score en status (**Nu** / **Let op** / **Wacht**). De Day-setup wordt als prijslijnen op de chart getoond.

### Presets

Sla favoriete parameterinstellingen op als preset en laad ze terug via het preset-dropdown.

### Ondersteunde markten

- **Currencies**: BTC, ETH, SOL, BNB, PAXG en meer (geladen via Deribit API)
- **Types**: Futures (perpetual en leveraged), Options, Spot
- **Instruments**: automatisch geladen op basis van geselecteerde currency en type

## Starten

Vereist **Node.js 24** of hoger (ESM-modules, geen npm-packages).

```powershell
npm start
```

Open daarna:

```
http://localhost:5173
```

## Tests

```powershell
npm test
```

## Architectuur

```
server/
  index.mjs                           # HTTP-server, /api/backtest en /api/next-entry endpoints

public/
  app.js                              # Frontend logica (charts, form, Monte Carlo, advice, export)
  index.html                          # UI shell
  styles.css                          # Dark-theme styling
  docs/                               # Strategie documentatiepagina's (HTML)
  shared/
    strategyRegistry.mjs              # Strategie-registry (run + scan + docUrl per strategie)
    supportResistance.mjs             # S/R detectie, backtest en scan
    doopiecashNakedPriceAction.mjs    # Doopiecash price action, backtest en scan
    liquidityDrivenSMC.mjs            # SMC/liquiditeit strategie, backtest en scan
    trendPullback.mjs                 # Trend Pullback, EMA50 + swing zones, backtest en scan
    volatilityExpansion.mjs           # Volatility Expansion, ATR compressie, backtest en scan
    marketRegimeEngine.mjs            # Market Regime Engine, regime classificatie en routing
```

De server en browser delen dezelfde strategie-logica via ESM-modules in `public/shared/`. De server importeert ze rechtstreeks; de browser laadt ze als modules.
