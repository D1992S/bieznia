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
