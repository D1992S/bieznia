# Następny krok — PRZECZYTAJ NAJPIERW

> **Ten plik mówi Ci co robić.** Aktualizuj go na końcu każdej sesji.

## Aktualny status

| Faza | Nazwa | Status |
|------|-------|--------|
| 0 | Foundation | DONE |
| 1 | Data Core | **DO ZROBIENIA** |
| 2 | Desktop Backend + IPC | Oczekuje |
| 3–19 | Reszta | Oczekuje |

## Co zostało zrobione (Faza 0)

- Monorepo pnpm workspaces: 10 pakietów + 2 aplikacje.
- TypeScript 5.9 strict, ESLint 9, Prettier, Vitest 4.
- Pakiet `shared`: `Result<T,E>`, `AppError`, IPC kontrakty (4 komendy + 3 eventy), Zod 4 schemas.
- Electron shell z security hardening (contextIsolation, sandbox).
- React 19 + Zustand 5 + TanStack Query 5 skeleton.
- 26 testów unit — wszystkie pass.
- `pnpm lint && pnpm typecheck && pnpm test` — 0 errors.

## Co robić teraz — Faza 1: Data Core

**Cel:** Stabilny fundament danych z warstwowym modelem.

**Zakres:**
1. Zainstaluj `better-sqlite3` + `@types/better-sqlite3` w `packages/core`.
2. Stwórz system migracji (forward-only, numbered, idempotent).
3. Stwórz tabele:
   - **RAW**: `raw_api_responses` (JSON blob + metadata).
   - **Operational**: `profiles`, `app_meta`, `sync_runs`.
   - **Dimension**: `dim_channel`, `dim_video`.
   - **Fact**: `fact_channel_day`, `fact_video_day`.
4. Stwórz mutation layer (typed repository pattern — nie raw SQL w logice).
5. Stwórz query layer: `getKpis()`, `getTimeseries()`, typed upserts.
6. Seed fixtures: realistyczne dane 90 dni, 1 kanał, 50 filmów.
7. Testy integracyjne DB (in-memory SQLite).

**Definition of Done (Faza 1):**
- [ ] Testy integracyjne DB przechodzą (in-memory SQLite).
- [ ] Fixture zapisuje się i odczytuje poprawnie.
- [ ] Migracje są idempotentne (podwójne uruchomienie = brak błędu).
- [ ] Query results deterministyczne (jawne ORDER BY wszędzie).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` — 0 errors.
- [ ] Wpis w `CHANGELOG_AI.md`.
- [ ] Aktualizacja tego pliku (`NEXT_STEP.md`).

**Pliki do modyfikacji/stworzenia:**
```
packages/core/src/index.ts          — eksporty
packages/core/src/database.ts       — SQLite connection manager
packages/core/src/migrations/       — system migracji
packages/core/src/migrations/001-initial-schema.ts
packages/core/src/repositories/     — typed repository pattern
packages/core/src/queries/          — query layer
fixtures/seed-data.json             — 90-dniowe dane testowe
```

**Szczegóły:** `docs/PLAN_REALIZACJI.md` → Faza 1, sekcja 4 (Architektura danych).

## Krytyczne zasady (nie pomijaj!)

1. **Język UI = POLSKI** — wszelkie komunikaty widoczne dla użytkownika po polsku.
2. **Zod 4** (nie 3) — API: `z.iso.date()`, `z.iso.datetime()`, `z.url()`, import z `zod/v4`.
3. **ESLint 9** (nie 10) — typescript-eslint nie wspiera ESLint 10.
4. **Result<T, AppError>** zamiast throw w logice biznesowej.
5. **Explicit ORDER BY** w każdym zapytaniu SQL.
6. Przeczytaj `AGENTS.md` przed rozpoczęciem pracy.
7. Na koniec sesji: `pnpm lint && pnpm typecheck && pnpm test`.
8. Na koniec sesji: wpis w `CHANGELOG_AI.md` + aktualizacja tego pliku.

## Pełna mapa faz

Szczegóły: `docs/PLAN_REALIZACJI.md`

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
| 11 | LLM Assistant | M5 |
| 12 | LLM Guardrails + Cost Control | M5 |
| 13 | Quality Scoring | M5 |
| 14 | Competitor Intelligence | M5 |
| 15 | Topic Intelligence | M5 |
| 16 | Planning System | M6 |
| 17 | Plugins (Insights/Alerts) | M6 |
| 18 | Diagnostics + Recovery | M6 |
| 19 | Polish + Packaging | M6 |
