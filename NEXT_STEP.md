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
| 13 | Quality Scoring | **NASTEPNA** |
| 14-19 | Reszta | Oczekuje |

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

## Co robic teraz - Faza 13: Quality Scoring

**Cel:** uruchomic wielowymiarowy scoring jakosci contentu, oparty o metryki z danych historycznych i confidence.

**Zakres (MVP):**
1. Schemat i storage:
   - tabela `agg_quality_scores` (video_id, score, components_json, confidence, calculated_at),
   - indeksy pod odczyt po `channel_id/date`.
2. Silnik scoringu:
   - komponenty: velocity, efficiency, engagement, retention, consistency,
   - normalizacja percentile rank wewnatrz kanalu,
   - finalny score + breakdown.
3. Confidence:
   - `high` / `medium` / `low` zalezne od ilosci historii danych.
4. Integracja UI/IPC:
   - odczyt rankingow i breakdown na dashboardzie.
5. Testy:
   - seeded scenariusze ze znanym rankingiem i planted high-engagement.

**Definition of Done (Faza 13):**
- [ ] Ranking quality score z breakdown komponentow dziala dla aktywnego kanalu.
- [ ] Confidence labels sa zgodne z dlugoscia historii.
- [ ] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` - 0 errors.

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
