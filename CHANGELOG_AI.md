# CHANGELOG_AI

Dziennik zmian wykonywanych przez modele AI.

## Template wpisu

- Data:
- Autor (model):
- Zakres plików:
- Co zmieniono:
- Dlaczego:
- Ryzyko/regresja:
- Jak zweryfikowano:
- Następny krok:

## 2026-02-12

- Data: 2026-02-12
- Autor (model): GPT-5.2-Codex
- Zakres plików: `docs/PLAN_REALIZACJI.md`, `README.md`, `CHANGELOG_AI.md`
- Co zmieniono: Dodano formalną sekcję 3.3 z obowiązkowym logowaniem zmian dla PR/commit oraz doprecyzowano to w README.
- Dlaczego: Użytkownik chciał jednoznacznego wymogu, aby każda ingerencja była opisana tak, by inny model mógł bazować na historii zmian.
- Ryzyko/regresja: Brak ryzyka runtime (zmiany wyłącznie w dokumentacji).
- Jak zweryfikowano: Sprawdzenie diff i odczyt plików.
- Następny krok: Wymusić template PR i checklistę w repo (np. `.github/pull_request_template.md`).

## 2026-02-12 (v2)

- Data: 2026-02-12
- Autor (model): Claude Opus 4.6
- Zakres plików: `docs/PLAN_REALIZACJI.md`, `AGENTS.md`, `docs/architecture/overview.md`, `docs/architecture/data-flow.md`, `README.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Gruntowna przebudowa PLAN_REALIZACJI.md (496 → 834 linii):
    - Dodano 2 nowe zasady: Performance budgets (#7) i Data quality first (#8).
    - Dodano sekcję 4: Architektura danych (model warstwowy RAW→STAGING→DIM/FACT→ANALYTICS→ML, pipeline ETL, feature engineering, strategia brakujących danych).
    - Zreorganizowano kolejność faz: ML Framework przesunięty z Fazy 10 do Fazy 6.
    - Dodano nową Fazę 4 (Data Pipeline + Feature Engineering) i Fazę 10 (Anomaly Detection + Trend Analysis).
    - Rozszerzono fazy ML o konkretne algorytmy (Holt-Winters, ARIMA, LightGBM roadmap), confidence intervals, shadow mode, graceful degradation.
    - Usprawniono Quality Scoring: percentile rank zamiast sigmoid, confidence levels, szczegółowe formuły.
    - Dodano nowe pakiety: data-pipeline, analytics, top-level fixtures.
    - Dodano UI stack: Zustand + TanStack Query.
    - Dodano sekcje: Risk Register, Milestone'y, mierzalne KPI targets.
  - Stworzono AGENTS.md: pełne zasady modyfikacji kodu, graf zależności, konwencje, rytuał zakończenia sesji.
  - Stworzono docs/architecture/overview.md: diagram modułów, dependency graph, wzorce (IPC, data flow, error handling, state management).
  - Stworzono docs/architecture/data-flow.md: szczegółowy pipeline 7-etapowy, feature engineering formulas, data lineage schema.
  - Zaktualizowano README.md: opis projektu, tabela dokumentów, stack technologiczny.
- Dlaczego: Oryginalny plan miał krytyczne braki: brak data pipeline, ML za późno (Faza 10/18), brak feature engineering, brak strategii state management, brak performance budgets, za płytkie ML (brak konkretnych algorytmów), brak anomaly detection, brak obsługi brakujących danych.
- Ryzyko/regresja: Brak (zmiany tylko w dokumentacji, zero kodu).
- Jak zweryfikowano: Review struktury dokumentów, spójność między PLAN_REALIZACJI ↔ AGENTS.md ↔ overview.md ↔ data-flow.md.
- Następny krok: Rozpocząć implementację Fazy 0 (Foundation) — monorepo setup, TS strict, shared package, Electron shell.

## 2026-02-12 (v3)

- Data: 2026-02-12
- Autor (model): Claude Opus 4.6
- Zakres plików:
  - `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc.json`, `.gitignore`
  - `eslint.config.js`, `vitest.config.ts`
  - `packages/shared/` (package.json, tsconfig.json, src/index.ts, src/types/result.ts, src/errors/app-error.ts, src/ipc/contracts.ts, src/events/index.ts, src/dto/index.ts)
  - `packages/shared/src/types/result.test.ts`, `packages/shared/src/errors/app-error.test.ts`, `packages/shared/src/ipc/contracts.test.ts`
  - `packages/{core,data-pipeline,sync,reports,llm,ml,analytics,plugins,diagnostics}/` (package.json, tsconfig.json, src/index.ts)
  - `apps/desktop/` (package.json, tsconfig.json, src/main.ts, src/preload.ts)
  - `apps/ui/` (package.json, tsconfig.json, index.html, vite.config.ts, src/main.tsx, src/App.tsx, src/store/index.ts, src/env.d.ts)
- Co zmieniono:
  - Kompletna implementacja Fazy 0 (Foundation):
    - Monorepo pnpm workspaces z 10 pakietami + 2 aplikacjami.
    - TypeScript 5.9 strict (noUncheckedIndexedAccess, verbatimModuleSyntax).
    - ESLint 9 flat config z typescript-eslint strictTypeChecked.
    - Prettier config.
    - Vitest 4 setup (unit tests).
    - Pakiet `shared`: Result<T,E> type, AppError class z factory methods i serializacją, IPC contracts (4 komendy + 3 eventy), Zod 4 schemas, DTO types.
    - Electron shell z security hardening (contextIsolation, sandbox, no nodeIntegration, single instance lock).
    - Preload bridge z channel allowlisting.
    - React 19 + Zustand 5 + TanStack Query 5 app skeleton.
    - Vite 6 build config.
    - 26 testów unit (Result type, AppError, IPC contracts validation).
    - Wszystkie pakiety z poprawnymi workspace dependencies wg grafu zależności z AGENTS.md.
- Dlaczego: Faza 0 jest fundamentem — bez niej żaden kolejny moduł nie może być implementowany. Daje działający szkielet z toolingiem, typami i architekturą.
- Ryzyko/regresja:
  - Zod 4 (nie 3) — API zmieniło się (z.iso.date() zamiast z.string().date()). Kolejne AI muszą używać Zod 4 API.
  - ESLint 9 (nie 10) — typescript-eslint nie wspiera jeszcze ESLint 10.
  - Brak composite TS project references — używamy prostego noEmit + bundler resolution. Wystarczające dla typechecku, ale gdyby ktoś chciał tsc build, trzeba będzie to zmienić.
- Jak zweryfikowano:
  - `pnpm lint` — 0 errors.
  - `pnpm typecheck` — 12/12 pakietów pass.
  - `pnpm test` — 26/26 testów pass.
- Następny krok: Faza 1 (Data Core) — SQLite setup z better-sqlite3, system migracji, tabele RAW/STAGING/DIM/FACT, warstwa query/mutation w pakiecie `core`.

## 2026-02-12 (v4)

- Data: 2026-02-12
- Autor (model): Claude Opus 4.6
- Zakres plików: `AGENTS.md`, `docs/PLAN_REALIZACJI.md`, `apps/ui/src/App.tsx`, `apps/desktop/src/preload.ts`, `packages/shared/src/types/result.ts`, `packages/shared/src/types/result.test.ts`, `package.json`
- Co zmieniono:
  - Dodano zasadę #9 w PLAN_REALIZACJI.md: **Język aplikacji — POLSKI**.
  - Dodano sekcję „Język aplikacji — POLSKI" w AGENTS.md z jasnymi regułami: UI po polsku, komendy błędów widoczne w UI po polsku, kod/zmienne po angielsku, komentarze po angielsku.
  - Przetłumaczono wszystkie user-facing stringi: App.tsx, preload.ts error messages, Result unwrap message.
  - Zaktualizowano description w root package.json.
  - Zaktualizowano test oczekujący polskiego komunikatu błędu.
- Dlaczego: Wymaganie użytkownika — cała aplikacja ma być po polsku. Musi być jawnie zapisane jako zasada, żeby kolejne AI nie dodawały angielskich stringów.
- Ryzyko/regresja: Brak (zmiany w stringach + docs, istniejące testy zaktualizowane).
- Jak zweryfikowano:
  - `pnpm lint` — 0 errors.
  - `pnpm typecheck` — 12/12 pass.
  - `pnpm test` — 26/26 pass.
- Następny krok: Faza 1 (Data Core) — SQLite setup z better-sqlite3, system migracji, tabele RAW/STAGING/DIM/FACT, warstwa query/mutation w pakiecie `core`. Pamiętaj: wszelkie user-facing komunikaty po polsku.

## 2026-02-12 (v5)

- Data: 2026-02-12
- Autor (model): Claude Opus 4.6
- Zakres plików: `NEXT_STEP.md` (nowy), `AGENTS.md`, `README.md`, `docs/PLAN_REALIZACJI.md`
- Co zmieniono:
  - Stworzono `NEXT_STEP.md` — dedykowany plik handoff dla kolejnego AI. Zawiera: aktualny status, co dokładnie robić w następnej fazie, pliki do stworzenia, DoD, krytyczne zasady.
  - Zaktualizowano AGENTS.md:
    - `NEXT_STEP.md` jako punkt #1 w „Przed rozpoczęciem pracy".
    - Rozbudowano rytuał zakończenia sesji o obowiązkową aktualizację NEXT_STEP.md, README.md (tabela postępu), PLAN_REALIZACJI.md (checklista).
  - Dodano tabelę „Postęp realizacji" w README.md — widać od razu które fazy są DONE.
  - Odhaczono ukończone pozycje w checkliście startowej (sekcja 14 planu).
- Dlaczego: Kolejne AI muszą wiedzieć dokładnie co robić bez czytania całego repo. NEXT_STEP.md to single point of truth. Tabela w README daje szybki przegląd statusu.
- Ryzyko/regresja: Brak (zmiany dokumentacyjne).
- Jak zweryfikowano: Review plików, spójność między NEXT_STEP.md ↔ CHANGELOG_AI ↔ README ↔ PLAN_REALIZACJI.
- Następny krok: Faza 1 (Data Core) — patrz `NEXT_STEP.md`.

## 2026-02-12 (v6)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików:
  - `package.json`
  - `scripts/dev-desktop.mjs`
  - `apps/desktop/package.json`, `apps/desktop/tsconfig.build.json`, `apps/desktop/src/main.ts`
  - `packages/shared/src/logger/index.ts`, `packages/shared/src/logger/index.test.ts`, `packages/shared/src/index.ts`
  - `.github/workflows/ci.yml`
  - `docs/PLAN_REALIZACJI.md`, `README.md`, `NEXT_STEP.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Domknięto brakujące elementy Fazy 0 bez wchodzenia w kolejne fazy.
  - Dopracowano uruchamianie desktopa:
    - `@moze/desktop` buduje runtime JS do `dist` (`tsconfig.build.json`, `build` script),
    - `pnpm dev` uruchamia UI i Electron przez nowy skrypt `scripts/dev-desktop.mjs`,
    - naprawiono ścieżkę produkcyjną renderer (`apps/ui/dist/index.html`) i focus dla single-instance.
  - Dodano foundation logger w `shared` (`createLogger`, structured JSON, severity levels, context) + testy.
  - Dodano CI GitHub Actions: `lint`, `typecheck`, `test`, `build`.
  - Uaktualniono checklistę planu i README/NEXT_STEP pod nowy stan Fazy 0.
- Dlaczego:
  - Poprzednia implementacja miała luki względem DoD Fazy 0 (brak CI, niespójny desktop build/dev, brak loggera).
- Ryzyko/regresja:
  - Desktop `dev` robi jednorazowy build runtime przed startem Electron (bez auto-rebuild watch).
  - Lokalne uruchomienie nadal wymaga środowiska zgodnego z `node >= 22`.
- Jak zweryfikowano:
  - `pnpm install` (workspace install zakończony powodzeniem; ostrzeżenie engines: Node 20 vs wymagane 22).
  - `pnpm lint` — PASS.
  - `pnpm typecheck` — PASS (wszystkie pakiety).
  - `pnpm test` — PASS (4 pliki testowe, 29 testów).
  - `pnpm build` — PASS (w tym `apps/desktop` z `tsconfig.build.json` i `apps/ui` build Vite).
  - Smoke-check artefaktów runtime: `apps/desktop/dist/main.js`, `apps/desktop/dist/preload.js`, `apps/ui/dist/index.html` istnieją.
- Następny krok:
  - Rozpocząć Fazę 1 (Data Core) zgodnie z `NEXT_STEP.md`.

## 2026-02-12 (v7)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików: `README.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Rozszerzono tabelę „Postęp realizacji” w `README.md` o kolumnę:
    - **„Co powinno działać (prosty opis)”**.
  - Dla każdej fazy (0–19) dodano zrozumiały, nietechniczny opis efektu dla użytkownika.
- Dlaczego:
  - Użytkownik chciał, aby na stronie repo (GitHub) było od razu jasne dla laika, co oznacza każdy etap i czego można się spodziewać po aplikacji.
- Ryzyko/regresja:
  - Brak ryzyka runtime (zmiana wyłącznie dokumentacyjna).
- Jak zweryfikowano:
  - Odczyt `README.md` po zmianie i kontrola, że każda faza ma opis w prostym języku.
- Następny krok:
  - Kontynuować Fazę 1 (Data Core) zgodnie z `NEXT_STEP.md`.

## 2026-02-12 (v8)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików: `scripts/dev-desktop.mjs`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Naprawiono uruchamianie `pnpm dev` na Windows:
    - dodano `shell: true` przy `spawn` dla procesu `pnpm`,
    - ujednolicono adres dev servera na `http://localhost:5173`.
- Dlaczego:
  - `pnpm dev` kończyło się błędem `spawn EINVAL` i miało potencjalny rozjazd adresów (`127.0.0.1` vs `::1`).
- Ryzyko/regresja:
  - Niskie; zmiana dotyczy tylko lokalnego skryptu developerskiego.
- Jak zweryfikowano:
  - `pnpm dev` startuje poprawnie (UI + Electron).
  - `http://localhost:5173` zwraca poprawny HTML.
- Następny krok:
  - Kontynuować Fazę 1 (Data Core) zgodnie z `NEXT_STEP.md`.

## 2026-02-12 (v9)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików:
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/database.ts`
  - `packages/core/src/migrations/types.ts`
  - `packages/core/src/migrations/001-initial-schema.ts`
  - `packages/core/src/migrations/index.ts`
  - `packages/core/src/repositories/types.ts`
  - `packages/core/src/repositories/core-repository.ts`
  - `packages/core/src/repositories/index.ts`
  - `packages/core/src/queries/metrics-queries.ts`
  - `packages/core/src/queries/index.ts`
  - `packages/core/src/fixtures/types.ts`
  - `packages/core/src/fixtures/index.ts`
  - `packages/core/src/data-core.integration.test.ts`
  - `fixtures/seed-data.json`
  - `pnpm-workspace.yaml`
  - `pnpm-lock.yaml`
  - `README.md`
  - `docs/PLAN_REALIZACJI.md`
  - `NEXT_STEP.md`
  - `CHANGELOG_AI.md`
- Co zmieniono:
  - Zaimplementowano Fazę 1 (Data Core) w `packages/core`:
    - SQLite connection manager (`better-sqlite3`) z `Result<T, AppError>`.
    - System migracji forward-only z trackingiem (`schema_migrations`) i migracją `001-initial-schema`.
    - Tabele warstw: RAW/Operational/Dimension/Fact zgodnie z planem fazy.
    - Typed repository/mutation layer (upserts + operacje sync/raw).
    - Query layer: `getKpis()` i `getTimeseries()` z deterministycznym `ORDER BY`.
    - Moduł fixture: odczyt `fixtures/seed-data.json` oraz seedowanie bazy.
  - Dodano integracyjne testy DB (in-memory SQLite):
    - idempotentność migracji,
    - seed fixture i odczyt KPI/timeseries.
  - Dodano realistyczny fixture: 90 dni danych, 1 kanał, 50 filmów.
  - Uzupełniono `pnpm-workspace.yaml` o `better-sqlite3` w `onlyBuiltDependencies`, aby build native działał lokalnie/CI.
  - Zaktualizowano statusy dokumentacji: Faza 1 = DONE, Faza 2 = następna.
- Dlaczego:
  - Celem było domknięcie Fazy 1 zgodnie z DoD i przygotowanie stabilnej warstwy danych pod IPC/backend w Fazie 2.
- Ryzyko/regresja:
  - `better-sqlite3` jest natywnym modułem i wymaga build/prebuild dla lokalnego środowiska.
  - Lokalnie nadal jest ostrzeżenie engines (`node >=22` wymagane, aktualnie `20.x`), ale walidacja projektu przechodzi.
- Jak zweryfikowano:
  - `pnpm install --force` (w tym build `better-sqlite3`).
  - `pnpm lint` — PASS.
  - `pnpm typecheck` — PASS.
  - `pnpm test` — PASS (`31/31`, w tym testy integracyjne Data Core).
  - `pnpm build` — PASS.
- Następny krok:
  - Faza 2: Desktop Backend + IPC (podłączenie `core` do `apps/desktop`, handlery IPC, adapter UI przez TanStack Query).

## 2026-02-12 (v10)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików:
  - `docs/PLAN_REALIZACJI.md`
  - `NEXT_STEP.md`
  - `README.md`
  - `CHANGELOG_AI.md`
- Co zmieniono:
  - Uspójniono dokumentację statusu po Fazie 1:
    - doprecyzowano, że `perf_events` nie wchodziło do zakresu Fazy 1 (pozostaje w Fazie 18),
    - w checklistcie planu rozdzielono "fixture data" od "fake mode", aby odzwierciedlić aktualny stan repo,
    - ujednolicono status Fazy 2 na `NASTĘPNA` w `NEXT_STEP.md`,
    - ujednolicono komendy regresji (`lint + typecheck + test + build`) w `NEXT_STEP.md`,
    - doprecyzowano komunikat statusu w `README.md`.
- Dlaczego:
  - W dokumentacji były niespójności między planem faz a faktycznie zaimplementowanym schema/data core.
- Ryzyko/regresja:
  - Brak ryzyka runtime (zmiany wyłącznie dokumentacyjne).
- Jak zweryfikowano:
  - Manualny przegląd spójności `README.md` ↔ `NEXT_STEP.md` ↔ `docs/PLAN_REALIZACJI.md`.
  - Potwierdzono brak rozjazdu z aktualnym kodem `packages/core`.
- Następny krok:
  - Implementacja Fazy 2: inicjalizacja DB i handlery IPC w `apps/desktop`, następnie adaptery zapytań IPC po stronie `apps/ui`.

## 2026-02-12 (v11)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plików:
  - `packages/shared/src/ipc/contracts.ts`, `packages/shared/src/index.ts`
  - `packages/core/src/queries/channel-queries.ts`, `packages/core/src/queries/index.ts`, `packages/core/src/index.ts`
  - `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc-handlers.ts`, `apps/desktop/src/ipc-handlers.integration.test.ts`
  - `apps/desktop/package.json`, `apps/desktop/scripts/build-desktop.mjs`
  - `apps/ui/src/env.d.ts`, `apps/ui/src/App.tsx`, `apps/ui/src/store/index.ts`
  - `apps/ui/src/lib/electron-api.types.ts`, `apps/ui/src/lib/electron-api.ts`, `apps/ui/src/hooks/use-dashboard-data.ts`
  - `README.md`, `NEXT_STEP.md`, `docs/PLAN_REALIZACJI.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Zaimplementowano Fazę 2 (Desktop Backend + IPC) end-to-end:
    - inicjalizacja DB + migracje w `apps/desktop` przy starcie app,
    - IPC handlery dla `app:getStatus`, `db:getKpis`, `db:getTimeseries`, `db:getChannelInfo`,
    - walidacja kontraktów Zod po obu stronach granicy IPC (main + preload),
    - serializacja błędów jako `AppError` bez crashy procesu.
  - Dodano realny `app:getStatus` oparty o stan DB (aktywny profil, sync status, last sync).
  - Dodano query `getChannelInfo()` w `@moze/core` i stabilne eksporty w `core/index`.
  - UI pobiera status/KPI/timeseries/channel info wyłącznie przez `window.electronAPI` + hooki TanStack Query.
  - Dodano testy integracyjne IPC: happy path, invalid payload, core error.
  - Usprawniono build desktop runtime:
    - przejście z `tsc` emit na bundling `esbuild`,
    - umożliwia runtime użycie `@moze/core`/`@moze/shared` (workspace TS sources).
  - Zaktualizowano status dokumentacji: Faza 2 = DONE, Faza 3 = NASTĘPNA.
- Dlaczego:
  - Celem było domknięcie M1 i uruchomienie bezpiecznego, typowanego mostu UI ↔ backend na działającym Data Core.
- Ryzyko/regresja:
  - Desktop build opiera się teraz o bundling `esbuild` (inny pipeline niż wcześniej).
  - W środowisku lokalnym nadal widoczny warning engines (Node 20 vs wymagane >=22).
- Jak zweryfikowano:
  - `pnpm lint` — PASS.
  - `pnpm typecheck` — PASS.
  - `pnpm test` — PASS (34/34, w tym IPC integration tests).
  - `pnpm build` — PASS (w tym `apps/desktop` przez `esbuild`).
- Następny krok:
  - Faza 3: Data Modes + Fixtures (fake/real/record mode, provider interface, cache TTL, rate limiter, runtime toggle).

## 2026-02-12 (v12)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plikow:
  - `packages/shared/src/ipc/contracts.ts`, `packages/shared/src/ipc/contracts.test.ts`, `packages/shared/src/dto/index.ts`, `packages/shared/src/index.ts`
  - `packages/data-pipeline/src/provider-fixture.ts`, `packages/data-pipeline/src/index.ts`
  - `packages/sync/src/data-provider.ts`, `packages/sync/src/fake-provider.ts`, `packages/sync/src/real-provider.ts`, `packages/sync/src/record-provider.ts`, `packages/sync/src/cache-provider.ts`, `packages/sync/src/rate-limiter.ts`, `packages/sync/src/data-mode-manager.ts`, `packages/sync/src/data-modes.integration.test.ts`, `packages/sync/src/index.ts`
  - `apps/desktop/src/main.ts`, `apps/desktop/src/ipc-handlers.ts`, `apps/desktop/src/ipc-handlers.integration.test.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/package.json`
  - `apps/ui/src/lib/electron-api.types.ts`, `apps/ui/src/lib/electron-api.ts`, `apps/ui/src/hooks/use-dashboard-data.ts`, `apps/ui/src/App.tsx`
  - `README.md`, `NEXT_STEP.md`, `docs/PLAN_REALIZACJI.md`, `CHANGELOG_AI.md`
  - `pnpm-lock.yaml`
- Co zmieniono:
  - Domknieto Faze 3 (Data Modes + Fixtures) end-to-end.
  - Dodano kontrakty IPC i DTO dla trybow danych:
    - `app:getDataMode`, `app:setDataMode`, `app:probeDataMode`.
  - Dodano warstwe fixture provider w `data-pipeline` (load/save provider fixture + fallback do seed fixture).
  - Dodano pelny stack `sync`:
    - interfejs `DataProvider`,
    - provider `fake`,
    - provider `real` (adapter/fixture fallback),
    - provider `record` (zapis replayowalnych fixture),
    - cache TTL per endpoint,
    - rate limiter token bucket,
    - `DataModeManager` (runtime toggle + probe).
  - Podlaczono tryby danych do desktop runtime:
    - inicjalizacja managera w `main.ts`,
    - env override (`MOZE_DATA_MODE`, `MOZE_FAKE_FIXTURE_PATH`, `MOZE_REAL_FIXTURE_PATH`, `MOZE_RECORDING_OUTPUT_PATH`),
    - nowe handlery IPC w `ipc-handlers.ts` i walidacja preload.
  - UI rozszerzone o sekcje "Tryb danych (Faza 3)" + mutacje/query przez TanStack Query.
  - Dodano testy integracyjne:
    - `packages/sync/src/data-modes.integration.test.ts`,
    - rozszerzenie `apps/desktop/src/ipc-handlers.integration.test.ts`.
  - Domknieto poprawki jakosciowe po implementacji:
    - fix lint dla `App.tsx` (`no-confusing-void-expression`),
    - fix typing cache provider (`TS2322`, usuniecie zbednych generykow),
    - usuniecie non-null assertions w real provider.
  - Uaktualniono dokumentacje statusu:
    - Faza 3 = DONE,
    - Faza 4 = NASTEPNA.
- Dlaczego:
  - Celem bylo wdrozenie szybkich i powtarzalnych trybow pracy na danych (fake/real/record) bez zmiany kontraktu po stronie UI oraz przygotowanie fundamentu pod Faze 4/5.
- Ryzyko/regresja:
  - `real` provider jest na razie spiety przez fixture/adapter contract (brak jeszcze produkcyjnego adaptera YouTube API).
  - Lokalnie pozostaje ostrzezenie engines (`node >=22`, aktualnie `20.x`), mimo ze checki przechodza.
- Jak zweryfikowano:
  - `pnpm lint` - PASS.
  - `pnpm typecheck` - PASS.
  - `pnpm test` - PASS (`43/43`, w tym nowe integracje sync i IPC data mode).
  - `pnpm build` - PASS.
- Nastepny krok:
  - Faza 4: Data Pipeline + Feature Engineering (ETL orchestration, validation, staging, feature generation, data lineage).

## 2026-02-12 (v13)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plikow:
  - `README.md`
  - `NEXT_STEP.md`
  - `docs/PLAN_REALIZACJI.md`
  - `docs/architecture/overview.md`
  - `CHANGELOG_AI.md`
- Co zmieniono:
  - Usunieto z planu produktu elementy niepotrzebne w trybie single-user:
    - plugin runtime (Faza 17 -> SKIP w trybie solo),
    - packaging pod dystrybucje (usuniete z Fazy 19),
    - telemetry opt-in (usuniete z Fazy 19).
  - Zaktualizowano roadmape i opisy faz:
    - README: Faza 17 oznaczona jako `SKIP (solo)`, Faza 19 zmieniona na lokalne dopracowanie UX bez dystrybucji.
    - NEXT_STEP: mapa faz zaktualizowana o `SKIP (solo)` dla pluginow oraz `bez packaging/telemetry` dla Fazy 19.
    - PLAN_REALIZACJI: przebudowano opisy Fazy 17 i 19, zaktualizowano Milestone 6 pod scope solo.
    - architecture/overview: doprecyzowano, ze warstwa plugins jest out-of-scope w trybie solo.
- Dlaczego:
  - Aplikacja bedzie uzywana przez jednego uzytkownika, bez potrzeby dystrybucji, telemetry i plugin architecture.
- Ryzyko/regresja:
  - Brak ryzyka runtime (zmiany dokumentacyjne).
  - Mniejsza rozszerzalnosc w przyszlosci: ewentualny powrot do plugin runtime i packagingu bedzie wymagac osobnego planu.
- Jak zweryfikowano:
  - Przeglad diffow dokumentacji i spojnosc opisow miedzy README, NEXT_STEP, PLAN_REALIZACJI i architecture/overview.
- Nastepny krok:
  - Kontynuowac Faze 4 wedlug nowego scope solo.

## 2026-02-12 (v14)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plikow:
  - `packages/core/src/migrations/002-data-pipeline-schema.ts`
  - `packages/core/src/migrations/index.ts`
  - `packages/core/src/data-core.integration.test.ts`
  - `packages/data-pipeline/src/pipeline-runner.ts`
  - `packages/data-pipeline/src/pipeline-runner.integration.test.ts`
  - `packages/data-pipeline/src/index.ts`
  - `NEXT_STEP.md`
  - `README.md`
  - `docs/PLAN_REALIZACJI.md`
  - `docs/architecture/data-flow.md`
  - `CHANGELOG_AI.md`
- Co zmieniono:
  - Zaimplementowano Faze 4 (Data Pipeline + Feature Engineering) bez wychodzenia poza zakres faz 1-4.
  - Dodano migracje `002-data-pipeline-schema` tworząca tabele:
    - `stg_channels`
    - `stg_videos`
    - `ml_features`
    - `data_lineage`
  - Dodano runner ETL `runDataPipeline()` w `data-pipeline`:
    - ingestion z `dim_channel`/`dim_video`/`fact_channel_day`,
    - validation (schema + range + freshness),
    - staging do `stg_*`,
    - feature generation do `ml_features`,
    - zapis lineage dla etapow `ingest`, `validation`, `staging`, `feature-generation`.
  - Dodano testy integracyjne pipeline:
    - end-to-end na `fixtures/seed-data.json`,
    - deterministycznosc kolejnych uruchomien,
    - reject dla niepoprawnego range,
    - reject dla stale data.
  - Zaktualizowano dokumentacje statusu:
    - Faza 4 = DONE,
    - Faza 5 = NASTEPNA,
    - data-flow dopasowany do faktycznie zaimplementowanego schematu lineage/staging.
- Dlaczego:
  - Celem bylo domkniecie Fazy 4 i przygotowanie technicznego punktu pod post-sync pipeline z Fazy 5.
- Ryzyko/regresja:
  - Runner pipeline aktualnie operuje na jednym `channelId` na uruchomienie.
  - Integracja automatycznego wywolania po sync pozostaje na Fazę 5 (celowo).
- Jak zweryfikowano:
  - `pnpm lint` - PASS.
  - `pnpm typecheck` - PASS.
  - `pnpm test` - PASS (`47/47`, w tym nowe testy integracyjne data-pipeline).
  - `pnpm build` - PASS.
- Nastepny krok:
  - Faza 5: Sync Orchestrator (checkpointy, retry/backoff, mutex, eventy progress i wywolanie `runDataPipeline()` po sync).

## 2026-02-12 (v15)

- Data: 2026-02-12
- Autor (model): GPT-5 Codex
- Zakres plikow:
  - `packages/shared/src/ipc/contracts.ts`, `packages/shared/src/ipc/contracts.test.ts`, `packages/shared/src/dto/index.ts`, `packages/shared/src/index.ts`
  - `packages/core/src/repositories/types.ts`, `packages/core/src/repositories/core-repository.ts`, `packages/core/src/repositories/index.ts`, `packages/core/src/index.ts`
  - `packages/sync/src/data-mode-manager.ts`, `packages/sync/src/sync-orchestrator.ts`, `packages/sync/src/sync-orchestrator.integration.test.ts`, `packages/sync/src/index.ts`
  - `apps/desktop/src/ipc-handlers.ts`, `apps/desktop/src/ipc-handlers.integration.test.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/main.ts`
  - `apps/ui/src/lib/electron-api.types.ts`, `apps/ui/src/lib/electron-api.ts`, `apps/ui/src/hooks/use-dashboard-data.ts`, `apps/ui/src/App.tsx`
  - `README.md`, `NEXT_STEP.md`, `docs/PLAN_REALIZACJI.md`, `docs/architecture/data-flow.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Domknieto Faze 5 (Sync Orchestrator) end-to-end.
  - Dodano komendy IPC:
    - `sync:start`
    - `sync:resume`
    - DTO wyniku komendy sync.
  - Rozszerzono `core` repository dla `sync_runs`:
    - checkpoint update,
    - resume run (reset finished/error),
    - odczyt run po ID,
    - odczyt najnowszego aktywnego run.
  - Zaimplementowano `createSyncOrchestrator()`:
    - stage machine (`collect-provider-data` -> `persist-warehouse` -> `run-pipeline` -> `completed`),
    - checkpointy w `sync_runs` + resume,
    - mutex blokujacy rownolegly sync,
    - retry/backoff dla bledow providera,
    - zapis do `raw_api_responses` i warehouse tables,
    - automatyczne `runDataPipeline()` po sync.
  - Podlaczono orchestrator do Electron main i eventow:
    - `sync:progress`, `sync:complete`, `sync:error`.
  - UI rozszerzone o sekcje Fazy 5:
    - uruchamianie sync,
    - wznowienie ostatniego nieudanego sync,
    - podglad postepu/bledu/zakonczenia.
  - Dodano testy integracyjne orchestratora:
    - happy path,
    - blokada rownoleglego uruchomienia,
    - fail na pipeline + resume z checkpointu `run-pipeline`.
  - Zaktualizowano dokumentacje statusu:
    - Faza 5 = DONE,
    - Faza 6 = NASTEPNA.
- Dlaczego:
  - Celem bylo zamkniecie warstwy resilient sync i spiecie jej z pipeline danych, aby M2 mial kompletny przeplyw sync -> ETL -> features.
- Ryzyko/regresja:
  - Retry/backoff w orchestratorze obejmuje klasy bledow providers zdefiniowane kodami (`SYNC_PROVIDER_*`, `SYNC_RATE_LIMIT_EXCEEDED`).
  - Resume wymaga jawnego `channelId` w komendzie `sync:resume` (celowo, zeby uniknac ukrytego stanu procesu).
  - Lokalnie nadal widoczny warning engines (`node >=22`, aktualnie `20.x`), mimo ze checki przechodza.
- Jak zweryfikowano:
  - `pnpm lint` - PASS.
  - `pnpm typecheck` - PASS.
  - `pnpm test` - PASS (`53/53`, w tym nowe testy sync orchestratora).
  - `pnpm build` - PASS.
- Nastepny krok:
  - Faza 6: Bazowy ML Framework (registry modeli, baseline trening, backtesting i quality gate).
