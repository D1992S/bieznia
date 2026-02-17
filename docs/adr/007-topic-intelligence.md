# ADR 007: Topic Intelligence - klasteryzacja tematow, trend i luki contentowe

- Status: Accepted
- Date: 2026-02-17
- Faza: 15

## Kontekst

Po Fazie 14 aplikacja porownuje kanal do konkurencji, ale nadal brakowalo warstwy:

- jakie tematy sa rzeczywiscie obecne w danych kanalu,
- ktore klastry tematow rosna/spadaja,
- gdzie sa luki tematyczne wzgledem presji niszy.

Bez tego rekomendacje publikacyjne nie maja jawnego kontekstu "co warto pokryc dalej".

## Decyzja

Wprowadzamy Topic Intelligence jako deterministyczny modul analityczny:

- migracja `011-topic-intelligence-schema`:
  - `dim_topic_cluster`,
  - `fact_topic_pressure_day`,
  - `agg_topic_gaps`.
- serwis `@moze/analytics`:
  - `runTopicIntelligence(...)`,
  - `getTopicIntelligence(...)`,
  - tokenizacja PL/EN + stopwords + prosty stemming,
  - klasteryzacja tematow po tokenie przewodnim,
  - trend per cluster (`rising`, `stable`, `declining`),
  - gap detection z `gapScore`, `nichePressure`, `cannibalizationRisk`, `confidence`, `rationale`.
- IPC:
  - `analytics:runTopicIntelligence`,
  - `analytics:getTopicIntelligence`.
- UI:
  - panel "Topic Intelligence (Faza 15)" w `Statystyki`,
  - lista luk i lista klastrow z trendami.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - schema i persystencje dla topic clusters/pressure/gaps,
  - detekcje trendu i ranking luk,
  - integracje `shared/core/analytics/desktop/ui`,
  - testy integracyjne i dokumentacje.
- Nie robimy:
  - embeddings/LLM topic labeling,
  - automatycznego planowania publikacji (Faza 16),
  - plugin runtime i alert center.

## Alternatywy

1. Topic modeling oparty o embeddings + zewnetrzny model.
   - Odrzucone: za duzy koszt i zaleznosc od zewnetrznych providerow na tym etapie.
2. Brak persystencji, tylko runtime response.
   - Odrzucone: brak audytu i gorsza powtarzalnosc wynikow.
3. Gap scoring bez komponentu cannibalization risk.
   - Odrzucone: brak sygnalu czy kanal juz nie duplikuje tematow.

## Konsekwencje

- Plusy:
  - szybki, deterministyczny ranking luk tematycznych,
  - mozliwosc pokazania trendu i presji niszy w UI,
  - gotowy fundament pod planner publikacji (Faza 16).
- Minusy:
  - heurystyczna klasteryzacja (bez zaawansowanego NLP),
  - jakosc labeli zalezy od prostego tokenizera i danych tytul/opis.

## Metryki sukcesu

- topic clusters i gaps sa persystowane i odczytywane przez IPC,
- seeded overlap scenario podnosi cannibalization risk dla klastra,
- UI pokazuje luki i trend klastrow dla zakresu dat,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez bledow.
