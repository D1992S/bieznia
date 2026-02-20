# FIX_PLAN.md - Audyt Architektury (wersja skorygowana)

> Data: 2026-02-17
> Zakres: porownanie kodu z AGENTS.md i docs/PLAN_REALIZACJI.md

---

## Podsumowanie

| Priorytet | Liczba |
| --- | --- |
| KRYTYCZNY | 2 |
| WYSOKI | 7 |
| SREDNI | 4 |
| RAZEM | 13 |

Uwagi do tej wersji:
- Poprawiono nazwy tabel/modulow do zgodnych z kodem.
- Poprawiono kryteria akceptacji, aby nie dawaly false-negative dla SQL wieloliniowego.
- Dodano bramke ADR dla duzego refaktoru (wymog z AGENTS.md).
- FIX-011 opisuje bezpieczenstwo/unikalnosc ID (a nie deterministycznosc).

---

## FIX-001 [KRYTYCZNY] Mutacja SQL w apps/desktop

Lokalizacja: `apps/desktop/src/runtime/desktop-main.ts` (funkcja `syncActiveProfileInDatabase`).

Problem:
- Bezposredni `UPDATE profiles` wykonywany w warstwie aplikacji.

Dzialania:
1. Dodac do `CoreRepository` metode `deactivateAllProfiles(): Result<void, AppError>`.
2. Uzyc jej w `desktop-main.ts` zamiast bezposredniego `db.prepare(...UPDATE...)`.
3. Zachowac propagacje `Result`.

Kryteria:
- [x] Brak SQL mutacji (`INSERT|UPDATE|DELETE`) w `apps/desktop/src/runtime/desktop-main.ts`.
- [x] `CoreRepository` eksportuje `deactivateAllProfiles`.
- [x] `pnpm --filter @moze/core test` i `pnpm --filter @moze/desktop test` przechodza.

---

## FIX-002 [KRYTYCZNY] Mutacje SQL poza @moze/core (pakiety domenowe)

Lokalizacje (8 plikow w 4 pakietach):
- `packages/llm/src/assistant-lite.ts` (`assistant_threads`, `assistant_messages`, `assistant_message_evidence`)
- `packages/analytics/src/competitor-intelligence.ts` (`dim_competitor`, `fact_competitor_day`)
- `packages/analytics/src/planning-system.ts` (`planning_plans`, `planning_recommendations`)
- `packages/analytics/src/topic-intelligence.ts` (`dim_topic_cluster`, `agg_topic_gaps`, `fact_topic_pressure_day`)
- `packages/analytics/src/quality-scoring.ts` (`agg_quality_scores`)
- `packages/data-pipeline/src/pipeline-runner.ts` (`stg_videos`, `stg_channels`, `ml_features`, `data_lineage`)
- `packages/ml/src/ml-baseline.ts` (`ml_models`, `ml_backtests`, `ml_predictions`)
- `packages/ml/src/anomaly-trend.ts` (`ml_anomalies`)

Problem:
- Mutacje wykonywane bezposrednio przez `db.prepare(...)` poza `@moze/core`.

Dzialania:
1. Dodac repozytoria mutacji w `packages/core/src/repositories/`:
   - `assistant-repository.ts`
   - `competitor-repository.ts`
   - `planning-repository.ts`
   - `topic-repository.ts`
   - `quality-repository.ts`
   - `pipeline-repository.ts`
   - `ml-repository.ts`
2. Kazde repo przyjmuje `Database.Database` i zwraca `Result<T, AppError>`.
3. Zastapic mutacje SQL w pakietach domenowych wywolaniami metod repozytoriow.
4. Wyeksportowac wszystko z `packages/core/src/index.ts`.

Kryteria:
- [x] W plikach domenowych nie ma bezposrednich mutacji SQL (`INSERT|UPDATE|DELETE`) przez `db.prepare`.
- [x] Nowe repozytoria maja testy (unit lub integration).
- [x] `pnpm test` przechodzi.

---

## FIX-003 [WYSOKI] Angielskie komunikaty w desktop-main.ts

Dzialania:
- Przetlumaczyc komunikaty `AppError.create()` widoczne dla uzytkownika na polski.
- Kody bledow (`APP_*`, `DB_*`) zostaja po angielsku.

Kryteria:
- [x] Komunikaty user-facing w tym pliku sa po polsku.
- [x] `pnpm --filter @moze/desktop test` przechodzi.

---

## FIX-004 [WYSOKI] Angielskie komunikaty w channel-queries.ts

Dzialania:
- Przetlumaczyc user-facing `AppError.message` na polski.

Kryteria:
- [x] Komunikaty sa po polsku.
- [x] `pnpm --filter @moze/core test` przechodzi.

---

## FIX-005 [WYSOKI] Angielskie komunikaty w metrics-queries.ts

Dzialania:
- Przetlumaczyc user-facing `AppError.message` na polski.

Kryteria:
- [x] Komunikaty sa po polsku.
- [x] `pnpm --filter @moze/core test` przechodzi.

---

## FIX-006 [WYSOKI] Angielskie komunikaty w report-service.ts

Dzialania:
- Przetlumaczyc user-facing `AppError.message` na polski.

Kryteria:
- [x] Komunikaty sa po polsku.
- [x] `pnpm --filter @moze/reports test` przechodzi.

---

## FIX-007 [WYSOKI] Angielskie komunikaty w planning-system.ts i topic-intelligence.ts

Dzialania:
- Przetlumaczyc wszystkie user-facing komunikaty tworzace `AppError` na polski.
- Nie zmieniac kodow bledow.

Kryteria:
- [x] Komunikaty sa po polsku.
- [x] `pnpm --filter @moze/analytics test` przechodzi.

---

## FIX-008 [WYSOKI] Nieuzasadnione casty `as` w UI

Lokalizacja: `apps/ui/src/features/studio/studio-app.tsx`.

Dzialania:
- Zastapic cast delimitera walidacja `CsvDelimiterSchema.safeParse(...)`.
- Zastapic cast mapowania walidacja `CsvImportColumnMappingDTOSchema.safeParse(...)`.

Kryteria:
- [x] Brak nieuzasadnionych castow `as` (poza `as const`) w tym obszarze.
- [x] `pnpm --filter @moze/ui test` i `pnpm --filter @moze/ui build` przechodza.

---

## FIX-009 [WYSOKI] SELECT SQL w warstwie desktop

Lokalizacja: `apps/desktop/src/runtime/desktop-main.ts`.

Dzialania:
1. Reuse istniejacych metod `CoreRepository` tam, gdzie pasuja (np. aktywny run).
2. Dla brakujacych odczytow dodac query module w `packages/core/src/queries/app-status-queries.ts`.
3. Usunac bezposrednie `db.prepare(...)` z desktop-main.

Kryteria:
- [x] Brak `db.prepare(...)` w `desktop-main.ts`.
- [x] Query module ma testy.
- [x] `pnpm --filter @moze/core test` i `pnpm --filter @moze/desktop test` przechodza.

---

## FIX-010 [SREDNI] Shadow DTO w UI

Lokalizacja: `apps/ui/src/hooks/dashboard/use-dashboard-data-core.ts`.

Dzialania:
- Usunac lokalne definicje CSV DTO.
- Importowac `CsvDelimiter`, `CsvImportPreviewInputDTO`, `CsvImportRunInputDTO` z `@moze/shared`.

Kryteria:
- [x] Brak lokalnych duplikatow CSV DTO w hooku.
- [x] `pnpm --filter @moze/ui build` przechodzi.

---

## FIX-011 [SREDNI] Slaby generator ID profilu

Lokalizacja: `apps/desktop/src/profile-manager.ts`.

Problem:
- `Math.random()` nie jest kryptograficznie bezpieczny.

Dzialania:
- Zastapic segment losowy przez `randomUUID().slice(0, 8).toUpperCase()`.

Kryteria:
- [x] Brak `Math.random` w tym pliku.
- [x] `pnpm --filter @moze/desktop test` przechodzi.

---

## FIX-012 [SREDNI] Duplikacja `formatNumber` i `formatDateTick`

Lokalizacje:
- `apps/ui/src/features/studio/studio-app.tsx`
- `apps/ui/src/components/studio-forecast-chart.tsx`

Dzialania:
- Dodac `apps/ui/src/lib/format-utils.ts` i przeniesc wspolne funkcje.

Kryteria:
- [x] Jedna definicja `formatNumber` i `formatDateTick` w UI.
- [x] `pnpm --filter @moze/ui build` przechodzi.

---

## FIX-013 [SREDNI] SELECT SQL poza @moze/core (pakiety domenowe)

Powiazane z FIX-002.

Dzialania:
1. Dodac query modules w `packages/core/src/queries/`:
   - `assistant-queries.ts`
   - `competitor-queries.ts`
   - `planning-queries.ts`
   - `topic-queries.ts`
   - `quality-queries.ts`
   - `pipeline-queries.ts`
   - `ml-queries.ts`
2. Przeniesc SELECT-y z pakietow domenowych do tych modulow.
3. Zastapic bezposrednie `.get()`/`.all()` w pakietach domenowych.

Kryteria:
- [x] W pakietach domenowych brak `db.prepare(...)` (mutacje i SELECT).
- [x] Query modules maja testy.
- [x] `pnpm test` przechodzi.

---

## Kolejnosc realizacji

Faza 0 (gate):
- [x] ADR dla duzego refaktoru FIX-002/FIX-013 + scope freeze.

Faza 1 (szybkie i niskie ryzyko):
- [x] FIX-003, FIX-004, FIX-005, FIX-006, FIX-007

Faza 2 (UI + profil):
- [x] FIX-008, FIX-010, FIX-011, FIX-012

Faza 3 (desktop data-access):
- [x] FIX-001, FIX-009

Faza 4 (duzy refaktor SQL):
- [x] FIX-002, FIX-013

Uwagi wykonawcze:
- Nie robic duzego refaktoru bez ADR (AGENTS.md).
- Po kazdej fazie uruchamiac testy pakietowe.
- Na koniec: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
