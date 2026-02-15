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
| 11 | LLM Assistant (Lite) | **NASTEPNA** |
| 12-19 | Reszta | Oczekuje |

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

## Co robic teraz - Faza 11: LLM Assistant (Lite)

**Cel:** uruchomic asystenta AI evidence-first, ktory odpowiada tylko na podstawie danych z DB i whitelisty narzedzi.

**Zakres:**
1. Tooling i kontrakty:
   - kontrakty IPC + DTO dla zapytan asystenta i odpowiedzi z evidence.
2. Executor asystenta:
   - whitelist narzedzi read-only (bez dowolnego SQL),
   - odpowiedz strukturalna: `answer`, `evidence[]`, `confidence`, `followUpQuestions[]`.
3. Persistencja:
   - historia rozmow + evidence w SQLite.
4. UI:
   - zakladka asystenta (chat + lista evidence + status confidence).
5. Tryb offline:
   - deterministyczny LocalStub.

**Definition of Done (Faza 11):**
- [ ] Odpowiedzi asystenta zawieraja evidence z konkretnymi rekordami DB.
- [ ] Dziala tryb LocalStub offline.
- [ ] UI asystenta dziala przez IPC bez naruszenia granic architektury.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.

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
