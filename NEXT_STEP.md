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
| 11-19 | Reszta | Oczekuje |

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

## Co robic teraz - Faza 11: LLM Assistant

**Cel:** odpowiedzi asystenta AI oparte na danych z DB i evidence, bez halucynacji.

**Zakres:**
1. Orkiestrator LLM:
   - planner -> executor -> summarizer,
   - output JSON: `answer`, `evidence[]`, `confidence`, `follow_up_questions[]`.
2. Provider registry:
   - OpenAI, Anthropic, Ollama/local + LocalStub fallback.
3. Persist historii:
   - tabele rozmow i wiadomosci w SQLite,
   - przypiecie evidence do odpowiedzi.
4. IPC + desktop:
   - komendy chatowe i pobieranie historii rozmow.
5. UI:
   - zakladka asystenta,
   - czat + historia + widok evidence.
6. Testy:
   - pytanie o wyniki miesiaca zwraca liczby z DB,
   - LocalStub dziala bez zewnetrznego API,
   - evidence wskazuje konkretne rekordy.

**Definition of Done (Faza 11):**
- [ ] Asystent odpowiada na pytania na podstawie danych z bazy.
- [ ] Kazda odpowiedz ma evidence (linki/odwolania do danych).
- [ ] LocalStub mode dziala offline.
- [ ] IPC i UI dla asystenta dzialaja stabilnie.
- [ ] Testy fazy przechodza.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 0 errors.
- [ ] Wpis w `CHANGELOG_AI.md`.
- [ ] Aktualizacja `README.md` i `NEXT_STEP.md`.

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
