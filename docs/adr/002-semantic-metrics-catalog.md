# ADR 002 - Semantic Layer (katalog metryk 15-25)

- Data: 2026-02-15
- Status: Accepted
- Decydenci: owner projektu + AI implementujące Fazę 10.5

## Kontekst

W poprzednich fazach metryki były liczone bez jednolitego katalogu:
- część logiki w `metrics-queries`,
- część w `reports`,
- brak jednego miejsca z definicją metryki, źródłem i jednostką.

To utrudnia spójność KPI między ekranami i utrudnia audyt.

## Problem

Bez semantic layer:
- ryzyko, że dwa ekrany pokazują różne wartości tej samej metryki,
- trudniej utrzymać i testować transformacje,
- brak stabilnego interfejsu pod asystenta LLM.

## Opcje

1. Zostawić metryki rozproszone i dopisywać testy ad hoc.
2. Dodać tylko enum metryk bez implementacji odczytu.
3. Dodać katalog metryk + wspólny serwis odczytu (raw + derived).

## Decyzja

Wybór: **opcja 3**.

Implementujemy:
- `createSemanticMetricService(...)`,
- katalog 20 metryk (`channel.*`, `ml.*`, `content.*`, `video.*`),
- wspólne API:
  - `listMetricDefinitions()`,
  - `readMetricValue(...)`,
  - `readMetricValues(...)`,
  - `readTimeseries(...)`.

Migracja krytycznych miejsc:
- `metrics.getKpis` (zakładka Statystyki),
- `metrics.getTimeseries` (wykres Statystyki),
- `reports.generateDashboardReport` (zakładka Raporty i eksport, dodatkowe insighty o anomaliach/top video).

## Konsekwencje pozytywne

- Jedno źródło prawdy dla definicji metryk.
- Mniej duplikacji logiki między dashboardem i raportem.
- Lepsza baza pod warstwę evidence-first i query planner w Fazie 11.

## Konsekwencje negatywne / ryzyka

- Większa złożoność samego `core`.
- Potencjalne ryzyko regresji wartości przy migracji z legacy query code.

## Plan wdrożenia

1. Wprowadzić katalog metryk (15-25).
2. Przepiąć KPI + timeseries na semantic service.
3. Podpiąć semantic metryki pod raport (insighty).
4. Dodać testy integracyjne + snapshoty.

## Metryki sukcesu

- Katalog zawiera min. 15 metryk (docelowo 20).
- Dwa krytyczne miejsca UI działają przez semantic layer.
- Snapshoty nie wykazują regresji liczbowych.

## Plan rollback

- Powrót do poprzednich `metrics-queries` i usunięcie wywołań semantic service.
- Katalog może pozostać w repo jako warstwa pasywna.

