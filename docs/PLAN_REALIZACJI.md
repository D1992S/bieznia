# Plan realizacji projektu (AI-first)

> Cel: mieć **jedno, trwałe źródło prawdy** dla rozwoju aplikacji krok po kroku, z naciskiem na łatwą edycję przez różne modele AI (np. Claude Opus, GPT).

## 1. Zasady prowadzenia projektu

1. **Kontrakt przed implementacją**
   - Najpierw definiujemy: DTO, eventy, IPC contract, schema DB i walidacje.
   - Dopiero później implementujemy logikę i UI.

2. **Jedno źródło prawdy dla danych**
   - SQLite + migracje.
   - Brak stanu biznesowego „tylko w UI”.

3. **Ścisłe granice modułów**
   - UI nie dotyka DB i systemu.
   - Komunikacja wyłącznie przez IPC + DTO.

4. **Deterministyczność**
   - Jawne sortowanie, seed RNG, fixtures, checkpointy.
   - Te same wejścia = te same wyniki.

5. **Tryby pracy danych**
   - Fake mode i Record mode jako podstawa szybkiego developmentu.
   - Każdy moduł premium (LLM/ML/competitor) ma fallback stub/fixture.

6. **Jasna obsługa błędów**
   - Wspólny standard `AppError`.
   - Brak cichych fallbacków.

---

## 2. Struktura repo (docelowa)

```text
/apps
  /desktop        # Electron main + preload
  /ui             # Renderer (React)
/packages
  /shared         # DTO, zod schema, IPC contracts, event names
  /core           # DB schema, migracje, query layer
  /sync           # Orchestrator sync + providers + cache/rate limit
  /reports        # KPI, timeseries, raporty HTML/PDF
  /llm            # provider registry + planner/executor/summarizer
  /ml             # training, forecasting, nowcast, backtesting
  /plugins        # plugin runtime (insights/alerts)
  /diagnostics    # integrity checks + recovery
/docs
  /architecture
  /contracts
  /runbooks
  /prompts
```

---

## 3. Dokumentacja wymagana pod współpracę z AI

### 3.1 Pliki obowiązkowe

- `AGENTS.md` (root): zasady modyfikacji kodu.
- `docs/architecture/overview.md`: mapa modułów i przepływ danych.
- `docs/contracts/*.md`: kontrakty IPC, eventy, DB, błędy.
- `docs/runbooks/*.md`: jak dodać feature bez łamania architektury.
- `docs/prompts/*.md`: gotowe prompty do prac typowych.
- `ADR/*.md`: decyzje architektoniczne.
- `CHANGELOG_AI.md`: dziennik zmian wykonanych przez AI.

### 3.2 Standard opisu modułu

Każdy pakiet powinien mieć `README.md` zawierające:

- odpowiedzialność modułu,
- wejścia/wyjścia,
- zależności,
- listę publicznych API,
- przykładowe użycie.


## 3.3 Obowiązkowe logowanie zmian (PR/commit) — krytyczne dla współpracy wielu LLM

Aby inny model mógł bezpiecznie kontynuować pracę, **każda ingerencja w repo musi zostawić jawny ślad zmian**.

### Reguły obowiązkowe

1. **Każdy PR musi zawierać sekcję „Co zmieniono”** (lista plików + krótki opis decyzji).
2. **Każdy PR musi zawierać sekcję „Wpływ i ryzyko”** (co może się wysypać).
3. **Każdy PR musi zawierać sekcję „Jak zweryfikowano”** (komendy testów/checków i wynik).
4. **Każda zmiana AI musi dopisać wpis do `CHANGELOG_AI.md`**.
5. **Przy zmianie architektury wymagany jest ADR** (linkowany w PR).
6. **Brak tych sekcji = PR nie jest gotowy do merge**.

### Minimalny template wpisu do `CHANGELOG_AI.md`

- Data:
- Autor (model):
- Zakres plików:
- Co zmieniono:
- Dlaczego:
- Ryzyko/regresja:
- Jak zweryfikowano:
- Następny krok:


---

## 4. Fazy realizacji (krok po kroku)

## Faza 0 — Foundation

**Cel:** szybki i bezpieczny development.

**Zakres:**
- Monorepo (pnpm workspaces).
- TypeScript strict + ESLint + Prettier.
- Podstawowe testy (Vitest).
- `shared` z DTO i eventami.
- Logger + `AppError`.

**Definition of Done:**
- Aplikacja startuje.
- CI uruchamia lint + typecheck + unit.
- Jest podstawowy szkielet pakietów.

---

## Faza 1 — Data Core

**Cel:** stabilny fundament danych.

**Zakres:**
- SQLite + migracje.
- Tabele: `dim_channel`, `dim_video`, `fact_channel_day`, `fact_video_day`.
- Tabele operacyjne: `profiles`, `app_meta`, `sync_runs`, `perf_events`.
- Repozytoria i query layer: `getKpis`, `getTimeseries`, upserty.

**Definition of Done:**
- Testy integracyjne DB przechodzą.
- Fixture zapisuje się i odczytuje poprawnie.
- Zapytania są deterministyczne.

---

## Faza 2 — Desktop Backend + IPC

**Cel:** bezpieczny most UI ↔ backend.

**Zakres:**
- Rozdzielenie Electron: main/preload/renderer.
- Single instance lock.
- Router IPC: komendy + eventy progress.
- Walidacja zod po obu stronach.
- Mapowanie `AppError` przez IPC.

**Minimalne komendy IPC:**
- `app:getStatus`
- `db:getKpis`
- `db:getTimeseries`

**Definition of Done:**
- UI pobiera KPI/timeseries wyłącznie przez IPC.

---

## Faza 3 — Data Modes (Fake/Real/Record)

**Cel:** maksymalna szybkość iteracji i repeatability.

**Zakres:**
- Fake mode (fixtures).
- Real mode (API provider).
- Record mode (nagrywanie fixture na bazie real requestów).
- Cache requestów i rate limiting.

**Definition of Done:**
- Przełączanie fake/real bez zmian w UI.
- Record mode tworzy dane odtwarzalne w fake mode.

---

## Faza 4 — Auth + Profile

**Cel:** separacja środowisk użytkownika.

**Zakres:**
- OAuth connect/disconnect/status.
- Profile: tworzenie, wybór aktywnego profilu, trwałość.
- Ustawienia per profil (LLM, zakresy raportu, itp.).

**Definition of Done:**
- Dwa profile działają niezależnie po restarcie.

---

## Faza 5 — Sync Orchestrator

**Cel:** kontrolowany i idempotentny sync.

**Zakres:**
- Etapy sync z postępem procentowym.
- Checkpointy i resume.
- `sync_runs` + snapshoty.
- Blokada równoległego sync.
- Eventy `sync:progress` do UI.

**Definition of Done:**
- Sync można przerwać i wznowić bez utraty spójności.

---

## Faza 6 — Dashboard + Raporty + Eksport

**Cel:** pierwsza duża wartość biznesowa.

**Zakres:**
- KPI cards + timeseries + zakresy dat.
- Pipeline raportu: sync → metrics → insights → render.
- HTML report + PDF (hidden BrowserWindow).
- Weekly export package (`report_max.pdf`, `top_videos.csv`, `summary.txt`).

**Definition of Done:**
- Jeden klik generuje raport PDF i paczkę eksportową.

---

## Faza 7 — Import + Enrichment + Search

**Cel:** pełna kontrola źródeł i wyszukiwania.

**Zakres:**
- Import CSV z mapowaniem kolumn i walidacją.
- Transkrypcje + parser SRT.
- FTS5 search + snippety + timestamp.

**Definition of Done:**
- Importowane dane od razu pojawiają się na wykresach.
- Wyszukiwanie zwraca wynik ze snippetem i timestampem.

---

## Faza 8 — LLM Assistant

**Cel:** odpowiedzi oparte na danych i evidence.

**Zakres:**
- Chat UI + historia.
- Provider registry + LocalStub fallback.
- Orkiestrator: planner → executor → summarizer.
- Evidence dołączane do odpowiedzi.

**Definition of Done:**
- Odpowiedzi zawierają evidence i są spójne z danymi z DB.

---

## Faza 9 — LLM Guardrails

**Cel:** kontrola kosztu i bezpieczeństwa.

**Zakres:**
- Limity dzienne tokenów/kosztu.
- Redaction danych wrażliwych.
- Cache odpowiedzi LLM po hashu promptu.
- Usage tracking w DB.

**Definition of Done:**
- Dashboard usage działa, cache ma mierzalny hit-rate.

---

## Faza 10 — ML Forecast + Nowcast

**Cel:** reprodukowalne prognozy.

**Zakres:**
- Rejestr modeli i status active.
- Trening i backtesting rolling windows.
- Metryki MAE / sMAPE.
- Quality gate aktywacji modelu.
- Nowcast (p25/p50/p75).

**Definition of Done:**
- Forecast jest reprodukowalny i wersjonowany.

---

## Faza 11 — Quality Scoring

**Cel:** ranking jakości contentu.

**Zakres:**
- Składowe score: velocity, efficiency, conversion, consistency.
- Normalizacja sigmoid + wagi.
- Persist wyników i tabela rankingowa w UI.

**Definition of Done:**
- Ranking pokazuje final score i wkład składowych.

---

## Faza 12 — Competitor Intelligence

**Cel:** systemowa analiza konkurencji.

**Zakres:**
- Schema konkurencji + sync danych publicznych.
- Snapshoty dzienne.
- Hit detection + momentum + acceleration.
- Radar konkurencji w UI.

**Definition of Done:**
- Widoczne hity konkurencji i trend momentum w czasie.

---

## Faza 13 — Topic Intelligence

**Cel:** wykrywanie luk tematycznych.

**Zakres:**
- TF-IDF + K-Means.
- Topic pressure day.
- Gap scoring + reason.
- Widok klastrów.

**Definition of Done:**
- Aplikacja pokazuje luki tematyczne z uzasadnieniem.

---

## Faza 14 — Planning System

**Cel:** backlog + kalendarz + ryzyko kanibalizacji.

**Zakres:**
- Backlog CRUD.
- Score pomysłu (momentum + effort).
- Similarity check tytułów.
- Risk score + reason.

**Definition of Done:**
- Dodając plan publikacji, użytkownik dostaje ostrzeżenia ryzyka.

---

## Faza 15 — Plugins (Insights/Alerts)

**Cel:** automatyczne insighty po sync.

**Zakres:**
- Plugin manager i lifecycle.
- Persist `insights`, `alerts`.
- Playbook actions (JSON) + UI alertów.

**Definition of Done:**
- Po sync generują się alerty z gotowymi playbookami.

---

## Faza 16 — Diagnostics + Recovery

**Cel:** samonaprawa i szybka diagnoza.

**Zakres:**
- Perf events i czasy etapów.
- Diagnostics modal.
- DB integrity check.
- Safe mode overlay.
- Recovery actions: vacuum, reindex, reset cache.

**Definition of Done:**
- Użytkownik ma działające narzędzia naprawcze w UI.

---

## Faza 17 — Polish + Packaging

**Cel:** domknięcie UX i dystrybucja.

**Zakres:**
- WIP views podpięte do realnych danych.
- Responsywność i dark mode.
- Portable build.
- „One-click weekly package”.

**Definition of Done:**
- Portable build działa end-to-end od sync do raportu.

---

## 5. Rytuał realizacji każdej fazy (anty-regresja)

Każdy feature realizować w tej kolejności:

1. Kontrakt (`shared`, schema, eventy, DTO, walidacja).  
2. Implementacja logiki (`core/sync/reports/llm/ml`).  
3. IPC (main/preload).  
4. UI.  
5. Testy (unit + integration + smoke tam, gdzie sensowne).  
6. Aktualizacja dokumentacji i changelogu.

---

## 6. Definition of Ready (DoR) dla tasków

Task może wejść do realizacji tylko gdy zawiera:

- cel biznesowy,
- zakres plików/modułów,
- kontrakt wejścia/wyjścia,
- kryteria akceptacji,
- listę testów,
- listę rzeczy „poza zakresem”.

---

## 7. Definition of Done (DoD) globalne

Task jest zamknięty dopiero gdy:

- typy i walidacje są kompletne,
- testy przechodzą lokalnie i w CI,
- brak naruszeń granic architektury,
- dokumentacja została zaktualizowana,
- istnieje wpis w `CHANGELOG_AI.md` (jeśli zmiana była generowana przez AI).

---

## 8. Minimalne KPI postępu projektu

- % zrealizowanych faz.
- Średni lead time taska.
- Stabilność CI (pass-rate).
- Liczba regresji na fazę.
- Pokrycie testami warstwy core/sync/llm/ml.
- Hit-rate cache (API/LLM).

---

## 9. Plan realizacji pierwszych 2 tygodni

## Tydzień 1
- Faza 0 + Faza 1.
- Wynik: gotowe fundamenty + DB + query layer + test baseline.

## Tydzień 2
- Faza 2 + Faza 3.
- Wynik: działające IPC + dashboard na fake mode + record mode.

---

## 10. Jak pracować z różnymi LLM nad tym samym repo

1. Każda sesja AI zaczyna od przeczytania:
   - `AGENTS.md`,
   - `docs/architecture/overview.md`,
   - właściwego runbooka dla zadania.

2. Każda sesja AI kończy się:
   - checklistą DoD,
   - krótkim wpisem do `CHANGELOG_AI.md`,
   - listą ryzyk po zmianie.

3. Zakaz „dużych refactorów bez ADR”.

4. Jeden PR = jedna odpowiedzialność.

---

## 11. Najważniejsze decyzje architektoniczne (na teraz)

- Runtime desktop: Electron.
- Język: TypeScript strict.
- Baza: SQLite + migracje.
- Granice komunikacji: IPC + zod DTO.
- Raportowanie: HTML + PDF offline.
- LLM: provider registry + LocalStub fallback.
- ML: registry + backtesting + quality gate.

---

## 12. Checklista startowa (do odhaczania)

- [ ] Utworzyć strukturę monorepo.
- [ ] Skonfigurować TS strict + lint + format + test.
- [ ] Dodać pakiet `shared` (DTO, eventy, błędy).
- [ ] Dodać SQLite + pierwszy zestaw migracji.
- [ ] Zaimplementować minimalny IPC (`app:getStatus`, `db:getKpis`, `db:getTimeseries`).
- [ ] Dodać fake mode i fixture.
- [ ] Uruchomić pierwszy dashboard na danych fixture.
- [ ] Dodać dokumenty: architecture/contracts/runbooks.

---

Ten dokument jest „żywy”: aktualizować po każdej większej decyzji, aby zespół i modele AI pracowały zawsze na tej samej, aktualnej mapie projektu.
