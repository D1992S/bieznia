# Nastepny krok — PRZECZYTAJ NAJPIERW

> **Ten plik mowi Ci co robic.** Aktualizuj go na koncu kazdej sesji.

## Aktualny status

| Faza | Nazwa | Status |
|------|-------|--------|
| 0 | Foundation | DONE |
| 1 | Data Core | DONE |
| 2 | Desktop Backend + IPC | DONE |
| 3 | Data Modes + Fixtures | DONE |
| 4 | Data Pipeline + Feature Engineering | **NASTEPNA** |
| 5-19 | Reszta | Oczekuje |

## Co zostalo zrobione (Faza 0 + 1 + 2 + 3)

- Monorepo pnpm workspaces: 10 pakietow + 2 aplikacje.
- TypeScript 5.9 strict, ESLint 9, Prettier, Vitest 4.
- Pakiet `shared`:
  - `Result<T,E>`, `AppError`, IPC kontrakty (4 komendy + 3 eventy), Zod 4 schemas.
  - Typed IPC result envelopes (`IpcResult`) dla wszystkich komend.
  - Logger JSON (`createLogger`) z poziomami severity i kontekstem.
- Pakiet `core`:
  - SQLite (`better-sqlite3`) + migracje forward-only + tracking (`schema_migrations`).
  - Schemat: `raw_api_responses`, `profiles`, `app_meta`, `sync_runs`, `dim_channel`, `dim_video`, `fact_channel_day`, `fact_video_day`.
  - Typed repository/mutation layer.
  - Query layer: `getKpis()`, `getTimeseries()`, `getChannelInfo()` z jawnym `ORDER BY`.
  - Fixture seed: `fixtures/seed-data.json` (90 dni, 1 kanal, 50 filmow).
- `apps/desktop` (Faza 2):
  - Inicjalizacja DB + migracje przy starcie aplikacji.
  - IPC handlery: `app:getStatus`, `db:getKpis`, `db:getTimeseries`, `db:getChannelInfo`.
  - Walidacja input/output po obu stronach granicy IPC (main + preload).
  - Ujednolicona serializacja bledow `AppError` bez crashy.
  - `app:getStatus` spiete z realnym stanem DB.
- `apps/ui` (Faza 2):
  - Typed bridge `window.electronAPI` (metody zamiast surowego `invoke(channel, payload)`).
  - Adapter IPC + hooki TanStack Query pobierajace status/KPI/timeseries/channel info.
  - UI czyta dane analityczne wylacznie przez IPC.
- `shared` + `data-pipeline` + `sync` + `desktop` + `ui` (Faza 3):
  - Kontrakty IPC dla data modes:
    - `app:getDataMode`
    - `app:setDataMode`
    - `app:probeDataMode`
  - Provider interface + tryby danych:
    - `fake`, `real`, `record`
    - `DataModeManager` z runtime toggle bez zmiany kontraktow konsumenta.
  - Provider stack:
    - fixture loader/save w `packages/data-pipeline/src/provider-fixture.ts`
    - cache TTL per endpoint
    - rate limiter (token bucket + log warning przy limicie)
    - record provider zapisujacy fixture replayowalne w fake mode
  - Desktop runtime:
    - inicjalizacja data mode managera przy starcie
    - env override:
      - `MOZE_DATA_MODE`
      - `MOZE_FAKE_FIXTURE_PATH`
      - `MOZE_REAL_FIXTURE_PATH`
      - `MOZE_RECORDING_OUTPUT_PATH`
  - UI:
    - sekcja "Tryb danych (Faza 3)" z podgladem trybu i przyciskami przełączania/probe.
- Testy:
  - 43 testy pass:
    - integracyjne IPC (w tym nowe handlery data mode),
    - integracyjne sync data modes (fake/real/record, rate limit, cache TTL).
- Build/runtime:
  - Desktop runtime bundlowany przez `esbuild` (`apps/desktop/scripts/build-desktop.mjs`), co umozliwia runtime import `@moze/core`/`@moze/shared`.
- Standard regresji: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Co robic teraz — Faza 4: Data Pipeline + Feature Engineering

**Cel:** Zbudowac deterministyczny pipeline ETL, ktory przetwarza dane z warstwy RAW do warstwy features pod ML.

**Zakres:**
1. ETL orchestration:
   - etapowanie: ingestion -> validation -> staging -> transform -> feature generation.
2. Validation step:
   - schema checks (Zod), range checks, freshness checks.
3. Staging model:
   - przygotowanie tabel/stubow i mapowan dla danych kanalu/filmow.
4. Feature engineering:
   - pierwsze features velocity/engagement/growth/temporal.
5. Data lineage:
   - metadata "skad i kiedy" dla rekordow przechodzacych przez pipeline.
6. Integracja z sync:
   - gotowy punkt pod post-sync hook (Faza 5), bez lamania kontraktow IPC.
7. Testy:
   - testy integracyjne pipeline na `fixtures/seed-data.json`.

**Definition of Done (Faza 4):**
- [ ] Pipeline przetwarza fixture data end-to-end i zapisuje wynik deterministycznie.
- [ ] Validation odrzuca niepoprawne dane z czytelnym `AppError`.
- [ ] Powstaja pierwsze features gotowe do dalszego ML.
- [ ] Data lineage umozliwia audyt pochodzenia danych.
- [ ] Testy integracyjne dla pipeline przechodza.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 errors.
- [ ] Wpis w `CHANGELOG_AI.md`.
- [ ] Aktualizacja tego pliku (`NEXT_STEP.md`).

**Pliki do modyfikacji/stworzenia:**
```
packages/data-pipeline/src/            — ETL orchestrator + walidacja + transform + features
packages/core/src/                     — ewentualne tabele pomocnicze/staging/lineage (migracja forward-only)
packages/sync/src/                     — punkt integracji pod uruchamianie pipeline
fixtures/                              — fixture data do testow pipeline
docs/architecture/data-flow.md         — aktualizacja przeplywu po implementacji Fazy 4
```

**Szczegoly:** `docs/PLAN_REALIZACJI.md` -> Faza 4.

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
