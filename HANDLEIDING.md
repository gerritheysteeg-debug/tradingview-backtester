# Trading Research Backtester — Gebruikershandleiding

## Doel van de tool

De Trading Research Backtester helpt je om tradingstrategieën op crypto-instrumenten te onderzoeken, te vergelijken en live marktsituaties te beoordelen.

**Wat de tool NIET doet:**
- Plaatst geen orders
- Heeft geen koppeling met een broker of exchange
- Geeft geen financieel advies
- Slaat geen API-keys of account-gegevens op

**Wat de tool WEL doet:**
- Historische backtests draaien op publieke Deribit-marktdata
- Marktregime analyseren en meest passende strategie aanbevelen
- Live setup-zones berekenen (scenario's, geen signalen)
- Persoonlijke trade-uitkomsten bijhouden in een journaal

De kernvraag is niet: "Moet ik nu kopen of verkopen?"  
De kernvraag is: "Welke marktomgeving hebben we nu, welke strategie past daarbij, en hoe heeft die strategie historisch gepresteerd onder vergelijkbare instellingen?"

---

## Snel starten

Vereist **Node.js 24** of hoger.

```powershell
# Starten
start.bat

# Stoppen
stop.bat
```

Open daarna `http://localhost:5173` in de browser.

---

## Aanbevolen workflow

Gebruik de tool bij voorkeur in deze volgorde:

1. Kies instrument en markt.
2. Klik op **Welke strategie nu?**
3. Bekijk regime, confidence en aanbevolen strategie.
4. Draai een backtest op de aanbevolen strategie.
5. Controleer metrics, equity curve, drawdown, walk-forward en trade details.
6. Gebruik **Advies** voor concrete actuele setup-zones.
7. Gebruik pas daarna alerts, scanner, optimalisatie of rapportage.
8. Log interessante setups naar het **Trade Journaal** voor persoonlijke opvolging.

---

## Hoofdscherm

### Configuratie (linkerzijbalk)

| Veld | Functie |
|---|---|
| **Strategie** | Kiest welke strategie je wilt backtesten |
| **Preset** | Slaat instellingen op of laadt ze terug |
| **Currency / Type / Instrument** | Kiest de markt, bijv. `BTC-PERPETUAL` |
| **Entry / Levels** | Bepaalt welke timeframes gebruikt worden |
| **Lookback dagen** | Hoeveel historische data wordt opgehaald |
| **Volume multiplier** | Hoe streng volume wordt gefilterd |
| **Level tolerantie %** | Hoe dicht prijs bij een level moet komen |
| **Richting** | Long, short of beide |
| **Stop loss** | Swing high/low of level 2 |

### Analyseknoppen (topbalk)

| Knop | Functie |
|---|---|
| **Monte Carlo** | Robuustheid van trade-volgorde |
| **⚙ Optimaliseer** | Parameter grid search |
| **⊞ Scanner** | Meerdere instrumenten tegelijk scannen |
| **🔔 Alerts** | Watchlist en meldingen |
| **Welke strategie nu?** | Regime decision layer |
| **Advies** | Concrete live setups per handelsstijl |
| **📓 Journaal** | Trade Journaal openen |

---

## De belangrijkste knop: Welke strategie nu?

Deze knop analyseert de huidige markt en bepaalt welke strategie logisch is.

### Wat de tool toont

- **Marktregime**: trend, range, compressie, expansie, chop of uitputting.
- **Confidence**: betrouwbaarheid van de regime-inschatting.
- **Bias**: bullish, bearish of neutraal.
- **Risico modifier**: bijv. 0.75×, 1.0× of 1.1×.
- **Aanbevolen strategie**: alleen als confidence betrouwbaar genoeg is.
- **Routeringstabel**: status per strategie.
- **MTF confluence**: overeenstemming tussen 1W, 1D en 4H.

### Confidence-regels

| Niveau | Waarde | Betekenis |
|---|---|---|
| Betrouwbaar | ≥ 70% | Één strategie kan actief aanbevolen worden |
| Twijfelachtig | 55–69% | Monitoren maar voorzichtig |
| Onbetrouwbaar | < 55% | Geen actieve strategie aanbevolen |

### Strategiestatussen in de routeringstabel

| Status | Betekenis |
|---|---|
| **Actief** | Beste strategie voor dit regime |
| **Toegestaan** | Bruikbaar, maar niet eerste keuze |
| **Observeer** | Scenario volgen, nog geen sterke edge |
| **Geblokkeerd** | Past niet bij dit regime |
| **Geen trade** | Marktomgeving is te rommelig of ongunstig |

---

## Strategieën

De tool heeft **vijf backtestbare strategieën** plus de **Market Regime Decision Layer** — een aparte beslislaag ("Welke strategie nu?") die bepaalt welke strategie het meest passend is voor de huidige marktomgeving. De beslislaag is geen zesde strategie: hij backtestet niet en handelt niet.

### Support / Resistance v1

Geschikt voor range-achtige markten. De strategie zoekt hogere-timeframe support en resistance levels en handelt retests. Werkt minder goed in sterke trends waarin levels gemakkelijk breken.

### Doopiecash Naked Price Action v1

Price-action strategie met maandelijkse/daily context, 4H zones, 15m trigger en 3m entry. Geschikt wanneer bias en meerdere timeframes netjes op elkaar aansluiten. Let vooral op score, setup-uitleg en wick-fill targets.

### Liquidity Driven / SMC-lite v1

Zoekt liquiditeitspools zoals equal highs/lows, previous day/week high/low en range boundaries. Wacht op sweep, reclaim en CHOCH/BOS. Vooral nuttig in ranges, uitputtingsfases en reversal-contexten.

### Trend Pullback v1

Geschikt voor duidelijke trends. Gebruikt daily EMA50 en swingstructuur. Handelt pullbacks richting de trend, bijv. naar 4H higher lows in een uptrend.

### Volatility Expansion v1

Geschikt bij compressie en beginnende uitbraak. Detecteert lage ATR/compressie op 4H en zoekt bevestigde breakout met volume-expansie.

---

## Backtest draaien

Klik op **Run backtest** na het kiezen van strategie en instellingen.

### Belangrijke output-metrics

| Metric | Uitleg |
|---|---|
| **Trades** | Aantal uitgevoerde trades |
| **Winrate** | Percentage winnende trades |
| **Profit factor** | Verhouding tussen winst en verlies |
| **Gross R** | Resultaat vóór kosten |
| **Kosten R** | Impact van fees/slippage |
| **Funding R** | Impact van funding |
| **Net R** | Resultaat ná kosten en funding |
| **Average R** | Gemiddelde R per trade |
| **Max DD R** | Maximale drawdown in R |

> Gebruik **Net R** en **Max DD** als belangrijker dan alleen winrate.

---

## Executiekosten & realisme

Open **Executiekosten & realisme** voor realistischere backtests.

| Optie | Uitleg |
|---|---|
| **Fee %** | Handelskosten per kant (bijv. 0.05% voor Deribit) |
| **Slippage %** | Verwachte afwijking door spread/uitvoering |
| **Funding % per 8u** | Fundingkosten voor perpetuals |
| **Intrabar candle volgorde** | Pessimistisch / Optimistisch / Willekeurig |
| **Out-of-sample %** | Splitst de backtest in in-sample en out-of-sample |

**Intrabar candle volgorde:**
- **Pessimistisch**: stop wint als stop en target in dezelfde candle geraakt worden. Meest realistisch voor live trading.
- **Optimistisch**: target wint bij ambiguïteit.
- **Willekeurig**: deterministisch per candle — dezelfde backtest geeft altijd hetzelfde resultaat.

Gebruik voor serieuze beoordeling pessimistisch of willekeurig, en zet out-of-sample bijv. op 20–30%.

---

## Walk-forward validatie

Als out-of-sample % aan staat, toont de tool:

- **In-sample (IS)**: het deel waarop instellingen geoptimaliseerd zijn of goed lijken.
- **Out-of-sample (OOS)**: het validatiedeel — dit is belangrijker voor robuustheid.

Een strategie is interessanter wanneer OOS-resultaten niet volledig instorten ten opzichte van IS. Een grote IS→OOS degradatie wijst op overfitting.

---

## Chart en trade focus

De chart toont candles, levels, entries, stops en take profits.

- Gebruik de **timeframeknoppen** om de chartweergave te wisselen (3m / 15m / 1h / 4h / 1D).
- **Klik op een trade-rij** in het trades-paneel om in te zoomen op die trade.
- De chart toont dan entry-, stop- en TP-lijnen voor die specifieke trade.
- Klik opnieuw of op **Alles** om terug te keren naar het volledige overzicht.

---

## Trade detailpaneel

Klik op een trade voor een uitgebreid detailpaneel:

- Entry, stop en exit
- Bruto en netto R
- Kosten en funding-impact
- MFE (Maximum Favourable Excursion) en MAE (Maximum Adverse Excursion)
- Exitreden
- Score en grade
- Setup-uitleg
- Redenen en penalties

Gebruik dit paneel om te begrijpen waarom een trade wel of niet werkte.

---

## Advies

De knop **Advies** toont actuele setup-scenario's in drie handelsstijlen:

| Stijl | Entry TF | Levels TF | Lookback |
|---|---|---|---|
| **Swing** | 4h | 1D | 180 dagen |
| **Day** | 15m | 4h | 90 dagen |
| **Scalp** | 3m | 15m | 14 dagen |

Per setup zie je entry, stop, TP1/TP2/TP3, RR, score en status. Dit is een scenario-overzicht, geen orderadvies.

### Setup Verklaring — klikken op een kaart

Klik op een advice-kaart om in de chart te zien **waarop het advies gebaseerd is**:

- **Dikke lijnen**: entry (wit), stop (rood), TP1/TP2/TP3 (groen/geel)
- **Dunne stippellijnen (anchors)**: de onderliggende technische basis, bijv.:
  - S/R strategie: "Support entry (3×)", "Stop basis: volgende support (2×)", "TP basis: weerstand (4×)"
  - Volatility Expansion: "Compressie top (12 bars)", "Compressie bodem"
  - Trend Pullback: "4H HL zone top", "4H HL zone bodem"

De kaart met de **hoogste score** wordt automatisch geselecteerd bij het laden van de adviesresultaten.

### Log trade

Klik op **📓 Log trade** op een advice-kaart om de setup te registreren in het Trade Journaal. Entry, stop, TP's en score worden automatisch ingevuld. Je vult later de werkelijke uitkomst in.

---

## Monte Carlo

Monte Carlo schudt de tradevolgorde 1000 keer. Dit laat zien hoe gevoelig de strategie is voor de volgorde van wins en losses.

| Percentiel | Betekenis |
|---|---|
| **P95** | Gunstig scenario (beste 5%) |
| **P50** | Mediaan — het te verwachten scenario |
| **P5** | Slecht scenario (slechtste 5%) |

> Een strategie met mooi totaalresultaat maar extreme P5 drawdown is risicovoller dan hij lijkt.

---

## Scanner

De scanner analyseert meerdere instrumenten tegelijk (standaard BTC, ETH en SOL perpetuals).

Per instrument zie je:

- Regime
- Confidence
- Bias
- Aanbevolen strategie
- MTF confluence

Klik op een rij om dat instrument direct te laden en een backtest te starten.

---

## Alerts

Alerts zijn bedoeld als watchlist, niet als automatische trading.

**Beschikbare condities:**

- **Regime betrouwbaar**: confidence boven 70%.
- **Setup actief**: setup krijgt status "ready".

De tool controleert elke 60 seconden en toont een browsermelding of toast wanneer een alert triggert. Voeg alerts toe vanuit het regime-paneel via **+ Alert**.

---

## Parameter optimalisatie

Gebruik **⚙ Optimaliseer** om parametercombinaties systematisch te testen.

- De tool gebruikt een **grid search**: alle combinaties van de aangevinkte waarden worden doorgerekend.
- Het maximale aantal combinaties is beperkt tot 200 (live teller past zich aan).
- Candles worden éénmaal opgehaald; alle combinaties draaien server-side.
- Resultaten worden gerangschikt op **out-of-sample R** met een IS/OOS robustness-ratio.

> Kijk niet alleen naar de hoogste R, maar ook naar robuustheid en drawdown. Optimalisatie kan tot curve-fitting leiden. Vertrouw nooit blind op de beste combinatie.

---

## Presets en preset vergelijking

Sla favoriete parameterinstellingen op als preset via het preset-dropdown.

**Aanbevolen naamgeving:**
- `BTC SR conservative 90d`
- `ETH SMC balanced 180d`
- `SOL VolExpansion OOS30`

Met **Vergelijk presets** kun je 2–3 presets naast elkaar beoordelen op trades, winrate, profit factor, gross R, net R, max drawdown en OOS R.

---

## Rapport export

Gebruik **↗ Rapport** om een printbaar HTML-rapport te genereren.

Het rapport bevat:

- Samenvatting (metrics, strategie, periode)
- Equity curve
- Walk-forward resultaten (IS vs. OOS)
- Monte Carlo uitkomsten
- Maandelijkse breakdown
- Beste en slechtste trades
- Volledige tradelijst

Gebruik dit voor analyse, overleg of archivering. Sla op als PDF via de printdialog van de browser (Ctrl+P).

---

## Trade Journaal

Het **Trade Journaal** (`/journal.html`) is een aparte pagina voor het bijhouden van je handmatig geplaatste trades op Deribit.

### Doel

De backtester meet hoe een strategie historisch presteerde. Het journaal meet **jouw persoonlijke succesrate**: hoe goed pak je de setups op die de tool aanbeveelt, en hoe dicht kom je bij het geplande resultaat?

### Hoe het werkt

1. Klik **📓 Log trade** op een advice-kaart. Entry, stop, TP's en score worden automatisch ingevuld.
2. Plaats de trade zelf op Deribit.
3. Ga naar het journaal (knop in topbalk of `http://localhost:5173/journal.html`).
4. Klik op de trade-rij of het potlood-icoon om de uitkomst in te vullen:
   - **Status**: open, gesloten of geannuleerd
   - **Exit reden**: TP1/TP2/TP3, SL, Breakeven, Trailing stop of Manueel
   - **Werkelijk entry en exit**: de daadwerkelijke uitvoeringsprijzen
   - **Werkelijk R**: handmatig invullen of automatisch berekenen via de **Bereken R** knop
   - **Notities**: vrij veld, bijv. "SL naar BE na TP1, daarna TP2 niet meer bereikt"
   - **Datum gesloten**

### Manuele trades toevoegen

Klik op **+ Manuele trade** om een trade te registreren zonder advies-context.

### Statistieken

Bovenaan het journaal zie je:

| Stat | Uitleg |
|---|---|
| Totaal gelogd | Alle journaalinvoeren |
| Open | Openstaande trades |
| Gesloten | Afgeronde trades |
| Win rate | % gesloten trades met R > 0 |
| Totaal R | Som van alle werkelijke R-waarden |
| Gem. R | Gemiddelde R per gesloten trade |

### Exporteren

Gebruik **↓ CSV** om het volledige journaal te exporteren voor gebruik in Excel of een andere tool.

---

## Datakwaliteit

Na een backtest toont de tool datakwaliteit per timeframe:

- Aantal candles
- Laatste candle timestamp
- Staleness (hoe oud is de laatste candle?)
- Ontbrekende of lege timeframes

Als datakwaliteit slecht is, zijn conclusies minder betrouwbaar. Deribit levert soms minder historische data voor minder liquide instrumenten of lagere timeframes.

---

## Praktische interpretatie

Een goed onderbouwde setup heeft bij voorkeur:

| Criterium | Waar op letten |
|---|---|
| **Regime** | Betrouwbaar (≥ 70% confidence) |
| **Strategie** | Past bij het huidige regime |
| **MTF confluence** | Ondersteunt de richting op meerdere timeframes |
| **Backtest** | Voldoende trades (min. 30–50 voor statistische waarde) |
| **Net R** | Positief na kosten en funding |
| **Drawdown** | Acceptabel in verhouding tot totale R |
| **OOS** | Resultaat blijft overeind buiten de geoptimaliseerde periode |
| **Monte Carlo P5** | Niet desastreus — drawdown is dragelijk |
| **Trade details** | Tonen logische redenen, geen systematische fouten |

---

## Veelgemaakte fouten

**Te weinig trades in backtest**  
Minder dan 20–30 trades is statistisch onbetrouwbaar. Vergroot de lookback of kies een instrument met meer beweging.

**Alleen naar winrate kijken**  
Een strategie met 40% winrate en 2.5:1 reward/risk kan winstgevender zijn dan een strategie met 65% winrate en 0.8:1.

**Optimalisatie vertrouwen als waarheidsvinding**  
De beste parameter-combinatie in de grid search is altijd enigszins geoptimaliseerd op historische data. Gebruik OOS R als primair criterium, niet IS R.

**Advies letterlijk nemen als orderadvies**  
De advice-kaarten geven scenario's, geen signalen. Ze tonen waar prijs *zou kunnen* zijn interessant. Combineer altijd met eigen oordeel en de regime-analyse.

**Funding negeren bij perpetuals**  
Bij langere swing-trades kan funding significant oplopen. Zet funding in bij de realisme-opties.

---

## Sneltoetsen en tips

- **Dubbelklik** op een trade-rij in het journaal om de bewerkingsdialog te openen.
- **Ctrl+P** in het rapport-venster om op te slaan als PDF.
- Gebruik de **filter-tabs** in het journaal (Alle / Open / Gesloten / Geannuleerd) om snel te filteren.
- De **Bereken R** knop in het journaal berekent automatisch R op basis van werkelijk entry/exit vs. geplande stop-afstand — handig als je je stop tussentijds hebt verzet.
- **start.bat / stop.bat** voor het herstarten van de server na wijzigingen.
