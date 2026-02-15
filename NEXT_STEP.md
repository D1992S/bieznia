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
| 9 | Import + Enrichment + Search | **NASTEPNA** |
| 10-19 | Reszta | Oczekuje |

## Co zostalo zrobione (Faza 8)

- Rozszerzono kontrakty IPC i DTO o profile/settings/auth:
  - `profile:list`, `profile:create`, `profile:setActive`
  - `settings:get`, `settings:update`
  - `auth:getStatus`, `auth:connect`, `auth:disconnect`
- Dodano `packages/core/src/queries/settings-queries.ts`:
  - odczyt ustawien profilu z `app_meta`
  - patch update z walidacja przez Zod
- Dodano `apps/desktop/src/profile-manager.ts`:
  - registry profili na dysku
  - oddzielne katalogi i oddzielna DB per profil
  - auth metadata + szyfrowany sekret auth
- Podlaczono faze 8 do runtime desktop (`apps/desktop/src/main.ts`):
  - `safeStorage` adapter
  - init profile managera przy starcie
  - automatyczny wybor/sciezka DB aktywnego profilu
  - przeladowanie backendu po zmianie aktywnego profilu
  - profile row synchronizowany do DB aktywnego profilu
- Rozszerzono handlery IPC i preload bridge o nowe komendy fazy 8.
- Rozszerzono UI (React + TanStack Query):
  - lista profili + tworzenie + przelaczanie aktywnego profilu
  - status/connect/disconnect konta YouTube
  - ustawienia profilu (default channel, preset dat, metryka forecast, auto sync/ML)
- Dodano testy:
  - `apps/desktop/src/profile-manager.integration.test.ts`
  - rozszerzone `apps/desktop/src/ipc-handlers.integration.test.ts`
- Regresja:
  - `pnpm lint` PASS
  - `pnpm typecheck` PASS
  - `pnpm test` PASS (72/72)
  - `pnpm build` PASS

## Stan techniczny po sesji (2026-02-13)

- Naprawiono uruchamianie pelnej aplikacji desktop w trybie dev:
  - preload bundlowany jest jako `cjs`, wiec Electron nie rzuca juz bledu:
    - `Cannot use import statement outside a module`
  - launcher dev (`scripts/dev-desktop.mjs`) uzywa jednego hosta:
    - `127.0.0.1:5173` dla UI i `VITE_DEV_SERVER_URL`
- Rekomendacja runtime:
  - uzywaj `corepack pnpm ...` (nie globalnego `pnpm`), zeby native moduly (`better-sqlite3`) budowaly sie pod aktywny Node 22 i nie powodowaly ABI mismatch.
- Stan checkow po poprawkach:
  - `corepack pnpm lint` PASS
  - `corepack pnpm typecheck` PASS
  - `corepack pnpm test` PASS (72/72)
  - `corepack pnpm build` PASS

## Stan techniczny po sesji (2026-02-15)

- Dashboard UI zostal uporzadkowany zgodnie z ustaleniami:
  - przywrocone zakladki (`Statystyki`, `Raporty i eksport`, `Ustawienia`),
  - layout Studio osadzony w sekcji `Statystyki` (KPI + szereg czasowy + prognoza ML + predykcje),
  - globalna kolorystyka dark dla calej aplikacji.
- Optymalizacja frontendu:
  - wykres Studio (Recharts) zostal wydzielony do lazy-loaded chunku:
    - `apps/ui/src/components/studio-forecast-chart.tsx`,
    - dynamiczny import w `apps/ui/src/App.tsx`.
  - efekt buildu UI:
    - chunk glowny: ~265.75 kB,
    - chunk wykresu: ~350.61 kB,
    - usuniete ostrzezenie o pojedynczym chunku > 500 kB.
- W trakcie regresji wykryto i naprawiono lokalny problem ABI natywnego modulu:
  - `better-sqlite3` byl zbudowany pod inna wersje Node (`NODE_MODULE_VERSION 143`),
  - naprawa: zatrzymanie procesow `node/electron` + `pnpm --filter @moze/core rebuild better-sqlite3`.
- Stan checkow po poprawkach:
  - `pnpm lint` PASS
  - `pnpm typecheck` PASS
  - `pnpm test` PASS (76/76)
  - `pnpm build` PASS

## Co robic teraz - Faza 9: Import + Enrichment + Search

**Cel:** pozwolic na lokalny import danych CSV i ich natychmiastowe wlaczenie do analityki + dodac pelnotekstowe wyszukiwanie tresci.

**Zakres:**
1. Import CSV:
   - parser CSV + mapowanie kolumn + preview
   - walidacja schema/range (Zod) z raportem bledow (wiersz/kolumna)
   - zapis importu do warstwy RAW/STAGING
2. Integracja z pipeline:
   - po poprawnym imporcie uruchomienie `runDataPipeline`
   - odswiezenie KPI/timeseries/raportow
3. Search:
   - SQLite FTS5 (transkrypcje/opisy/tytuly)
   - query + snippet + ranking
4. IPC + UI:
   - nowe komendy import/search po stronie desktop
   - ekran importu i wyszukiwarki po stronie UI
5. Testy:
   - integracje importu (happy path + invalid CSV)
   - integracje search (relevance + snippet)

**Definition of Done (Faza 9):**
- [ ] Import CSV dziala z mapowaniem i walidacja.
- [ ] Import triggeruje pipeline i dane sa widoczne na dashboardzie.
- [ ] Search zwraca wynik + snippet + ranking.
- [ ] Invalid CSV zwraca czytelny blad z numerem wiersza/kolumny.
- [ ] Testy fazy przechodza.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.
- [ ] Wpis w `CHANGELOG_AI.md`.
- [ ] Aktualizacja `README.md` i `NEXT_STEP.md`.

**Pliki do modyfikacji/stworzenia (start):**
```
packages/shared/src/                  - DTO/IPC contracts import/search
packages/core/src/                    - migracje + query/repository dla import/search
packages/data-pipeline/src/           - podpiecie import source
apps/desktop/src/                     - handlery IPC import/search
apps/ui/src/                          - widok importu + widok search
```

## Krytyczne zasady (nie pomijaj)

1. **Jezyk UI = POLSKI** - wszystkie komunikaty user-facing po polsku.
2. **Zod 4** (nie 3) - import z `zod/v4`.
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
