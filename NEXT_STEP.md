# Nastepny krok — PRZECZYTAJ NAJPIERW

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
| 8 | Auth + Profile + Settings | **NASTEPNA** |
| 9-19 | Reszta | Oczekuje |

## Co zostalo zrobione (Faza 0 + 1 + 2 + 3 + 4 + 5 + 6 + 7)

- Monorepo pnpm workspaces: 10 pakietow + 2 aplikacje.
- TypeScript 5.9 strict, ESLint 9, Prettier, Vitest 4.
- `shared`:
  - `Result<T,E>`, `AppError`, logger JSON, Zod 4 DTO.
  - IPC kontrakty dla status/data-mode/sync/ml/reports + eventy sync.
- `core`:
  - SQLite (`better-sqlite3`) + migracje forward-only.
  - Query/mutation layer + fixture seed (90 dni, 1 kanal, 50 filmow).
- `data-pipeline`:
  - ETL runner (`runDataPipeline`) + validation + staging + `ml_features` + `data_lineage`.
- `sync`:
  - orchestrator z checkpoint/resume, mutex, retry/backoff i eventami progress.
- `ml`:
  - baseline forecasting: `holt-winters` + `linear-regression`,
  - backtesting (`MAE`, `sMAPE`, `MASE`) + quality gate + `p10/p50/p90`.
- `reports` (Faza 7):
  - generator raportu dashboardowego (`generateDashboardReport`),
  - eksport lokalny (`exportDashboardReport`) do `JSON/CSV/HTML`,
  - renderer HTML raportu.
- `desktop` + `ui` (Faza 7):
  - nowe komendy IPC:
    - `reports:generate`
    - `reports:export`
  - dashboard z:
    - kartami KPI (delta + trend),
    - wykresem timeseries + overlay prognozy (`p10/p50/p90`),
    - przelaczaniem zakresu dat (`7d/30d/90d/custom`),
    - sekcja raportu (insighty + top videos) i eksportu.
- Testy:
  - 68 testow pass, w tym:
    - kontrakty shared,
    - integracje IPC desktop,
    - integracje sync/ml/pipeline,
    - integracje reports (generowanie + eksport + render HTML),
    - helpery zakresu dat w UI.
- Standard regresji:
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — PASS.

## Co robic teraz — Faza 8: Auth + Profile + Settings

**Cel:** uruchomic profile i ustawienia per profil, z bezpiecznym storage sekretow lokalnie.

**Zakres:**
1. Auth:
   - status podlaczenia konta (connect/disconnect/status) jako kontrakt i UI flow.
2. Profile:
   - tworzenie i przelaczanie profili.
   - separacja danych profilowych (osobne DB per profil).
3. Settings:
   - ustawienia per profil (provider, preferencje raportu/ML).
4. Secret storage:
   - bezpieczny zapis sekretow przez Electron `safeStorage`.
5. Testy:
   - IPC + persistence profili i ustawien po restarcie.

**Definition of Done (Faza 8):**
- [ ] Dziala `connect/disconnect/status` dla konta.
- [ ] Dwa profile dzialaja niezaleznie po restarcie aplikacji.
- [ ] Ustawienia sa zapisywane i odczytywane per profil.
- [ ] Sekrety nie sa trzymane w plaintext.
- [ ] Testy fazy przechodza.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 errors.
- [ ] Wpis w `CHANGELOG_AI.md`.
- [ ] Aktualizacja tego pliku (`NEXT_STEP.md`).

**Pliki do modyfikacji/stworzenia:**
```
packages/shared/src/                  — DTO/IPC contracts auth/profile/settings
packages/core/src/                    — schema + repository profile/settings
apps/desktop/src/                     — handlery IPC + safeStorage bridge
apps/ui/src/                          — ekran profilu i ustawien
```

## Krytyczne zasady (nie pomijaj)

1. **Jezyk UI = POLSKI** — wszystkie komunikaty user-facing po polsku.
2. **Zod 4** (nie 3) — import z `zod/v4`.
3. **ESLint 9** (nie 10).
4. **Result<T, AppError>** zamiast throw w logice biznesowej.
5. **Explicit ORDER BY** w kazdym SQL.
6. Przeczytaj `AGENTS.md` przed rozpoczeciem pracy.
7. Na koniec sesji: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
8. Na koniec sesji: wpis w `CHANGELOG_AI.md` + aktualizacja tego pliku.

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
| 11 | LLM Assistant | M5 |
| 12 | LLM Guardrails + Cost Control | M5 |
| 13 | Quality Scoring | M5 |
| 14 | Competitor Intelligence | M5 |
| 15 | Topic Intelligence | M5 |
| 16 | Planning System | M6 |
| 17 | Plugins (Insights/Alerts) — SKIP (solo) | M6 |
| 18 | Diagnostics + Recovery | M6 |
| 19 | Polish + Local UX (bez packaging/telemetry) | M6 |
