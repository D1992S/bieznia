# FIX_PLAN.md — Audyt Architektury

> Wygenerowano: 2026-02-17
> Audytor: Principal Software Architect (AI)
> Zakres: Pełny przegląd kodu vs. "Plan Realizacji" (AGENTS.md + docs/PLAN_REALIZACJI.md)

---

## Podsumowanie

| Priorytet   | Liczba zgłoszeń |
| ----------- | --------------- |
| KRYTYCZNY   | 2               |
| WYSOKI      | 7               |
| ŚREDNI      | 4               |
| **Razem**   | **13**          |

### Co działa dobrze (nie wymaga zmian)

- **Granice zależności**: Wszystkie importy zgodne z regułą `shared ← core ← sync/reports/llm/ml ← apps`. Zero cykli.
- **IPC**: Wzorcowa implementacja — Zod validation na wejściu i wyjściu po obu stronach (preload + main).
- **Zero `any`**: Cały codebase bez `: any`.
- **Zero `@ts-ignore`/`@ts-expect-error`**: Brak obejść kompilatora.
- **Result<T, AppError>**: Konsekwentnie stosowany w core i desktop.
- **AppError**: Poprawna serializacja DTO, kody błędów, opcjonalny cause.
- **Logger**: Czysty, testable, dependency-injected.
- **Zod na granicach**: IPC contracts, preload, handlers — wszystko walidowane.

---

## FIX-001 [PRIORYTET: KRYTYCZNY] Mutacja SQL poza Repository Pattern — warstwa aplikacji

**Lokalizacja:** `apps/desktop/src/runtime/desktop-main.ts:450`

**Naruszenie:** Reguła z AGENTS.md: _"Mutacje bazy: WYŁĄCZNIE przez CoreRepository lub dedykowane repozytoria w @moze/core."_ W warstwie aplikacji (`desktop`) wykonywana jest bezpośrednia mutacja SQL:
```ts
db.prepare('UPDATE profiles SET is_active = 0 WHERE is_active <> 0').run();
```
Ta linia pomija `CoreRepository`, który posiada dedykowaną metodę `upsertProfile`.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `packages/core/src/repositories/core-repository.ts`.
2. Dodaj nową metodę `deactivateAllProfiles(): Result<void, AppError>` do interfejsu `CoreRepository` i jej implementację. Metoda powinna wykonywać `UPDATE profiles SET is_active = 0 WHERE is_active <> 0` wewnętrznie, owijając wynik w `ok(undefined)` / `err(AppError)`.
3. W `apps/desktop/src/runtime/desktop-main.ts` w funkcji `syncActiveProfileInDatabase` (~linia 447-461) zastąp bezpośredni `db.prepare(...)` wywołaniem `repository.deactivateAllProfiles()`.
4. Obsłuż `Result` z nowej metody — jeśli `!result.ok`, zwróć `result` (propagacja błędu).
5. Uruchom testy: `pnpm --filter @moze/core test` i `pnpm --filter @moze/desktop test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `db.prepare` w `desktop-main.ts` — żaden wynik nie zawiera `UPDATE` ani `DELETE` ani `INSERT`
- [ ] `CoreRepository` posiada metodę `deactivateAllProfiles`
- [ ] Testy core i desktop przechodzą bez błędów

---

## FIX-002 [PRIORYTET: KRYTYCZNY] Mutacje SQL poza @moze/core — pakiety domenowe

**Lokalizacja:**
- `packages/llm/src/assistant-lite.ts:336-435` (INSERT/UPDATE na `assistant_threads`, `assistant_messages`, `assistant_evidence`)
- `packages/analytics/src/competitor-intelligence.ts:376-456` (UPSERT na `competitor_channels`, `competitor_snapshots`)
- `packages/analytics/src/planning-system.ts:274-320` (DELETE/INSERT na `planning_plans`, `planning_recommendations`)
- `packages/analytics/src/topic-intelligence.ts:706-794` (UPSERT/DELETE/INSERT na `topic_clusters`, `topic_gaps`, `topic_pressure`)
- `packages/analytics/src/quality-scoring.ts:269-320` (DELETE/INSERT na `quality_scores`)
- `packages/data-pipeline/src/pipeline-runner.ts:539-709` (DELETE/INSERT na `stg_videos`, `stg_channel`, `video_features`, `pipeline_lineage`)
- `packages/ml/src/ml-baseline.ts:412-540` (UPDATE/INSERT na `ml_models`, `ml_backtests`, `ml_predictions`)
- `packages/ml/src/anomaly-trend.ts:656-685` (DELETE/INSERT na `ml_anomalies`)

**Naruszenie:** Reguła z AGENTS.md: _"Mutacje bazy: WYŁĄCZNIE przez CoreRepository lub dedykowane repozytoria w @moze/core."_ Łącznie 8 plików w 5 pakietach (`llm`, `analytics`, `data-pipeline`, `ml`) zawiera bezpośrednie instrukcje INSERT/UPDATE/DELETE poza `@moze/core`. To systemic architectural drift — każdy pakiet samodzielnie tworzy prepared statements zamiast delegować do dedykowanych repozytoriów.

**Rozwiązanie (Dla Wykonawcy):**
1. Dla każdego pakietu domenowego utwórz dedykowane repozytorium w `packages/core/src/repositories/`:
   - `assistant-repository.ts` — metody: `insertThread`, `updateThread`, `insertMessage`, `insertEvidence`
   - `competitor-repository.ts` — metody: `upsertCompetitor`, `upsertSnapshot`
   - `planning-repository.ts` — metody: `deletePlans`, `insertPlan`, `insertRecommendation`
   - `topic-repository.ts` — metody: `upsertCluster`, `deleteGaps`, `deletePressure`, `insertGap`, `upsertPressure`
   - `quality-repository.ts` — metody: `deleteScores`, `insertScore`
   - `pipeline-repository.ts` — metody: `deleteStgVideos`, `deleteStgChannel`, `insertStgChannel`, `insertStgVideo`, `deleteFeatures`, `insertFeature`, `insertLineage`
   - `ml-repository.ts` — metody: `clearActiveModels`, `insertModel`, `insertBacktest`, `insertPrediction`, `deleteAnomalies`, `insertAnomaly`
2. Każde repozytorium przyjmuje `Database.Database` jako argument i eksportuje fabrykę `createXxxRepository(db)`.
3. Każda metoda repozytorium zwraca `Result<T, AppError>`, owijając `try/catch` wokół prepared statements.
4. W plikach pakietów domenowych zastąp bezpośrednie `db.prepare(...)` wywołaniami odpowiednich metod repozytorium zaimportowanych z `@moze/core`.
5. Wyeksportuj nowe repozytoria z `packages/core/src/index.ts`.
6. Uruchom pełen zestaw testów: `pnpm test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `db.prepare` w `packages/llm/`, `packages/analytics/`, `packages/data-pipeline/`, `packages/ml/` — żaden wynik nie zawiera `INSERT`, `UPDATE`, `DELETE`
- [ ] Każde nowe repozytorium w `packages/core/src/repositories/` posiada testy jednostkowe
- [ ] Wszystkie istniejące testy pakietów domenowych przechodzą

---

## FIX-003 [PRIORYTET: WYSOKI] Angielskie komunikaty błędów — desktop-main.ts

**Lokalizacja:**
- `apps/desktop/src/runtime/desktop-main.ts:194` — `'Database is not ready. Restart the application.'`
- `apps/desktop/src/runtime/desktop-main.ts:203` — `'Data mode manager is not ready. Restart the application.'`
- `apps/desktop/src/runtime/desktop-main.ts:212` — `'Sync orchestrator is not ready. Restart the application.'`
- `apps/desktop/src/runtime/desktop-main.ts:221` — `'Assistant service is not ready. Restart the application.'`
- `apps/desktop/src/runtime/desktop-main.ts:277` — `'Failed to reload active profile.'`
- `apps/desktop/src/runtime/desktop-main.ts:286` — `'Cannot switch active profile while synchronization is running.'`

**Naruszenie:** Reguła z AGENTS.md: _"Komunikaty użytkownika: polski. Kod, zmienne, komentarze: angielski."_ Komunikaty w `AppError.create()` trafiają do UI przez DTO i są widoczne dla użytkownika. Muszą być po polsku.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `apps/desktop/src/runtime/desktop-main.ts`.
2. Zamień komunikaty na polskie odpowiedniki:
   - `'Database is not ready. Restart the application.'` → `'Baza danych nie jest gotowa. Uruchom ponownie aplikację.'`
   - `'Data mode manager is not ready. Restart the application.'` → `'Menedżer trybu danych nie jest gotowy. Uruchom ponownie aplikację.'`
   - `'Sync orchestrator is not ready. Restart the application.'` → `'Orkiestrator synchronizacji nie jest gotowy. Uruchom ponownie aplikację.'`
   - `'Assistant service is not ready. Restart the application.'` → `'Usługa asystenta nie jest gotowa. Uruchom ponownie aplikację.'`
   - `'Failed to reload active profile.'` → `'Nie udało się przeładować aktywnego profilu.'`
   - `'Cannot switch active profile while synchronization is running.'` → `'Nie można przełączyć profilu podczas trwającej synchronizacji.'`
3. Nie zmieniaj kodów błędów (np. `APP_DB_NOT_READY`) — te pozostają po angielsku.
4. Uruchom: `pnpm --filter @moze/desktop test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `AppError.create` w `desktop-main.ts` — żaden komunikat (drugi argument) nie jest po angielsku
- [ ] Kody błędów (pierwszy argument) pozostają po angielsku
- [ ] Testy desktop przechodzą

---

## FIX-004 [PRIORYTET: WYSOKI] Angielskie komunikaty błędów — channel-queries.ts

**Lokalizacja:**
- `packages/core/src/queries/channel-queries.ts:98` — `'Channel not found.'`
- `packages/core/src/queries/channel-queries.ts:110` — `'Channel data in DB is invalid.'`
- `packages/core/src/queries/channel-queries.ts:125` — `'Failed to query channel data.'`

**Naruszenie:** Reguła z AGENTS.md: _"Komunikaty użytkownika: polski."_ Komunikaty trafiają do UI przez Result → IPC → frontend.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `packages/core/src/queries/channel-queries.ts`.
2. Zamień:
   - `'Channel not found.'` → `'Kanał nie został znaleziony.'`
   - `'Channel data in DB is invalid.'` → `'Dane kanału w bazie są nieprawidłowe.'`
   - `'Failed to query channel data.'` → `'Nie udało się pobrać danych kanału.'`
3. Uruchom: `pnpm --filter @moze/core test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `AppError.create` w `channel-queries.ts` — wszystkie komunikaty po polsku
- [ ] Testy core przechodzą

---

## FIX-005 [PRIORYTET: WYSOKI] Angielskie komunikaty błędów — metrics-queries.ts

**Lokalizacja:**
- `packages/core/src/queries/metrics-queries.ts:63` — `'Invalid date range.'`
- `packages/core/src/queries/metrics-queries.ts:75` — `'Start date cannot be later than end date.'`

**Naruszenie:** Identyczne jak FIX-004.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `packages/core/src/queries/metrics-queries.ts`.
2. Zamień:
   - `'Invalid date range.'` → `'Nieprawidłowy zakres dat.'`
   - `'Start date cannot be later than end date.'` → `'Data początkowa nie może być późniejsza niż data końcowa.'`
3. Uruchom: `pnpm --filter @moze/core test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `AppError.create` w `metrics-queries.ts` — wszystkie komunikaty po polsku
- [ ] Testy core przechodzą

---

## FIX-006 [PRIORYTET: WYSOKI] Angielskie komunikaty błędów — report-service.ts

**Lokalizacja:**
- `packages/reports/src/report-service.ts:111` — `'Report date range is invalid.'`
- `packages/reports/src/report-service.ts:122` — `'Report start date cannot be later than end date.'`
- `packages/reports/src/report-service.ts:185` — `'Forecast model type is invalid.'`
- `packages/reports/src/report-service.ts:213` — `'Forecast point format is invalid.'`
- `packages/reports/src/report-service.ts:238` — `'Failed to read forecast for report.'`
- `packages/reports/src/report-service.ts:279` — `'Top videos list format is invalid.'`
- `packages/reports/src/report-service.ts:293` — `'Failed to read top videos.'`

**Naruszenie:** Identyczne jak FIX-004.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `packages/reports/src/report-service.ts`.
2. Zamień komunikaty na polskie odpowiedniki:
   - `'Report date range is invalid.'` → `'Zakres dat raportu jest nieprawidłowy.'`
   - `'Report start date cannot be later than end date.'` → `'Data początkowa raportu nie może być późniejsza niż data końcowa.'`
   - `'Forecast model type is invalid.'` → `'Typ modelu prognozy jest nieprawidłowy.'`
   - `'Forecast point format is invalid.'` → `'Format punktu prognozy jest nieprawidłowy.'`
   - `'Failed to read forecast for report.'` → `'Nie udało się odczytać prognozy dla raportu.'`
   - `'Top videos list format is invalid.'` → `'Format listy najlepszych filmów jest nieprawidłowy.'`
   - `'Failed to read top videos.'` → `'Nie udało się odczytać najlepszych filmów.'`
3. Uruchom: `pnpm --filter @moze/reports test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `AppError.create` w `report-service.ts` — wszystkie komunikaty po polsku
- [ ] Testy reports przechodzą

---

## FIX-007 [PRIORYTET: WYSOKI] Angielskie komunikaty błędów — planning-system.ts i topic-intelligence.ts

**Lokalizacja:**
- `packages/analytics/src/planning-system.ts` — wiele komunikatów, m.in.:
  - `:104` — `'Start date cannot be later than end date.'`
  - `:165` — `'Invalid JSON array in persisted planning payload.'`
  - `:179` — `'Failed to parse persisted planning JSON payload.'`
  - Oraz: `'Invalid evidence payload...'`, `'Failed to parse persisted planning evidence.'`, `'Failed to persist planning recommendations.'`, `'Failed to read persisted planning data.'`, `'Persisted planning header has invalid format.'`, `'Persisted planning recommendation has invalid format.'`
- `packages/analytics/src/topic-intelligence.ts` — wiele komunikatów, m.in.:
  - `'Start date cannot be later than end date.'`
  - `'Failed to clean up persisted Topic Intelligence data.'`
  - `'Persisted topic keywords are invalid.'`
  - `'Failed to parse persisted topic keywords.'`
  - `'Failed to read Topic Intelligence input data.'`
  - `'Invalid video aggregate data format.'`
  - `'Invalid video day data format.'`
  - `'Failed to persist Topic Intelligence results.'`
  - `'Failed to read persisted Topic Intelligence results.'`
  - `'Persisted topic cluster row has invalid format.'`
  - `'Persisted topic gap row has invalid format.'`

**Naruszenie:** Identyczne jak FIX-004. Skala: ~20+ angielskich komunikatów w dwóch plikach pakietu `@moze/analytics`.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `packages/analytics/src/planning-system.ts`.
2. Przetłumacz WSZYSTKIE komunikaty w wywołaniach `AppError.create()` / `createPlanningError()` na język polski. Wzorzec: `'Failed to X'` → `'Nie udało się X'`, `'X is invalid'` → `'X jest nieprawidłowy'`.
3. Otwórz `packages/analytics/src/topic-intelligence.ts`.
4. Przetłumacz WSZYSTKIE komunikaty w wywołaniach `AppError.create()` / `createTopicError()` na język polski.
5. Nie zmieniaj kodów błędów — te pozostają po angielsku.
6. Uruchom: `pnpm --filter @moze/analytics test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `AppError.create\|createPlanningError\|createTopicError` w `packages/analytics/src/` — żaden komunikat nie jest po angielsku
- [ ] Kody błędów pozostają po angielsku
- [ ] Testy analytics przechodzą

---

## FIX-008 [PRIORYTET: WYSOKI] Nieuzasadnione rzutowania `as` w kodzie produkcyjnym

**Lokalizacja:**
- `apps/ui/src/features/studio/studio-app.tsx:2604` — `event.target.value as CsvImportDelimiter`
- `apps/ui/src/features/studio/studio-app.tsx:2667` — `csvMapping as CsvImportColumnMappingDTO`

**Naruszenie:** Reguła z AGENTS.md: _"TypeScript strict — zero `any`, zero unjustified `as`."_ Oba rzutowania omijają sprawdzenie typów zamiast użyć walidacji Zod lub type guard.

**Rozwiązanie (Dla Wykonawcy):**

Dla rzutowania w linii 2604:
1. Zaimportuj `CsvDelimiterSchema` z `@moze/shared` (zamiast lokalnego typu `CsvImportDelimiter`).
2. Zastąp `event.target.value as CsvImportDelimiter` przez:
   ```ts
   const parsed = CsvDelimiterSchema.safeParse(event.target.value);
   if (parsed.success) {
     setCsvDelimiter(parsed.data);
   }
   ```

Dla rzutowania w linii 2667:
1. Zaimportuj `CsvImportColumnMappingDTOSchema` z `@moze/shared`.
2. Zastąp `csvMapping as CsvImportColumnMappingDTO` przez:
   ```ts
   const parsedMapping = CsvImportColumnMappingDTOSchema.safeParse(csvMapping);
   if (!parsedMapping.success) { return; }
   // użyj parsedMapping.data zamiast csvMapping
   ```
3. Uruchom: `pnpm --filter @moze/ui test` i `pnpm --filter @moze/ui build`.

**Kryterium Akceptacji (Test):**
- [ ] Grep ` as ` w `studio-app.tsx` — zero wyników (poza `as const`, które jest dozwolone)
- [ ] Build UI przechodzi bez błędów TypeScript
- [ ] Funkcjonalność CSV import działa poprawnie (manual test)

---

## FIX-009 [PRIORYTET: WYSOKI] Surowe zapytania SQL w warstwie aplikacji desktop

**Lokalizacja:**
- `apps/desktop/src/runtime/desktop-main.ts:623-636` — SELECT z `sync_runs` (guard profilu)
- `apps/desktop/src/runtime/desktop-main.ts:679-718` — 3× SELECT z `sync_runs` i `dim_channel` (status aplikacji)

**Naruszenie:** Warstwa aplikacji (`desktop`) zawiera surowe zapytania SQL SELECT, które powinny znajdować się w `packages/core/src/queries/`. Choć nie są to mutacje, naruszają separację warstw — logika dostępu do danych jest w warstwie orkiestracji.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz lub utwórz `packages/core/src/queries/app-status-queries.ts`.
2. Przenieś tam następujące zapytania:
   - `getActiveSyncRun(): Result<{ syncRunId: number; stage: string | null } | null, AppError>` — zapytanie z linii 623-636
   - `getLatestSyncRunStatus(): Result<{ status: string; finishedAt: string | null } | null, AppError>` — zapytanie z linii 679-690
   - `getLatestChannelSyncAt(): Result<string | null, AppError>` — zapytanie z linii 692-702
   - `getLatestFinishedSyncAt(): Result<string | null, AppError>` — zapytanie z linii 706-716
3. Wyeksportuj nowy moduł z `packages/core/src/index.ts`.
4. W `desktop-main.ts` zastąp bezpośrednie `db.prepare(...)` wywołaniami nowych query.
5. Uruchom: `pnpm --filter @moze/core test` i `pnpm --filter @moze/desktop test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `db.prepare` w `desktop-main.ts` — zero wyników
- [ ] Nowy moduł `app-status-queries.ts` posiada testy
- [ ] Testy core i desktop przechodzą

---

## FIX-010 [PRIORYTET: ŚREDNI] Zduplikowane typy w warstwie UI — shadow DTO

**Lokalizacja:** `apps/ui/src/hooks/dashboard/use-dashboard-data-core.ts:74-99`

**Naruszenie:** Plik definiuje lokalne interfejsy, które duplikują DTO z `@moze/shared`:
- `CsvImportDelimiter` (linia 81) ↔ `CsvDelimiter` z `@moze/shared`
- `CsvImportPreviewInput` (linie 83-90) ↔ `CsvImportPreviewInputDTO` z `@moze/shared`
- `CsvImportRunInput` (linie 92-99) ↔ `CsvImportRunInputDTO` z `@moze/shared`

Duplikacja typów tworzy ryzyko dryfu — zmiana w shared nie propaguje się do UI, a kompilator nie zgłosi niezgodności.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `apps/ui/src/hooks/dashboard/use-dashboard-data-core.ts`.
2. Usuń lokalne definicje: `CsvImportDelimiter`, `CsvImportPreviewInput`, `CsvImportRunInput`.
3. Zaimportuj z `@moze/shared`: `CsvDelimiter`, `CsvImportPreviewInputDTO`, `CsvImportRunInputDTO`.
4. W pliku zastąp użycia `CsvImportDelimiter` → `CsvDelimiter`, `CsvImportPreviewInput` → `CsvImportPreviewInputDTO`, `CsvImportRunInput` → `CsvImportRunInputDTO`.
5. Sprawdź, czy `studio-app.tsx` importuje `CsvImportDelimiter` z tego pliku — jeśli tak, zamień na import z `@moze/shared`.
6. Uruchom: `pnpm --filter @moze/ui build` i `pnpm --filter @moze/ui test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `CsvImportDelimiter|CsvImportPreviewInput|CsvImportRunInput` w `use-dashboard-data-core.ts` — zero definicji interfejsów (dozwolone tylko importy z `@moze/shared`)
- [ ] Build UI przechodzi

---

## FIX-011 [PRIORYTET: ŚREDNI] Niedeterministyczne generowanie ID profilu

**Lokalizacja:** `apps/desktop/src/profile-manager.ts:100`

**Naruszenie:** Reguła z PLAN_REALIZACJI: _"Deterministyczność: ORDER BY w każdym zapytaniu, seeded random jeśli wymagany."_ Funkcja `createProfileId` używa `Math.random()`:
```ts
const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
```
`Math.random()` nie jest kryptograficznie bezpieczny ani deterministyczny.

**Rozwiązanie (Dla Wykonawcy):**
1. Otwórz `apps/desktop/src/profile-manager.ts`.
2. Zamień `Math.random().toString(36).slice(2, 8).toUpperCase()` na `crypto.randomUUID().slice(0, 8).toUpperCase()`.
3. Dodaj import: `import { randomUUID } from 'node:crypto';` (lub użyj globalnego `crypto.randomUUID()`).
4. Uruchom: `pnpm --filter @moze/desktop test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `Math.random` w `profile-manager.ts` — zero wyników
- [ ] Nowy ID profilu zawiera bezpieczny losowy segment
- [ ] Testy desktop przechodzą

---

## FIX-012 [PRIORYTET: ŚREDNI] Zduplikowane funkcje utility — wykres prognozy

**Lokalizacja:**
- `apps/ui/src/components/studio-forecast-chart.tsx:44-51` — `formatNumber`, `formatDateTick`
- `apps/ui/src/features/studio/studio-app.tsx:176-195` — te same funkcje

**Naruszenie:** Zasada DRY. Dwie identyczne implementacje `formatNumber` (Intl.NumberFormat pl-PL) i `formatDateTick` (toLocaleDateString) w dwóch komponentach UI.

**Rozwiązanie (Dla Wykonawcy):**
1. Utwórz plik `apps/ui/src/lib/format-utils.ts`.
2. Przenieś do niego `formatNumber` i `formatDateTick` z `studio-app.tsx`.
3. W `studio-app.tsx` zastąp lokalne definicje importem z `../../lib/format-utils.ts`.
4. W `studio-forecast-chart.tsx` zastąp lokalne definicje importem z `../lib/format-utils.ts`.
5. Uruchom: `pnpm --filter @moze/ui build` i `pnpm --filter @moze/ui test`.

**Kryterium Akceptacji (Test):**
- [ ] Grep `function formatNumber` w `apps/ui/src/` — dokładnie 1 definicja (w `format-utils.ts`)
- [ ] Grep `function formatDateTick` w `apps/ui/src/` — dokładnie 1 definicja (w `format-utils.ts`)
- [ ] Build UI przechodzi

---

## FIX-013 [PRIORYTET: ŚREDNI] Surowe zapytania SELECT w pakietach domenowych

**Lokalizacja:** Te same pliki co FIX-002 — oprócz mutacji, pakiety zawierają również surowe `db.prepare(...)` zapytania SELECT (np. odczyty stanów, walidacje istnienia danych).

**Naruszenie:** Analogicznie do mutacji, zapytania SELECT w pakietach domenowych powinny być scentralizowane w `@moze/core/queries/` lub w dedykowanych modułach query per domena. Aktualna sytuacja rozprasza logikę dostępu do danych po wielu pakietach.

**Rozwiązanie (Dla Wykonawcy):**
1. Przy realizacji FIX-002, oprócz repozytoriów (mutacje), utwórz również dedykowane moduły query w `packages/core/src/queries/`:
   - `assistant-queries.ts`
   - `competitor-queries.ts`
   - `planning-queries.ts`
   - `topic-queries.ts`
   - `quality-queries.ts`
   - `pipeline-queries.ts`
   - `ml-queries.ts`
2. Przenieś do nich surowe zapytania SELECT z pakietów domenowych.
3. Każde query zwraca `Result<T, AppError>`.
4. W pakietach domenowych zastąp bezpośrednie `db.prepare(...).get()`/`.all()` wywołaniami query z `@moze/core`.

**Uwaga:** To zgłoszenie jest powiązane z FIX-002 i powinno być realizowane równolegle.

**Kryterium Akceptacji (Test):**
- [ ] Grep `db.prepare` w `packages/llm/`, `packages/analytics/`, `packages/data-pipeline/`, `packages/ml/` — zero wyników (zarówno SELECT jak i mutacje)
- [ ] Nowe moduły query posiadają testy
- [ ] Wszystkie testy przechodzą

---

## Kolejność realizacji

| Faza | Zgłoszenia | Uzasadnienie |
| ---- | ---------- | ------------ |
| 1    | FIX-003, FIX-004, FIX-005, FIX-006, FIX-007 | Szybkie do wdrożenia (zamiana stringów), eliminuje naruszenie reguły językowej |
| 2    | FIX-008, FIX-010, FIX-011, FIX-012 | Średnie ryzyko, izolowane zmiany |
| 3    | FIX-001, FIX-009 | Refaktoring dostępu do danych w warstwie desktop |
| 4    | FIX-002, FIX-013 | Największy zakres zmian — wymaga utworzenia ~7 nowych repozytoriów i ~7 modułów query w @moze/core |
