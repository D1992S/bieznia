# ADR 004: Performance i stabilnosc - cache analityki + pipeline inkrementalny

- Status: Accepted
- Data: 2026-02-17
- Faza: 12

## Kontekst

Po ustabilizowaniu metryk (Faza 10.5) i asystenta (Faza 11) glowne zapytania analityczne zaczely wykonywac sie wielokrotnie z tymi samymi parametrami. Brakowalo:

- cache wynikow po stronie SQLite,
- spójnej inwalidacji po zmianie danych (sync/import),
- inkrementalnego przeliczania `ml_features`,
- wspolnych metryk wydajnosci (hit-rate, p50/p95).

## Decyzja

Wprowadzamy warstwe `AnalyticsQueryCache` oraz incremental recompute w pipeline:

- cache kluczowany po `(metric_id, params_hash)` z TTL,
- rewizja cache przechowywana w `app_meta` (`analytics.cache.revision`),
- inwalidacja globalna przez increment rewizji + czyszczenie tabeli cache,
- eventy cache (`hit/miss/set/stale/invalidate`) zapisywane do `analytics_cache_events`,
- monitoring przez `getPerformanceSnapshot`:
  - hit/miss/hit-rate,
  - invalidations,
  - p50/p95 z `analytics_trace_runs`.

Pipeline:

- `runDataPipeline` przyjmuje `changedDateFrom/changedDateTo`,
- zapis cech ograniczony do okna inkrementalnego z buforem rolling 29 dni,
- sync/import przekazuje zakres zmian do pipeline.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - cache dla `metrics`, `channel`, `reports`,
  - inwalidacje cache po `sync` i `import`,
  - incremental write window dla `ml_features`,
  - testy integracyjne cache + incremental pipeline.
- Nie robimy:
  - rozproszonego cache (Redis/in-memory cross-process),
  - cache dla write path i mutacji biznesowych,
  - przebudowy architektury pipeline poza zakresem `ml_features`,
  - nowego UI panelu telemetry.

## Alternatywy

1. Brak cache i tylko optymalizacja SQL.
   - Odrzucone: nie rozwiazuje powtarzalnych zapytan o tych samych parametrach.
2. Cache in-memory w desktop runtime.
   - Odrzucone: brak trwałości i brak wspolnego telemetry persistence.
3. Pelny recompute pipeline po kazdej zmianie.
   - Odrzucone: niepotrzebny koszt przy lokalnych zmianach dziennych.

## Konsekwencje

- Plusy:
  - szybsze odpowiedzi dla powtarzalnych zapytan,
  - jawny mechanizm inwalidacji po zmianach danych,
  - mniejszy koszt przeliczania cech przy update'ach punktowych,
  - obserwowalnosc wydajnosci bez zewnetrznej infrastruktury.
- Minusy:
  - dodatkowa zlozonosc (rewizje, eventy cache, okna incremental),
  - ryzyko stale cache przy pominięciu inwalidacji w nowych write-pathach.

## Metryki sukcesu

- `cache.hitRate > 0` dla typowych flow dashboard/report,
- brak regresji merytorycznej wynikow po incremental recompute,
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` bez bledow.
