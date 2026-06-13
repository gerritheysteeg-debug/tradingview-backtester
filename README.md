# Trading Research Backtester

Lokale dashboard-app voor visueel backtesten, live marktadvies en strategie-onderzoek op crypto-futures. Draait volledig lokaal — geen externe accounts of API-keys nodig.

## Functionaliteit

### Strategieën

| Strategie | Beschrijving |
|---|---|
| **Support / Resistance v1** | Detecteert higher-timeframe support- en resistanceniveaus op basis van touches en volume. Entries op breakout/retest met swing high/low stop. |
| **Doopiecash Naked Price Action v1** | Daily bias → 4H zone-setup → 15m trigger → 3m entry. Scoort elke setup op bias-kwaliteit, zonegrootte en confluentiefactoren. |
| **Liquidity Driven / SMC-lite v1** | Detecteert buy-side en sell-side liquiditeitspools (equal highs/lows). Wacht op sweep en reclaim voor entry. Multi-timeframe bias via Weekly/Daily/4H. |

### Backtester

- **Multi-timeframe candles** van Deribit publieke API (3m t/m 1W)
- **Configureerbare parameters**: entry-resolutie, level-resolutie, lookback-periode, volume-multiplier, level-tolerantie, richting (long/short/beide), stop-mode
- **Strategie-specifieke opties**: min. score, entry model (balanced / conservative / aggressive)
- **Equity curve** — cumulatieve R-grafiek gesynchroniseerd met de prijsgrafiek
- **Maandelijkse breakdown** — wins, win%, totaal R, gemiddeld R, best en worst per maand
- **CSV-export** van alle trades

### Live marktadvies (Advies-knop)

Geeft per strategie de eerstvolgende verwachte entry op basis van de actuele marktstructuur:

- Entry-prijs, stop, TP1/TP2/TP3 en risk/reward
- Status: **Nu** (klaar om in te stappen), **Let op** (bijna op niveau), **Wacht** (nog ver weg)
- Score en beschrijving van de setup
- Prijslijnen op de chart voor entry, stop en targets

### Handelsstijl

Drie presets die automatisch entry-resolutie, level-resolutie en lookback instellen:

| Stijl | Entry | Levels | Lookback |
|---|---|---|---|
| Swing trading | 4h | 1D | 180 dagen |
| Day trading | 15m | 4h | 90 dagen |
| Scalping | 3m | 15m | 14 dagen |

### Presets

Sla je favoriete parameterinstellingen op als preset en laad ze terug via het preset-dropdown.

### Ondersteunde markten

- **Currencies**: BTC, ETH, SOL, XRP en meer (geladen via Deribit API)
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
  index.mjs           # Express-server, /api/backtest en /api/next-entry endpoints
public/
  app.js              # Frontend logica (charts, form, advice, export)
  index.html          # UI shell
  styles.css          # Dark-theme styling
  shared/
    strategyRegistry.mjs              # Strategie-registry (run + scan per strategie)
    supportResistance.mjs             # S/R detectie, backtest en scan
    doopiecashNakedPriceAction.mjs    # Doopiecash strategie, backtest en scan
    liquidityDrivenSMC.mjs            # SMC/liquiditeit strategie, backtest en scan
```

De server en browser delen dezelfde strategie-logica via ESM-modules in `public/shared/`. De server importeert ze rechtstreeks; de browser laadt ze als modules.
