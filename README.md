# Trading Research Backtester

Lokale dashboard-app voor visueel backtesten, live marktdata en strategie-onderzoek.

## Eerste versie

- Deribit publieke marktdata als eerste databron.
- Support/resistance-strategie op basis van higher-timeframe levels.
- Doopiecash Naked Price Action v1 met daily bias, 4H setup, 15m trigger en 3m entry.
- Entries op candle close met volume-filter.
- Stop loss onder/boven recente swing low/high.
- Partial exits en einddoel rond 1:3 risk/reward.
- Visuele chart, metrics en trade-log.

## Starten

```powershell
npm start
```

Open daarna:

```text
http://localhost:5173
```

## Tests

```powershell
npm test
```
