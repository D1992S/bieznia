# Nastepny krok - PRZECZYTAJ NAJPIERW

> **Ten plik mowi Ci co robic teraz.** Aktualizuj go na koncu kazdej sesji.

## Aktualny status

| Faza | Nazwa | Status |
|------|-------|--------|
| 0 | Foundation | DONE |
| 1 | Data Core | DONE |
| 2 | Desktop Backend + IPC | DONE |
| 3 | Data Modes + Fixtures | DONE |
| 4 | Data Pipeline + Feature Engineering | DONE |
| 5 | Sync Orchestrator | DONE |
| 6 | Bazowy ML Framework | DONE |
| 7 | Dashboard + Raporty + Eksport | DONE |
| 8 | Auth + Profile + Settings | DONE |
| 9 | Import + Enrichment + Search | DONE |
| 10 | Anomaly Detection + Trend Analysis | DONE |
| 10.5 | Hardening (spojnosc liczb + regresje + trace + semantic layer) | DONE |
| 11 | LLM Assistant (Lite) | DONE |
| 12 | Performance i stabilnosc (cache + inkrementalnosc) | DONE |
| 13 | Quality Scoring | DONE |
| 14 | Competitor Intelligence | DONE |
| 15 | Topic Intelligence | DONE |
| 16 | Planning System | DONE |
| 17 | Plugins (Insights/Alerts) | SKIP (solo) |
| 18 | Diagnostics + Recovery | DONE |
| 19 | Polish + Local UX | DONE |

## Co zostalo zrobione (Faza 9)

- Kontrakty `shared` rozszerzono o import/search:
  - `import:previewCsv`, `import:runCsv`, `search:content`,
  - DTO + result schemas dla preview/import/search.
- `core` dostal nowa migracje `004-import-search-schema`:
  - `raw_csv_imports`,
  - `dim_content_documents`,
  - indeks FTS5 `fts_content_documents` + triggery sync.
- Dodano query service `createImportSearchQueries`:
  - parser CSV (quoted fields + auto delimiter),
  - walidacja i mapowanie kolumn z raportem bledow (wiersz/kolumna),
  - zapis danych dziennych do `fact_channel_day`,
  - zapis dokumentow tresci do FTS,
  - wyszukiwanie z `snippet` + `score` (bm25).
- Desktop runtime i IPC:
  - nowe handlery i bridge preload dla import/search,
  - po imporcie CSV automatycznie uruchamiany `runDataPipeline`.
- UI:
  - nowa zakladka `Import i wyszukiwanie`,
  - podglad CSV, mapowanie kolumn, uruchomienie importu,
  - lista problemow walidacji,
  - wyszukiwarka FTS z wynikami i snippetami.
- Testy:
  - `packages/core/src/import-search.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`.
- Regresja:
  - `pnpm lint` PASS
  - `pnpm typecheck` PASS
  - `pnpm test` PASS (80/80)
  - `pnpm build` PASS

## Co zostalo zrobione (Faza 10)

- Kontrakty `shared` rozszerzono o anomaly/trend:
  - `ml:detectAnomalies`,
  - `ml:getAnomalies`,
  - `ml:getTrend`,
  - DTO + result schemas dla anomalii, trendu i change points.
- `core` dostal nowa migracje `005-ml-anomaly-trend-schema`:
  - tabela `ml_anomalies`,
  - indeksy pod odczyt po `channel_id/target_metric/date` i `severity`.
- `ml` dostal nowy serwis `anomaly-trend`:
  - detekcja anomalii: `Z-score + IQR` z confidence/severity,
  - dekompozycja szeregu: trend/seasonality/residual (STL-like),
  - change point detection: CUSUM,
  - zapisywanie anomalii do `ml_anomalies`.
- Desktop runtime i IPC:
  - nowe handlery i bridge preload dla analizy Fazy 10.
- UI:
  - overlay anomalii i change points na wykresie statystyk,
  - feed anomalii z filtrem severity,
  - osobny panel analizy trendu (delta, kierunek, lista change points),
  - auto-trigger analizy dla aktywnego zakresu dat + reczne odswiezenie.
- Testy:
  - `packages/ml/src/anomaly-trend.integration.test.ts` (planted outliers + planted change points),
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`.
- Regresja:
  - `pnpm lint` PASS
  - `pnpm typecheck` PASS
  - `pnpm test` PASS (84/84)
  - `pnpm build` PASS

## Co zostalo zrobione (Faza 10.5)

- Golden DB:
  - dodano generator `scripts/generate-insight-golden-db.ts`,
  - wygenerowano `fixtures/insight_golden.db` (3 kanaly, 20 filmow, 90 dni, edge-case).
- Snapshot tests analityki:
  - dodano `apps/desktop/src/analytics-snapshots.integration.test.ts` (23 snapshoty kontraktowe),
  - dodano komendy `pnpm test:snapshots` oraz `pnpm test:snapshots:update`,
  - dodano krok snapshotow do CI (`.github/workflows/ci.yml`).
- Trace ID + lineage:
  - migracja `006-analytics-trace-schema` (tabele `analytics_trace_runs`, `analytics_trace_lineage`),
  - wrapper `runWithAnalyticsTrace(...)` w `packages/core/src/observability/analytics-tracing.ts`,
  - podpiete kluczowe operacje: metrics/channel/reports/ml (desktop main).
- Semantic Layer (step 1):
  - dodano `packages/core/src/semantic/metrics-semantic-layer.ts` (katalog 20 metryk + wspolne API),
  - migrowano krytyczne sciezki: `getKpis`, `getTimeseries`, `generateDashboardReport`.
- ADR + scope freeze:
  - dodano `docs/adr/000-template.md`,
  - dodano ADR: `docs/adr/001-evidence-lineage-trace.md` i `docs/adr/002-semantic-metrics-catalog.md`,
  - scope freeze 10.5:
    - robimy: golden DB, snapshoty, trace + lineage, semantic layer, ADR-y, testy regresji.
    - nie robimy: cache/incremental (Faza 12), nowe modele ML, zmiany UX/feature scope poza hardening.
- Testy i regresja:
  - `pnpm lint` PASS,
  - `pnpm typecheck` PASS,
  - `pnpm test` PASS,
  - `pnpm test:snapshots:update` PASS.

**Definition of Done (Faza 10.5):**
- [x] Snapshot tests przechodza local/CI i lapia regresje liczb.
- [x] `trace_id` jest generowany i zapisany dla kluczowych operacji analitycznych.
- [x] Semantic Layer ma 15-25 metryk i jest podpiety pod min. 2 krytyczne miejsca UI.
- [x] Jest template ADR i min. 2 ADR w repo.
- [x] Przygotowana gotowosc do Fazy 11 Lite (evidence-first, liczby z DB).
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.
- [x] Wpis w `CHANGELOG_AI.md`.
- [x] Aktualizacja `README.md` i `NEXT_STEP.md`.

## Co zostalo zrobione (Faza 11)

- Tooling i kontrakty:
  - dodano kontrakty IPC/DTO dla asystenta:
    - `assistant:ask`,
    - `assistant:listThreads`,
    - `assistant:getThreadMessages`,
  - dodano struktury evidence:
    - `answer`, `evidence[]`, `confidence`, `followUpQuestions[]`, `usedStub`.
- Persistencja:
  - dodano migracje `007-assistant-lite-schema`:
    - `assistant_threads`,
    - `assistant_messages`,
    - `assistant_message_evidence`.
- Executor asystenta (Lite):
  - wdrozono `@moze/llm` z deterministicznym LocalStub,
  - wdrozono whitelist narzedzi read-only:
    - `read_channel_info`,
    - `read_kpis`,
    - `read_top_videos`,
    - `read_anomalies`,
  - brak dowolnego SQL od uzytkownika.
- Desktop runtime i IPC:
  - podlaczono serwis asystenta do backendu desktop,
  - dodano handlery IPC + preload bridge dla komend `assistant:*`.
- UI:
  - dodano zakladke `Asystent AI`:
    - chat,
    - lista watkow,
    - historia rozmow,
    - viewer evidence + confidence + follow-up questions.
- ADR + scope freeze:
  - dodano `docs/adr/003-llm-assistant-lite-whitelist-localstub.md`.
- Testy:
  - dodano testy `packages/llm/src/assistant-lite.integration.test.ts`,
  - rozszerzono `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzono `apps/desktop/src/ipc-handlers.integration.test.ts`,
  - rozszerzono `packages/core/src/data-core.integration.test.ts` (nowe tabele migracji 007).

**Definition of Done (Faza 11):**
- [x] Odpowiedzi asystenta zawieraja evidence z konkretnymi rekordami DB.
- [x] Dziala tryb LocalStub offline.
- [x] UI asystenta dziala przez IPC bez naruszenia granic architektury.
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 12)

- Cache analityki:
  - dodano migracje `008-analytics-query-cache-schema`:
    - `analytics_query_cache`,
    - `analytics_cache_events`,
  - wdrozono serwis `createAnalyticsQueryCache(...)`:
    - cache po `(metric_id, params_hash)`,
    - wersjonowanie cache przez `app_meta` (`analytics.cache.revision`),
    - TTL, hit/miss/stale/set/invalidate eventy.
- Integracja cache:
  - `createMetricsQueries` i `createChannelQueries` korzystaja z cache + walidacji payloadow,
  - `generateDashboardReport` i `exportDashboardReport` korzystaja z cache raportu.
- Inwalidacja po zmianach danych:
  - desktop runtime invaliduje cache po:
    - `sync` (`startSync`/`resumeSync` po statusie `completed`),
    - `import` CSV (po zapisie danych importu).
- Inkrementalny pipeline:
  - `runDataPipeline` dostal zakres zmian `changedDateFrom/changedDateTo`,
  - feature engineering zapisuje tylko okno inkrementalne z buforem rolling 29 dni,
  - `sync-orchestrator` przekazuje date zmian do pipeline (takze po resume, gdy date odczytuje z persisted batch).
- Monitoring wydajnosci:
  - `getPerformanceSnapshot` raportuje cache hit-rate, invalidacje oraz latency p50/p95 (global + per operation),
  - desktop loguje snapshot po inwalidacji cache.
- Testy:
  - dodano `packages/core/src/analytics-query-cache.integration.test.ts`,
  - rozszerzono `packages/core/src/data-core.integration.test.ts` (nowe tabele migracji 008),
  - rozszerzono `packages/data-pipeline/src/pipeline-runner.integration.test.ts` o scenariusz incremental.
- Regresja:
  - `corepack pnpm lint` PASS
  - `corepack pnpm typecheck` PASS
  - `corepack pnpm test` PASS (93/93)
  - `corepack pnpm build` PASS

**Definition of Done (Faza 12):**
- [x] Cache dziala dla kluczowych zapytan i raportuje hit/miss.
- [x] Inwalidacja po sync/import jest poprawna.
- [x] Inkrementalne sciezki skracaja czas bez zmiany wyniku.
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 13)

- Kontrakty `shared` rozszerzono o quality scoring:
  - `analytics:getQualityScores`,
  - DTO/result schemas:
    - `QualityScoreQueryInputDTO`,
    - `QualityScoreItemDTO`,
    - `QualityScoreResultDTO`,
    - `QualityScoreConfidence`.
- `core` dostal migracje `009-quality-scoring-schema`:
  - tabela `agg_quality_scores`,
  - indeksy pod odczyt po `channel_id/date_from/date_to` i `score`.
- Dodano serwis `@moze/analytics`:
  - `getQualityScores(...)` (velocity/efficiency/engagement/retention/consistency),
  - normalizacja percentile rank wewnatrz kanalu,
  - confidence labels (`high`/`medium`/`low`) na podstawie `daysWithData`,
  - persystencja breakdown do `agg_quality_scores`.
- Desktop runtime i IPC:
  - nowa komenda backendu i tracing `analytics.getQualityScores`,
  - handlery IPC + preload bridge dla `analytics:getQualityScores`.
- UI:
  - nowy panel "Quality scoring (Faza 13)" w zakladce `Statystyki`,
  - ranking z wynikiem, confidence i breakdown komponentow.
- Testy:
  - `packages/analytics/src/quality-scoring.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`,
  - rozszerzone `packages/core/src/data-core.integration.test.ts` (nowa tabela migracji 009).
- ADR:
  - dodano `docs/adr/005-quality-scoring.md`.
- Regresja:
  - `corepack pnpm lint` PASS
  - `corepack pnpm typecheck` PASS
  - `corepack pnpm test` PASS (98/98)
  - `corepack pnpm build` PASS

**Definition of Done (Faza 13):**
- [x] Ranking quality score z breakdown komponentow dziala dla aktywnego kanalu.
- [x] Confidence labels sa zgodne z dlugoscia historii.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 14)

- Kontrakty `shared` rozszerzono o competitor intelligence:
  - `analytics:syncCompetitors`,
  - `analytics:getCompetitorInsights`,
  - DTO/result schemas dla sync i insightow konkurencji.
- `core` dostal migracje `010-competitor-intelligence-schema`:
  - tabela `dim_competitor`,
  - tabela `fact_competitor_day`,
  - indeksy pod odczyt po `channel_id/date` i `(channel_id, competitor_channel_id, date)`.
- Dodano serwis `@moze/analytics`:
  - `syncCompetitorSnapshots(...)`:
    - deterministiczny local-stub snapshotow konkurencji,
    - delta detection (`inserted/updated/unchanged`).
  - `getCompetitorInsights(...)`:
    - relative growth,
    - market share,
    - content frequency comparison,
    - hit detection (`views > mean + 3 * sigma`),
    - momentum ranking.
- Desktop runtime i IPC:
  - nowe komendy backendu i tracing:
    - `analytics.syncCompetitors`,
    - `analytics.getCompetitorInsights`,
  - handlery IPC + preload bridge dla nowych endpointow.
- UI:
  - nowy panel "Analiza konkurencji (Faza 14)" w zakladce `Statystyki`,
  - synchronizacja konkurencji,
  - ranking momentum i lista hitow konkurencji.
- Testy:
  - `packages/analytics/src/competitor-intelligence.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`,
  - rozszerzone `packages/core/src/data-core.integration.test.ts` (nowe tabele migracji 010).
- ADR:
  - dodano `docs/adr/006-competitor-intelligence.md`.

**Definition of Done (Faza 14):**
- [x] Dane konkurencji sa zapisywane i odczytywane przez IPC.
- [x] Hit detection flaguje planted outliers.
- [x] UI pokazuje porownanie min. 3 kanalow.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 15)

- Kontrakty `shared` rozszerzono o Topic Intelligence:
  - `analytics:runTopicIntelligence`,
  - `analytics:getTopicIntelligence`,
  - DTO/result schemas:
    - `TopicIntelligenceRunInputDTO`,
    - `TopicIntelligenceQueryInputDTO`,
    - `TopicIntelligenceResultDTO`,
    - `TopicClusterItemDTO`,
    - `TopicGapItemDTO`.
- `core` dostal migracje `011-topic-intelligence-schema`:
  - `dim_topic_cluster`,
  - `fact_topic_pressure_day`,
  - `agg_topic_gaps`,
  - indeksy pod odczyty per `channel_id`, `cluster_id`, `date`.
- Wdrozone `@moze/analytics`:
  - `runTopicIntelligence(...)`:
    - tokenizacja + stopwords + prosty stemming PL/EN,
    - klasteryzacja tematow po tokenach i trend (`rising/stable/declining`),
    - ranking luk tematycznych z `gapScore`, `nichePressure`, `cannibalizationRisk`,
    - persystencja do `dim_topic_cluster`, `fact_topic_pressure_day`, `agg_topic_gaps`.
  - `getTopicIntelligence(...)`.
- Desktop runtime i IPC:
  - nowe komendy backendu z tracingiem:
    - `analytics.runTopicIntelligence`,
    - `analytics.getTopicIntelligence`,
  - handlery IPC + preload bridge dla `analytics:runTopicIntelligence` i `analytics:getTopicIntelligence`.
- UI:
  - podlaczono API + hooki React Query dla Topic Intelligence,
  - nowy panel "Topic Intelligence (Faza 15)" w zakladce `Statystyki`:
    - przeliczanie tematyki,
    - lista najwiekszych luk z uzasadnieniem,
    - lista klastrow tematow i trendu.
- Testy:
  - `packages/analytics/src/topic-intelligence.integration.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `packages/core/src/data-core.integration.test.ts` (tabele migracji 011).
- ADR:
  - dodano `docs/adr/007-topic-intelligence.md`.

**Definition of Done (Faza 15):**
- [x] Clustering grupuje filmy w sensowne tematy (fixtures + test integracyjny).
- [x] Gap detection zwraca ranking luk z uzasadnieniem.
- [x] UI pokazuje topic gaps i trend tematow dla wybranego zakresu.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 16)

- Kontrakty `shared` rozszerzono o Planning System:
  - `planning:generatePlan`,
  - `planning:getPlan`,
  - DTO/result schemas:
    - `PlanningGenerateInputDTO`,
    - `PlanningGetPlanInputDTO`,
    - `PlanningPlanResultDTO`,
    - `PlanningRecommendationItemDTO`,
    - `PlanningEvidenceItemDTO`.
- `core` dostal migracje `012-planning-system-schema`:
  - `planning_plans`,
  - `planning_recommendations`,
  - indeksy pod odczyty per `channel_id/date` i `plan_id/slot_order`.
- Wdrozone `@moze/analytics`:
  - `generatePlanningPlan(...)`:
    - laczenie sygnalow z quality + competitor + topic,
    - deterministyczny ranking rekomendacji,
    - conflict resolution (deduplikacja tematow + kara za kanibalizacje),
    - persystencja planu i rekomendacji.
  - `getPlanningPlan(...)`:
    - read-only odczyt ostatniego planu dla zakresu.
- Desktop runtime i IPC:
  - nowe komendy backendu z tracingiem:
    - `planning.generatePlan`,
    - `planning.getPlan`,
  - handlery IPC + preload bridge dla `planning:*`.
- UI:
  - podlaczono API + hooki React Query dla Planning System,
  - nowy panel "System planowania (Faza 16)" w zakladce `Statystyki`:
    - generowanie planu publikacji,
    - lista rekomendacji ze slotami, confidence, rationale i evidence,
    - ostrzezenia o ryzyku kanibalizacji.
- Testy:
  - `packages/analytics/src/planning-system.integration.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `packages/core/src/data-core.integration.test.ts` (tabele migracji 012).
- ADR:
  - dodano `docs/adr/008-planning-system.md`.

**Definition of Done (Faza 16):**
- [x] Planner zwraca rekomendacje publikacji dla zakresu dat.
- [x] Kazda rekomendacja ma rationale + evidence.
- [x] UI pozwala odswiezyc i przejrzec plan bez bledow IPC.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

## Co zostalo zrobione (Faza 18)

- Kontrakty `shared` rozszerzono o Diagnostics + Recovery:
  - `diagnostics:getHealth`,
  - `diagnostics:runRecovery`,
  - DTO/result schemas dla health check i recovery krokowego.
- Dodano pakiet `@moze/diagnostics`:
  - `getDiagnosticsHealth(...)`,
  - `runDiagnosticsRecovery(...)`,
  - checks: DB integrity, cache snapshot, pipeline freshness, IPC bridge,
  - actions: `integrity_check`, `invalidate_analytics_cache`, `rerun_data_pipeline`, `reindex_fts`, `vacuum_database`.
- Desktop runtime i IPC:
  - nowe komendy backendu z tracingiem:
    - `diagnostics.getHealth`,
    - `diagnostics.runRecovery`,
  - handlery IPC + preload bridge dla `diagnostics:*`.
- UI:
  - nowe hooki React Query i panel `Diagnostyka i recovery (Faza 18)` w zakladce `Statystyki`,
  - odswiezenie health check,
  - uruchamianie recovery i prezentacja statusu krokow.
- Testy:
  - `packages/diagnostics/src/diagnostics-service.integration.test.ts`,
  - rozszerzone `packages/shared/src/ipc/contracts.test.ts`,
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`.
- ADR:
  - dodano `docs/adr/009-diagnostics-recovery.md`.
- Regresja:
  - `corepack pnpm lint` PASS
  - `corepack pnpm typecheck` PASS
  - `corepack pnpm test` PASS (116/116)
  - `corepack pnpm build` PASS

**Definition of Done (Faza 18):**
- [x] Health check zwraca czytelny status kluczowych modulow.
- [x] Recovery potrafi naprawic minimum jeden scenariusz stalego stanu danych/cache.
- [x] UI pokazuje status i pozwala uruchomic recovery bez bledow IPC.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

## Co zostalo zrobione - Faza 19: Polish + Local UX

> Faza 17 jest **SKIP (solo)** i nie implementujemy plugin runtime.

**Cel:** domknac UX lokalny single-user i przygotowac stabilny tryb codziennej pracy bez packagingu i bez telemetry opt-in.

**Scope freeze 19 (robimy / nie robimy):**
- Robimy:
  - dopracowanie UX (czytelnosc paneli, komunikaty, stany loading/error/empty),
  - poprawki responsywnosci desktop + mniejsze ekrany,
  - finalne porzadki copy/pl i ergonomii przeplywu codziennego.
- Nie robimy:
  - plugin runtime (pozostaje SKIP),
  - packaging dystrybucyjny,
  - telemetry opt-in i integracje chmurowe.

**Zakres (MVP):**
1. UI polish:
   - finalny przeglad zakladek `Statystyki`, `Asystent AI`, `Raporty`, `Import`, `Ustawienia`.
2. UX:
   - dopracowanie komunikatow i akcji (success/error/retry),
   - redukcja tarcia w najczestszych flow (sync -> analiza -> plan -> raport).
3. Stabilnosc:
   - brak regresji IPC i danych przy codziennym scenariuszu uzycia.

**Definition of Done (Faza 19):**
- [x] Kluczowe flow sa spójne i czytelne UX-owo w codziennym uzyciu.
- [x] Brak krytycznych brakow copy/pl i brakow ergonomii w glownych panelach.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

**Kolejny krok (po fazach 0-19):**
- Tryb utrzymania i testow regresyjnych:
  - uruchamiaj pelny regression check przy kazdej zmianie,
  - utrzymuj spojnosc UI po polsku i ergonomie codziennych flow,
  - zbieraj uwagi z testow manualnych i domykaj poprawki jako male PR-y.

## Krytyczne zasady (nie pomijaj)

1. **Jezyk UI = POLSKI** - wszystkie komunikaty user-facing po polsku.
2. **Zod 4** (nie 3) - import z `zod/v4`.
3. **ESLint 9** (nie 10).
4. **Result<T, AppError>** zamiast throw w logice biznesowej.
5. **Explicit ORDER BY** w kazdym SQL.
6. Przeczytaj `AGENTS.md` przed rozpoczeciem pracy.
7. Na koniec sesji: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
8. Na koniec sesji: wpis w `CHANGELOG_AI.md` + aktualizacja tego pliku.
9. Przed startem kazdej fazy: mini ADR + 10-min scope freeze ("robimy / nie robimy").

## Pelna mapa faz

Szczegoly: `docs/PLAN_REALIZACJI.md`

| # | Faza | Milestone |
|---|------|-----------|
| 0 | Foundation | M1 |
| 1 | Data Core | M1 |
| 2 | Desktop Backend + IPC | M1 |
| 3 | Data Modes + Fixtures | M2 |
| 4 | Data Pipeline + Feature Engineering | M2 |
| 5 | Sync Orchestrator | M2 |
| 6 | Bazowy ML Framework | M3 |
| 7 | Dashboard + Raporty + Eksport | M3 |
| 8 | Auth + Profile + Settings | M4 |
| 9 | Import + Enrichment + Search | M4 |
| 10 | Anomaly Detection + Trend Analysis | M5 |
| 10.5 | Hardening (spojnosc liczb + regresje + trace) | M5 |
| 11 | LLM Assistant (Lite) | M5 |
| 12 | Performance i stabilnosc (cache + inkrementalnosc) | M5 |
| 13 | Quality Scoring | M5 |
| 14 | Competitor Intelligence | M5 |
| 15 | Topic Intelligence | M5 |
| 16 | Planning System | M6 |
| 17 | Plugins (Insights/Alerts) - SKIP (solo) | M6 |
| 18 | Diagnostics + Recovery | M6 |
| 19 | Polish + Local UX (bez packaging/telemetry) | M6 |


## Stan techniczny po sesji (2026-02-13, test-plan)

- Dodano dedykowany runbook testowy przed wejsciem w Faze 9:
  - `docs/runbooks/test-plan-faza-0-8.md`
- Runbook zawiera:
  - manualne scenariusze testowe dla kazdej dostepnej funkcji (Fazy 0-8),
  - gotowe prompty dla AI/LLM do audytu jakosci i spojnosci,
  - kryteria PASS/FAIL i warunki wejscia do Fazy 9.
- Rekomendacja operacyjna:
  - wykonac pelny runbook i dopiero po zamknieciu bledow P0/P1 rozpoczac implementacje Fazy 9.


## Stan techniczny po sesji (2026-02-13, test-plan UX)

- Doprecyzowano runbook testowy dla osob bez doswiadczenia:
  - dodano sekcje "Instrukcja krok po kroku" (co uruchomic, co klikac, jak raportowac PASS/FAIL),
  - dodano gotowy szablon raportu testow do wypelnienia (copy/paste).
- Cel zmiany:
  - usuniecie niejasnosci "co mam zrobic" przed startem Fazy 9.
- Rekomendacja:
  - wykonac testy wg sekcji 0 + 2 + 3 w `docs/runbooks/test-plan-faza-0-8.md` i podjac decyzje GO/NO-GO.

## Stan techniczny po sesji (2026-02-13, test-plan simplification)

- Uproszczono runbook testow funkcjonalnych dla Faz 0-8:
  - `docs/runbooks/test-plan-faza-0-8.md`
- Zmiany w runbooku:
  - usunieto zbedny zargon i skrocono instrukcje do prostych krokow,
  - dodano jedna, jasna regule decyzji GO/NO-GO,
  - pozostawiono tylko niezbedne komendy i prosty szablon raportu.
- Cel zmiany:
  - umozliwic wykonanie testow osobie nietechnicznej, bez znajomosci Electron/IPC/ML.
- Rekomendacja:
  - wykonac runbook od sekcji 2 do 8 i podjac decyzje GO/NO-GO przed startem implementacji Fazy 9.
