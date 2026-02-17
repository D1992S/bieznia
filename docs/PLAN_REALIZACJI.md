# Plan realizacji projektu (AI-first)

> Cel: zbudować **analityczną maszynę** — desktop app dla content creatorów (YouTube), która zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakość contentu i daje konkretne rekomendacje oparte na evidence. Jedno, trwałe źródło prawdy dla rozwoju krok po kroku.

---

## 1. Zasady prowadzenia projektu

1. **Kontrakt przed implementacją**
   - Najpierw: DTO, eventy, IPC contract, schema DB, walidacje (Zod).
   - Później: logika i UI.
   - Każdy kontrakt ma wersję (`v1`, `v2`) — nigdy nie łamiemy istniejącego API, dodajemy nowy endpoint.

2. **Jedno źródło prawdy dla danych**
   - SQLite + migracje (forward-only, brak rollback migracji w produkcji).
   - Brak stanu biznesowego „tylko w UI" — UI jest projekcją stanu DB.
   - Każda zmiana stanu przechodzi przez dedykowany mutation layer, nie raw SQL.

3. **Ścisłe granice modułów**
   - UI nie dotyka DB i systemu plików.
   - Komunikacja wyłącznie przez IPC + DTO.
   - Dependency rule: `shared` ← `core` ← `sync/reports/llm/ml` ← `apps`.
   - Zakaz circular dependencies — wymuszane przez lint rule.

4. **Deterministyczność**
   - Jawne sortowanie, seeded RNG, fixtures, checkpointy.
   - Te same wejścia = te same wyniki (krytyczne dla reprodukowalności ML).
   - Każdy model ML ma snapshot konfiguracji + wersję danych treningowych.

5. **Tryby pracy danych**
   - **Fake mode**: fixtures (instant, offline, testy).
   - **Record mode**: nagrywanie real API → fixture (budowa golden datasets).
   - **Real mode**: produkcja.
   - Każdy moduł premium (LLM/ML/sync/competitor) ma LocalStub fallback.

6. **Jasna obsługa błędów**
   - Wspólny standard `AppError` z kodami, severity, kontekstem i stack trace.
   - Brak cichych fallbacków — każdy error logowany i widoczny w diagnostyce.
   - Graceful degradation: gdy moduł padnie, reszta działa (circuit breaker pattern).

7. **Performance budgets** *(nowe)*
   - IPC response: < 100ms (p95) dla queries, < 500ms dla mutacji.
   - Dashboard render: < 200ms po otrzymaniu danych.
   - ML inference: < 2s per model. Training: background worker, nie blokuje UI.
   - Sync: progress events co 1s minimum (UX responsiveness).

8. **Data quality first** *(nowe)*
   - Każdy import/sync przechodzi walidację schema + range check + freshness check.
   - Brakujące dane: explicite oznaczane (NULL z reason), nie interpolowane cicho.
   - Data lineage: każdy rekord wie skąd pochodzi (source, timestamp, sync_run_id).

9. **Język aplikacji — POLSKI**
   - Cały interfejs użytkownika (UI) jest **wyłącznie po polsku**: etykiety, komunikaty, placeholdery, tooltips, alerty, raporty, opisy na dashboardzie.
   - Komunikaty błędów widoczne dla użytkownika — po polsku.
   - Nazwy zmiennych/funkcji/typów — po angielsku (standard branżowy).
   - Komentarze w kodzie — po angielsku.
   - Szczegółowe zasady w `AGENTS.md` sekcja „Język aplikacji".

10. **ADR mini + scope freeze przed każdą nową fazą** *(nowe, stałe)*
   - Przed startem fazy tworzymy mini ADR (krótki kontekst, decyzja, alternatywy, ryzyka, metryki sukcesu).
   - Dodatkowo 10-minutowy **scope freeze**: jawna lista „robimy / nie robimy" dla bieżącej fazy.
   - Każdy PR fazowy linkuje ADR i potwierdza brak rozszerzania scope poza freeze.

---

## 2. Struktura repo (docelowa)

```text
/apps
  /desktop          # Electron main + preload
  /ui               # Renderer (React + Zustand + TanStack Query)
/packages
  /shared           # DTO, Zod schema, IPC contracts, event names, AppError
  /core             # DB schema, migracje, query layer, mutation layer
  /data-pipeline    # ETL, preprocessing, normalizacja, feature engineering  ← NOWE
  /sync             # Orchestrator sync + providers + cache/rate limit
  /reports          # KPI, timeseries, raporty HTML/PDF
  /llm              # provider registry + planner/executor/summarizer
  /ml               # training, forecasting, nowcast, anomaly, backtesting
  /analytics        # quality scoring, competitor intel, topic intel  ← NOWE (wydzielone)
  /plugins          # poza zakresem trybu solo (brak plugin runtime)
  /diagnostics      # integrity checks + recovery + perf monitoring
/docs
  /architecture
  /contracts
  /runbooks
  /prompts
/ADR                # Architectural Decision Records
/fixtures           # Golden datasets dla testów i fake mode  ← NOWE
```

### Zmiany vs. oryginalny plan:
- **`/packages/data-pipeline`** — wydzielony ETL i feature engineering (wcześniej implicite w `core`).
- **`/packages/analytics`** — quality scoring + competitor + topic intel wydzielone z `reports` (inne odpowiedzialności).
- **`/fixtures`** — top-level golden datasets, nie rozrzucone po pakietach.
- **UI stack**: React + **Zustand** (state) + **TanStack Query** (async state / IPC queries) — brakowało strategii state management.

---

## 3. Dokumentacja wymagana pod współpracę z AI

### 3.1 Pliki obowiązkowe

| Plik | Cel |
|------|-----|
| `AGENTS.md` (root) | Zasady modyfikacji kodu |
| `docs/architecture/overview.md` | Mapa modułów i przepływ danych |
| `docs/architecture/data-flow.md` | Pipeline danych: ingestion → storage → processing → ML → UI |
| `docs/contracts/*.md` | Kontrakty IPC, eventy, DB, błędy |
| `docs/runbooks/*.md` | Jak dodać feature bez łamania architektury |
| `docs/prompts/*.md` | Gotowe prompty do typowych zadań |
| `ADR/*.md` | Decyzje architektoniczne |
| `CHANGELOG_AI.md` | Dziennik zmian AI |

### 3.2 Standard opisu modułu

Każdy pakiet **musi** mieć `README.md` zawierające:

- **Odpowiedzialność** (1-2 zdania, co robi i czego NIE robi).
- **Wejścia/wyjścia** (typy, przykłady).
- **Zależności** (od jakich pakietów zależy).
- **Public API** (lista eksportowanych funkcji/typów).
- **Przykładowe użycie** (kod).
- **Performance characteristics** (oczekiwane czasy, limity danych).

### 3.3 Obowiązkowe logowanie zmian (PR/commit)

Aby inny model mógł bezpiecznie kontynuować pracę, **każda ingerencja w repo musi zostawić jawny ślad zmian**.

#### Reguły obowiązkowe

1. **Każdy PR musi zawierać sekcję „Co zmieniono"** (lista plików + krótki opis decyzji).
2. **Każdy PR musi zawierać sekcję „Wpływ i ryzyko"** (co może się wysypać).
3. **Każdy PR musi zawierać sekcję „Jak zweryfikowano"** (komendy testów/checków i wynik).
4. **Każda zmiana AI musi dopisać wpis do `CHANGELOG_AI.md`**.
5. **Przy zmianie architektury wymagany jest ADR** (linkowany w PR).
6. **Brak tych sekcji = PR nie jest gotowy do merge**.

#### Template wpisu do `CHANGELOG_AI.md`

```
- Data:
- Autor (model):
- Zakres plików:
- Co zmieniono:
- Dlaczego:
- Ryzyko/regresja:
- Jak zweryfikowano:
- Następny krok:
```

---

## 4. Architektura danych (nowa sekcja — krytyczna dla "potwora analitycznego")

### 4.1 Model danych — warstwy

```
┌─────────────────────────────────────────────┐
│  RAW LAYER (surowe dane z API/importu)      │
│  raw_api_responses, raw_csv_imports         │
├─────────────────────────────────────────────┤
│  STAGING LAYER (wystandaryzowane)           │
│  stg_videos, stg_channels, stg_metrics     │
├─────────────────────────────────────────────┤
│  DIMENSION TABLES                           │
│  dim_channel, dim_video, dim_topic          │
├─────────────────────────────────────────────┤
│  FACT TABLES (metryki dzienne)              │
│  fact_channel_day, fact_video_day           │
├─────────────────────────────────────────────┤
│  ANALYTICS LAYER (przetworzone)             │
│  agg_kpi_daily, agg_trends, agg_forecasts  │
│  agg_quality_scores, agg_topic_clusters     │
├─────────────────────────────────────────────┤
│  ML LAYER (modele i predykcje)              │
│  ml_models, ml_predictions, ml_backtests    │
│  ml_features, ml_anomalies                  │
└─────────────────────────────────────────────┘
```

### 4.2 Pipeline danych (ETL)

```
Ingestion → Validation → Staging → Transform → Analytics → ML → Presentation
    │            │           │          │           │        │        │
    ▼            ▼           ▼          ▼           ▼        ▼        ▼
  API/CSV    Schema+Range  Normalize  Features   KPIs    Predict   UI/PDF
  Import     Freshness     Dedupe     Engineer   Trends  Anomaly   Export
             NullReason    Upsert     Aggregate  Score   Forecast
```

Każdy krok pipeline'u:
- Ma **input/output schema** (Zod).
- Loguje **czas wykonania** i **liczbę rekordów**.
- Przy błędzie: **retry z backoff** (ingestion) lub **skip + log** (transform).
- Zapisuje **data lineage** (source → transform → output).

### 4.3 Feature Engineering (dla ML)

Cechy generowane automatycznie z fact tables:

| Kategoria | Przykładowe features |
|-----------|---------------------|
| **Velocity** | views_7d, views_30d, views_acceleration, publish_frequency |
| **Engagement** | like_rate, comment_rate, avg_watch_time, retention_curve_slope |
| **Growth** | subscriber_delta_7d, subscriber_acceleration, growth_consistency |
| **Temporal** | day_of_week, hour_of_publish, days_since_last_video, seasonal_index |
| **Content** | title_length, tag_count, description_length, thumbnail_score_proxy |
| **Competitive** | relative_velocity_vs_niche, market_share_delta |

Features przechowywane w `ml_features` z wersjonowaniem (feature_set_version).

### 4.4 Strategia obsługi brakujących danych

| Sytuacja | Strategia |
|----------|-----------|
| Brak metryk za dany dzień | `NULL` + `missing_reason: 'no_sync'` — NIE interpolujemy |
| API zwraca 0 | Zapisujemy 0 — to jest valid data point |
| Za mało danych do ML (< 30 dni) | Graceful degradation: pokazuj raw trends, ukryj forecast |
| Za mało danych do quality score | Partial score z flagą `confidence: 'low'` |
| Outlier detection | Z-score > 3σ: flagujemy, NIE usuwamy. Użytkownik decyduje |

---

## 5. Fazy realizacji (zoptymalizowana kolejność)

### Zmiana kolejności vs. oryginalny plan

**Problem w oryginalnym planie:** ML i analytics dopiero w fazach 10-14, co oznacza że przez 60% developmentu app nie robi tego, do czego jest przeznaczona.

**Nowa strategia:** Wcześniejsze wprowadzenie data pipeline i bazowego ML, żeby każda kolejna faza budowała na działającej analityce.

---

### Faza 0 — Foundation

**Cel:** Działający szkielet monorepo ze wszystkimi narzędziami dev.

**Zakres:**
- Monorepo (pnpm workspaces) z pełną strukturą katalogów.
- TypeScript strict + ESLint (flat config) + Prettier.
- Vitest setup (unit + integration configs).
- `shared`: DTO, Zod schemas, IPC contracts, event names, `AppError`, `Result<T,E>` type.
- Logger (structured JSON, severity levels, context).
- Zustand store skeleton w `ui`.
- Electron minimal shell (main + preload + renderer z React).

**Definition of Done:**
- `pnpm install` → `pnpm build` → `pnpm test` → `pnpm lint` — wszystko przechodzi.
- Electron startuje i pokazuje "Hello" z React.
- Shared types importowalne z każdego pakietu.
- CI pipeline: lint + typecheck + test (GitHub Actions).

**Krytyczne pliki do stworzenia:**
```
pnpm-workspace.yaml
tsconfig.base.json
eslint.config.js
prettier.config.js
vitest.config.ts
packages/shared/src/index.ts
packages/shared/src/dto/index.ts
packages/shared/src/errors/AppError.ts
packages/shared/src/events/index.ts
packages/shared/src/ipc/contracts.ts
apps/desktop/src/main.ts
apps/desktop/src/preload.ts
apps/ui/src/main.tsx
apps/ui/src/App.tsx
apps/ui/src/store/index.ts
```

---

### Faza 1 — Data Core

**Cel:** Stabilny fundament danych z warstwowym modelem.

**Zakres:**
- SQLite setup (better-sqlite3, synchronous w main process).
- System migracji (forward-only, numbered, idempotent checks).
- **Raw layer**: `raw_api_responses` (JSON blob + metadata).
- **Dimension tables**: `dim_channel`, `dim_video`.
- **Fact tables**: `fact_channel_day`, `fact_video_day`.
- **Operational tables**: `profiles`, `app_meta`, `sync_runs`.
- `perf_events` telemetry trafia do zakresu Diagnostics (Faza 18), nie do Fazy 1.
- Mutation layer: typed repository pattern (nie raw SQL w logice biznesowej).
- Query layer: `getKpis()`, `getTimeseries()`, typed upserts.
- Seed fixtures: realistyczne dane 90-dniowe dla 1 kanału + 50 filmów.

**Definition of Done:**
- Testy integracyjne DB przechodzą (in-memory SQLite).
- Fixture zapisuje się i odczytuje poprawnie.
- Migracje są idempotentne (podwójne uruchomienie = brak błędu).
- Query results są deterministyczne (jawne ORDER BY wszędzie).

---

### Faza 2 — Desktop Backend + IPC

**Cel:** Bezpieczny, typowany most UI ↔ backend.

**Zakres:**
- Electron security: contextIsolation, sandbox, no nodeIntegration w renderer.
- Single instance lock.
- IPC Router pattern: typed handler registration.
- Zod walidacja po obu stronach IPC.
- `AppError` serializacja/deserializacja przez IPC.
- TanStack Query hooks w UI do konsumpcji IPC (react-query adapter).
- Progress event streaming (IPC → renderer).

**Minimalne komendy IPC (Faza 2):**

| Komenda | Input | Output |
|---------|-------|--------|
| `app:getStatus` | `void` | `AppStatusDTO` |
| `db:getKpis` | `KpiQueryDTO` | `KpiResultDTO` |
| `db:getTimeseries` | `TimeseriesQueryDTO` | `TimeseriesResultDTO` |
| `db:getChannelInfo` | `ChannelIdDTO` | `ChannelInfoDTO` |

**Definition of Done:**
- UI pobiera KPI/timeseries wyłącznie przez IPC.
- Invalid input → AppError z czytelnym komunikatem (nie crash).
- E2E test: UI renderuje dane z DB przez IPC.

---

### Faza 3 — Data Modes + Fixtures

**Cel:** Szybka iteracja i powtarzalność.

**Zakres:**
- **Fake mode**: fixture loader, instant responses.
- **Real mode**: API provider interface (YouTube Data API).
- **Record mode**: proxy zapisuje real responses → fixture JSON.
- Provider interface (`DataProvider`): `getChannelStats()`, `getVideoStats()`, `getRecentVideos()`.
- Cache layer: TTL-based, per-endpoint.
- Rate limiter: token bucket algorithm, konfigurowalny per provider.

**Definition of Done:**
- Przełączanie fake/real bez zmian w UI (env variable + runtime toggle).
- Record mode tworzy dane odtwarzalne w fake mode.
- Rate limiter blokuje nadmiar requestów z logiem.

---

### Faza 4 — Data Pipeline + Feature Engineering *(przeorganizowane — wcześniej niż w oryginale)*

**Cel:** Automatyczny pipeline od surowych danych do features gotowych do ML.

**Zakres:**
- **ETL orchestrator**: ingestion → validation → staging → transform.
- **Validation step**: Zod schema + range checks + freshness checks.
- **Staging layer**: normalizacja nazw, typów, deduplikacja.
- **Transform layer**: agregacje dzienne/tygodniowe/miesięczne.
- **Feature engineering**: automatyczne generowanie features z fact tables (tabela z sekcji 4.3).
- **Data lineage**: `data_lineage` table — kto/kiedy/skąd.
- Tabele: `stg_videos`, `stg_channels`, `ml_features`, `data_lineage`.

**Definition of Done:**
- Pipeline przetwarza fixture data end-to-end.
- Features generowane deterministycznie (te same dane → te same features).
- Brakujące dane oznaczone explicite (NULL + reason), nie interpolowane.
- Data lineage query: "skąd pochodzi ta wartość?" zwraca pełną ścieżkę.

---

### Faza 5 — Sync Orchestrator

**Cel:** Kontrolowany, idempotentny, resilient sync.

**Zakres:**
- Etapy sync z postępem procentowym (events do UI).
- Checkpointy i resume po przerwaniu.
- `sync_runs` table: status, etap, duration, error log.
- Blokada równoległego sync (mutex).
- Automatic retry z exponential backoff dla API errors.
- Post-sync hook: automatycznie uruchamia data pipeline (Faza 4).
- Eventy `sync:progress`, `sync:complete`, `sync:error` do UI.

**Definition of Done:**
- Sync można przerwać i wznowić bez utraty spójności (test: kill w połowie → resume).
- Po sync automatycznie uruchamia się pipeline i generuje fresh features.
- Error reporting: UI pokazuje co poszło nie tak z actionable message.

---

### Faza 6 — Bazowy ML Framework *(przesunięte z Fazy 10!)*

**Cel:** Działający framework ML z pierwszym modelem prognostycznym.

**Zakres:**
- **Model Registry**: `ml_models` table (id, type, version, config, status, metrics).
- **Training pipeline**: feature selection → train → validate → store.
- **Backtesting**: rolling window cross-validation.
- **Metryki**: MAE, sMAPE, MASE (Mean Absolute Scaled Error).
- **Quality gate**: model aktywowany tylko gdy metryki < threshold.
- **Pierwszy model**: Linear Regression + Exponential Smoothing (Holt-Winters) na views/subscribers.
  - Dlaczego proste modele najpierw: szybkie, interpretowalné, baseline do porównań.
- **Prediction storage**: `ml_predictions` (model_id, target, horizon, predicted, actual, confidence_interval).
- **Confidence levels**: p10/p50/p90 (nie tylko point estimate).
- **Graceful degradation**: < 30 dni danych → ukryj forecast, pokaż trend line.
- **Shadow mode**: nowy model generuje predykcje obok starego, nie jest aktywny.

**Algorytmy (roadmap wewnątrz fazy):**

| Priorytet | Algorytm | Cel | Kiedy dodać |
|-----------|----------|-----|-------------|
| P0 | Exponential Smoothing (Holt-Winters) | Baseline forecast | Na start |
| P0 | Linear Regression + trend decomposition | Trend detection | Na start |
| P1 | ARIMA/SARIMA | Sezonowość | Po walidacji baseline |
| P1 | Prophet (opcjonalnie) | Automatyczny forecast | Jeśli ARIMA niewystarczający |
| P2 | Gradient Boosted Trees (LightGBM) | Feature-rich prediction | Gdy features stabilne |
| P3 | LSTM/Transformer | Zaawansowane sekwencje | Tylko jeśli P1/P2 niewystarczające |

**Definition of Done:**
- Holt-Winters i Linear Regression trenowane na fixture data.
- Backtesting raport: MAE, sMAPE per model per metryka.
- Quality gate blokuje kiepski model (test: model z random weights → nie aktywowany).
- Predictions z confidence intervals (p10/p50/p90).

---

### Faza 7 — Dashboard + Raporty + Eksport

**Cel:** Pierwsza duża wartość biznesowa — wizualizacja danych I predykcji.

**Zakres:**
- KPI cards (aktualne + delta + trend arrow).
- Timeseries chart z overlay predykcji ML (confidence band).
- Zakres dat: 7d / 30d / 90d / custom.
- Anomaly highlights na wykresach (punkty oznaczone czerwono).
- Pipeline raportu: sync → pipeline → ML → metrics → insights → render.
- HTML report template (Handlebars/React SSR).
- PDF generation (hidden BrowserWindow + print-to-PDF).
- Weekly export package: `report.pdf`, `top_videos.csv`, `kpi_summary.json`, `predictions.csv`.

**Definition of Done:**
- Dashboard renderuje real KPIs + ML predictions z confidence bands.
- Jeden klik generuje raport PDF z metrykami i predykcjami.
- Export package zawiera maszynowo czytelne formaty (CSV/JSON).

---

### Faza 8 — Auth + Profile + Settings

**Cel:** Multi-user, separacja środowisk.

**Zakres:**
- OAuth connect/disconnect/status (YouTube API).
- Multi-profile: tworzenie, wybór, przełączanie (osobne DB per profil).
- Settings per profil: API keys, LLM provider, report preferences, ML model preferences.
- Secure credential storage (Electron safeStorage API).

**Definition of Done:**
- Dwa profile działają niezależnie po restarcie.
- Credentials nie są w plaintext (safeStorage).
- Przełączenie profilu → czyste załadowanie danych tego profilu.

---

### Faza 9 — Import + Enrichment + Search

**Cel:** Pełna kontrola źródeł i wyszukiwania.

**Zakres:**
- Import CSV z mapowaniem kolumn, preview, walidacją (Zod schema).
- Import automatycznie triggeruje data pipeline (feature regeneration).
- Transkrypcje + parser SRT → `dim_transcript`.
- FTS5 full-text search + snippety + timestamp.
- Search results z relevance score i context.

**Definition of Done:**
- Importowane dane od razu widoczne na wykresach i w predictions.
- Wyszukiwanie zwraca wynik ze snippetem, timestampem i relevance score.
- Import invalid CSV → czytelny error z numerem wiersza i kolumny.

---

### Faza 10 — Anomaly Detection + Trend Analysis *(nowa faza)*

**Cel:** Automatyczne wykrywanie nietypowych zdarzeń i zmian trendów.

**Zakres:**
- **Anomaly detection**: Z-score + IQR (dual method, consensus = higher confidence).
- **Trend decomposition**: STL (Seasonal-Trend decomposition using LOESS).
- **Change point detection**: CUSUM algorithm.
- **Tabele**: `ml_anomalies` (timestamp, metric, severity, method, explanation).
- **Alert generation**: anomaly → insight z kontekstem ("Views spadły o 40% vs avg — prawdopodobna przyczyna: brak publikacji 5 dni").
- **UI**: anomalie zaznaczone na wykresach + feed anomalii z filtrowaniem.

**Definition of Done:**
- Anomaly detection znajduje znane anomalie w fixture data (test z planted outliers).
- Trend decomposition rozdziela seasonal/trend/residual.
- Change point detection poprawnie znajduje planted change points w fixtures.

---

### Faza 10.5 — Hardening (spójność liczb, regresje, trace, fundament pod Fazę 11)

**Cel:** Ustabilizować metryki i debugowalność pipeline przed asystentem LLM, aby każda liczba była reprodukowalna i łatwa do wyjaśnienia.

**Zakres (MVP, krótka faza):**
- **Golden DB**: dodać `fixtures/insight_golden.db` (3 kanały, ~20 filmów, 90 dni, edge-case: braki danych, spike, częściowe dni).
- **Snapshot tests**: uruchamianie contract queries i snapshoty JSON (minimum 20 zapytań):
  - overview `last30d` (`views`, `watch_time`, `avg_view_duration`, `ctr`),
  - top videos `last30d`,
  - compare `last7d` vs `previous7d`,
  - trend (`slope` + `confidence`) dla kluczowych metryk,
  - anomalies (punkty + score).
- Komendy testowe: `pnpm test:snapshots` i `pnpm test:snapshots:update` (świadoma aktualizacja).
- **Trace ID + lineage (minimum)**: każde wywołanie analityczne ma `trace_id`; logujemy operację, parametry, czas i liczbę rekordów; lineage zawiera tabelę, klucze główne, zakres czasu i filtry.
- **Semantic Layer (krok 1)**: katalog 15-25 kluczowych metryk + wspólny interfejs pobierania; nowy kod korzysta z katalogu, migracja starego kodu tylko dla krytycznych ekranów.
- **ADR mini + scope freeze (operacyjnie)**:
  - `docs/adr/000-template.md`,
  - minimum 2 ADR (format evidence/lineage, model metryk; opcjonalnie trzeci: zasady cache pod Fazę 12),
  - obowiązkowy scope freeze „robimy / nie robimy" przed startem kolejnych faz.

**Definition of Done:**
- Snapshot tests działają local/CI i wykrywają regresję liczbową.
- `trace_id` jest generowany i zapisany dla kluczowych operacji analitycznych.
- Semantic Layer zawiera min. 15-25 metryk i jest użyty w co najmniej 2 krytycznych miejscach UI.
- W repo istnieje template ADR i co najmniej 2 ADR związane z evidence/metrykami.

---

### Faza 11 — LLM Assistant (Lite)

**Cel:** Dostarczyć praktycznego asystenta bez budowania pełnej platformy LLM — tylko bezpieczne narzędzia i odpowiedzi oparte o evidence.

**Zakres:**
- **Whitelist tooli** (bez dowolnego SQL na start): executor korzysta tylko z zatwierdzonych narzędzi read-only.
- Structured output JSON: `answer`, `evidence[]`, `confidence`, `follow_up_questions[]`.
- Persist rozmów i evidence w SQLite.
- UI: zakładka asystenta z chatem, historią i evidence viewer.
- LocalStub offline działa deterministycznie.
- Minimalne streszczanie długich rozmów (context compaction).
- Executor zawsze robi realne lookupy przez tools (nigdy odpowiedź „z głowy").

**Definition of Done:**
- Pytanie "jak szły moje filmy w ostatnim miesiącu?" → odpowiedź z konkretnymi liczbami z DB.
- LocalStub mode zwraca poprawną odpowiedź bez zewnętrznego API.
- Evidence linki prowadzą do konkretnych rekordów.
- UI + IPC dla asystenta są stabilne: `lint/typecheck/test/build` przechodzą.

---

### Faza 12 — Performance i stabilność (cache + inkrementalność)

**Cel:** Przyspieszyć analitykę po ustabilizowaniu metryk i uprościć ponowne przeliczenia bez naruszania spójności danych.

**Zakres:**
- Cache wyników analitycznych po `(metric_id, params_hash)`.
- TTL + invalidacja cache po sync/import.
- Inkrementalne przeliczenia tam, gdzie ma to sens kosztowo.
- Mierniki czasu wykonania i spójny monitoring wydajności (p50/p95 + cache hit-rate).
- Dodatkowo: podstawowe guardrails kosztowe i bezpieczeństwa utrzymane jako polityki runtime (bez budowy dużej platformy).

**Definition of Done:**
- Cache działa i raportuje hit/miss dla kluczowych zapytań.
- Po sync/import cache jest poprawnie unieważniany.
- Inkrementalne ścieżki skracają czas wybranych przeliczeń bez zmiany wyniku merytorycznego.

---

### Faza 13 — Quality Scoring *(usprawnione)*

**Cel:** Wielowymiarowy ranking jakości contentu.

**Zakres:**

**Składowe score:**

| Składowa | Waga (default) | Opis | Obliczanie |
|----------|----------------|------|------------|
| Velocity | 0.25 | Szybkość zbierania views | views_7d / avg_views_7d (percentile w kanale) |
| Efficiency | 0.20 | Views per subscriber | views / subscribers (normalized) |
| Engagement | 0.25 | Interakcja widzów | (likes + comments * 3) / views |
| Retention | 0.15 | Utrzymanie widzów | avg_watch_time / duration (jeśli dostępne) |
| Consistency | 0.15 | Stabilność wyników | 1 - coefficient_of_variation(views_daily) |

- **Normalizacja**: percentile rank wewnątrz kanału (nie sigmoid — percentile jest bardziej interpretowalna i odporna na outliers).
- **Confidence level**: `high` (>60 dni danych), `medium` (30-60), `low` (<30).
- **Trend**: score_current vs score_30d_ago → improving / declining / stable.
- **Wagi konfigurowalne** przez użytkownika (ale sensowne defaults).
- Tabela: `agg_quality_scores` (video_id, score, components, confidence, calculated_at).

**Definition of Done:**
- Ranking z final score i breakdown składowych.
- Test: video z planted high engagement → wysoki score.
- Confidence labels poprawne dla różnych długości danych.

---

### Faza 14 — Competitor Intelligence

**Cel:** Systemowa analiza konkurencji.

**Zakres:**
- Schema konkurencji: `dim_competitor`, `fact_competitor_day`.
- Sync danych publicznych (YouTube Data API — publiczne statystyki).
- Snapshoty dzienne z delta detection.
- **Metryki porównawcze**: relative growth, market share (w niszy), content frequency comparison.
- **Hit detection**: video z views > 3σ kanału = "hit".
- **Momentum scoring**: weighted recent growth vs historical.
- Radar chart w UI: ty vs konkurencja (5-6 osi).
- Alert: "Konkurent X opublikował hit — 500% powyżej ich średniej".

**Definition of Done:**
- Competitor data syncs i widoczna w dashboardzie.
- Hit detection poprawnie flaguje outlier videos.
- Radar chart renderuje porównanie min. 3 kanałów.

---

### Faza 15 — Topic Intelligence *(usprawnione)*

**Cel:** Wykrywanie luk tematycznych i trendów topikowych.

**Zakres:**
- **Text processing**: tokenizacja + stop words + stemming (dla PL i EN).
- **TF-IDF** na tytułach + description + tagach → topic vectors.
- **Clustering**: K-Means z automatycznym doborem K (elbow method + silhouette score).
- **Topic pressure**: ile views generuje dany topic cluster w czasie.
- **Gap detection**: "tematy popularne w niszy, których TY nie pokrywasz".
- **Cannibalization detection**: "te 3 filmy konkurują o ten sam topic — jeden kradnie views drugiemu".
- **Topic trend**: rising / stable / declining per cluster.
- **Tabele**: `dim_topic_cluster`, `fact_topic_pressure_day`, `agg_topic_gaps`.

**Definition of Done:**
- Clustering grupuje filmy w sensowne tematy (manual review fixtures).
- Gap detection pokazuje luki z uzasadnieniem.
- Cannibalization check: planted overlapping topics → flagowane.

---

### Faza 16 — Planning System

**Cel:** Backlog + kalendarz + ryzyko kanibalizacji.

**Zakres:**
- Backlog CRUD: pomysły na filmy z metadanymi.
- **Score pomysłu**: topic_momentum × (1 - cannibalization_risk) × gap_opportunity × effort_inverse.
- Similarity check tytułów: cosine similarity vs istniejące filmy.
- **Optimal publish timing**: analiza historyczna → najlepszy dzień/godzina.
- Calendar view: zaplanowane + opublikowane + predykcje wyników.
- Risk warnings: kanibalizacja, oversaturation, off-trend.

**Definition of Done:**
- Dodając plan, użytkownik widzi score, ryzyko, sugerowany timing.
- Similarity > 0.7 → warning z linkiem do podobnego filmu.

---

### Faza 17 — Plugins (Insights/Alerts) — SKIP w trybie solo

**Cel:** Świadome wyłączenie zakresu plugin runtime dla pojedynczego użytkownika.

**Zakres:**
- Brak implementacji plugin managera i lifecycle hooks.
- Brak built-in pluginów i dedykowanego notification center.
- Insighty/alerty pozostają ewentualnie jako część core UI lub diagnostyki, bez warstwy pluginów.

**Definition of Done:**
- Faza oznaczona jako `SKIP (solo)` w dokumentacji i roadmapie.
- Brak nowych zależności/runtime związanych z plugin architecture.

---

### Faza 18 — Diagnostics + Recovery

**Cel:** Samodiagnoza i naprawa.

**Zakres:**
- `perf_events`: czasy każdego etapu pipeline, sync, ML.
- Diagnostics modal w UI: health check wszystkich modułów.
- DB integrity check: foreign keys, orphaned records, index health.
- ML model health: drift detection (prediction error trend), data freshness.
- Safe mode overlay: wyłącza problematyczny moduł, app działa dalej.
- Recovery actions: VACUUM, reindex FTS5, reset cache, retrain model, re-run pipeline.

**Definition of Done:**
- Health check wykrywa planted problems w fixture (broken FK, stale predictions).
- Recovery actions naprawiają wykryte problemy.

---

### Faza 19 — Polish + Local UX (bez packaging/telemetry)

**Cel:** Dopracowanie codziennego UX dla pojedynczego użytkownika, bez wymagań dystrybucyjnych.

**Zakres:**
- Responsive layout + dark mode.
- Keyboard shortcuts.
- Onboarding flow (first-run wizard).
- Lokalny "one-click weekly package" → sync + pipeline + ML + report + export (bez publikacji paczek instalacyjnych).

**Definition of Done:**
- Aplikacja działa stabilnie lokalnie po `pnpm dev` / lokalnym buildzie.
- Dark mode pełny.
- Onboarding prowadzi użytkownika pierwszego uruchomienia.

---

## 6. Rytuał realizacji każdej fazy

Każdy feature w tej kolejności (bez wyjątków):

1. **Kontrakt** — `shared`: DTO, Zod schema, eventy, IPC contract.
2. **Migracja DB** — nowe tabele/kolumny w `core`.
3. **Logika** — implementacja w odpowiednim pakiecie (`core`/`sync`/`ml`/etc.).
4. **IPC** — handler w main, hook w preload.
5. **UI** — komponenty + Zustand store + TanStack Query hooks.
6. **Testy** — unit (logika) + integration (DB + IPC) + smoke (UI renderuje).
7. **Dokumentacja** — README modułu, changelog, contracts update.

**Anty-regresja check po każdej fazie:**
- `pnpm lint` — 0 errors.
- `pnpm typecheck` — 0 errors.
- `pnpm test` — all pass.
- `pnpm build` — succeeds.
- Żadne istniejące IPC kontrakty nie zostały złamane (backwards compatible).
- Lokalnie uruchamiaj komendy przez `corepack pnpm ...`, aby natywne zależności (np. `better-sqlite3`) były budowane pod aktywną wersję Node (w projekcie `>=22`).

---

## 7. Definition of Ready (DoR)

Task wchodzi do realizacji **tylko** gdy zawiera:

- [ ] Cel biznesowy (jedno zdanie).
- [ ] Zakres plików/modułów (lista).
- [ ] Kontrakt wejścia/wyjścia (DTO types).
- [ ] Kryteria akceptacji (testowalne).
- [ ] Lista testów do napisania.
- [ ] Lista rzeczy „poza zakresem" (co NIE wchodzi).
- [ ] Dependencies: jakie fazy/taski muszą być ukończone.

---

## 8. Definition of Done (DoD)

Task jest zamknięty **dopiero** gdy:

- [ ] Typy i walidacje są kompletne (no `any`, no `as` casts without justification).
- [ ] Testy przechodzą lokalnie i w CI.
- [ ] Performance budget nie przekroczony.
- [ ] Brak naruszeń granic architektury (lint rule).
- [ ] Brak circular dependencies.
- [ ] Dokumentacja zaktualizowana.
- [ ] Wpis w `CHANGELOG_AI.md` (jeśli zmiana AI).
- [ ] Regression check: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

## 9. KPI postępu projektu

| KPI | Target | Pomiar |
|-----|--------|--------|
| % faz ukończonych | 100% | Fazy z DoD ✓ |
| CI pass rate | > 95% | GitHub Actions |
| Test coverage (core/ml/analytics) | > 80% | Vitest coverage |
| IPC response time (p95) | < 100ms | `perf_events` |
| ML prediction accuracy (sMAPE) | < 20% | `ml_backtests` |
| Cache hit-rate (API) | > 60% | `sync_runs` stats |
| Cache hit-rate (LLM) | > 30% | `llm_usage` stats |
| Regresje na fazę | < 2 | Bug tracker |
| Anomaly detection precision | > 80% | Test na golden dataset |

---

## 10. Plan realizacji — milestone'y

### Milestone 1: Foundation (Fazy 0-2)
**Wynik:** Działający szkielet z DB, IPC, i pustym dashboardem na fixture data.

### Milestone 2: Data Engine (Fazy 3-5)
**Wynik:** Pełny pipeline: sync → ETL → features. Fake/Real/Record modes.

### Milestone 3: Intelligence Core (Fazy 6-7)
**Wynik:** ML forecasting + dashboard z predykcjami i raportami PDF.

### Milestone 4: User-Ready (Fazy 8-9)
**Wynik:** Auth, multi-profile, import, search. Aplikacja użyteczna solo.

### Milestone 5: Analytics Beast (Fazy 10-15, z hardeningiem 10.5)
**Wynik:** Anomaly detection + hardening liczb, LLM assistant Lite, quality scoring, competitor intel, topic intel, planning. **Pełny "potwór analityczny" budowany etapowo.**

### Milestone 6: Production (Fazy 16-19)
**Wynik:** Diagnostics + polish pod użycie lokalne single-user (bez plugin runtime, packagingu dystrybucyjnego i telemetry opt-in).

---

## 11. Współpraca z wieloma LLM

1. Każda sesja AI zaczyna od przeczytania:
   - `AGENTS.md`
   - `docs/architecture/overview.md`
   - Runbook dla konkretnego zadania.
   - `CHANGELOG_AI.md` (ostatnie 5 wpisów — co się zmieniło).

2. Każda sesja AI kończy się:
   - Checklistą DoD.
   - Wpisem do `CHANGELOG_AI.md`.
   - Listą ryzyk.
   - "Następny krok" — co powinien zrobić kolejny model.

2a. Przed każdą nową fazą obowiązuje mini ADR + 10-minutowy scope freeze (jawne „robimy / nie robimy").

3. **Zakaz "dużych refactorów bez ADR"** — każda zmiana architektury wymaga decyzji.

4. **Jeden PR = jedna odpowiedzialność** — nie mieszamy feature'ów.

5. **Shadow mode dla zmian ML** — nowy model nie zastępuje starego automatycznie.

---

## 12. Decyzje architektoniczne

| Obszar | Decyzja | Uzasadnienie |
|--------|---------|--------------|
| Runtime | Electron | Offline-first, dostęp do FS/SQLite, PDF generation |
| Język | TypeScript strict | Type safety, tooling, AI-friendly |
| Baza | SQLite (better-sqlite3) | Zero-config, portable, wystarczająca dla single-user |
| State (UI) | Zustand + TanStack Query | Zustand: simple sync state. TQ: async IPC cache/invalidation |
| Komunikacja | IPC + Zod DTO | Type-safe boundary, walidacja na obu stronach |
| Raporty | HTML + PDF (print-to-PDF) | Offline, customizable, no server needed |
| LLM | Provider registry + LocalStub | Vendor-agnostic, testowalne offline |
| ML | Custom pipeline + model registry | Kontrola, reprodukowalność, nie black-box SaaS |
| ML baseline | Holt-Winters + Linear Regression | Proste, interpretowalné, szybkie, dobre baseline |
| Normalizacja scores | Percentile rank | Odporna na outliers, intuicyjna interpretacja |
| Feature engineering | Automated z fact tables | Deterministic, versioned, reproducible |
| Text analysis | TF-IDF + K-Means | Proste, nie wymaga GPU, wystarczające dla metadata |

---

## 13. Risk register

| Ryzyko | Prawdopodobieństwo | Impact | Mitigation |
|--------|-------------------|--------|------------|
| YouTube API rate limits | Wysokie | Średni | Cache, rate limiter, incremental sync |
| Za mało danych dla ML | Średnie | Wysoki | Graceful degradation, minimum data requirements |
| SQLite performance przy dużych danych | Niskie | Średni | Indexing strategy, VACUUM schedule, partitioning views |
| Electron memory leaks | Średnie | Średni | Perf monitoring, memory budget, worker offloading |
| LLM cost explosion | Średnie | Średni | Hard limits, cache, local models as default |
| Model drift | Średnie | Średni | Periodic backtesting, shadow mode, alerts |
| Breaking changes w API providerów | Niskie | Wysoki | Adapter pattern, version pinning, integration tests |

---

## 14. Checklista startowa (do odhaczania)

- [x] Utworzyć strukturę monorepo (pnpm workspaces). ✅ Faza 0
- [x] Skonfigurować TS strict + ESLint flat config + Prettier + Vitest. ✅ Faza 0
- [x] CI pipeline (GitHub Actions): lint + typecheck + test. ✅ Faza 0
- [x] Pakiet `shared`: DTO, Zod schemas, AppError, events, IPC contracts. ✅ Faza 0
- [x] Pakiet `core`: SQLite + migracje + query/mutation layer. ✅ Faza 1
- [x] Pakiet `data-pipeline`: ETL skeleton + feature engineering stubs. ✅ Faza 4
- [x] Pakiet `sync`: orchestrator sync + checkpoint/resume + retry/backoff + mutex. ✅ Faza 5
- [x] Pakiet `ml`: model registry + training pipeline stubs. ✅ Faza 6
- [x] Pakiet `reports`: generator raportu + eksport JSON/CSV/HTML. ✅ Faza 7
- [x] App `desktop`: Electron main + preload (security hardened). ✅ Faza 0
- [x] App `ui`: React + Zustand + TanStack Query skeleton. ✅ Faza 0
- [x] Minimal IPC: `app:getStatus`, `db:getKpis`, `db:getTimeseries` + rozszerzenia `app:getDataMode`, `app:setDataMode`, `app:probeDataMode`, `profile:list`, `profile:create`, `profile:setActive`, `settings:get`, `settings:update`, `auth:getStatus`, `auth:connect`, `auth:disconnect`, `sync:start`, `sync:resume`, `ml:runBaseline`, `ml:getForecast`, `ml:detectAnomalies`, `ml:getAnomalies`, `ml:getTrend`, `analytics:getQualityScores`, `analytics:syncCompetitors`, `analytics:getCompetitorInsights`, `analytics:runTopicIntelligence`, `analytics:getTopicIntelligence`, `planning:generatePlan`, `planning:getPlan`, `diagnostics:getHealth`, `diagnostics:runRecovery`, `reports:generate`, `reports:export`, `import:previewCsv`, `import:runCsv`, `search:content`, `assistant:ask`, `assistant:listThreads`, `assistant:getThreadMessages`. DONE Faza 2/3/5/6/7/8/9/10/11/13/14/15/16/18
- [x] Realistyczne fixture data (90 dni, 50 filmów). ✅ Faza 1
- [x] Fake mode (runtime toggle + loader fixture). ✅ Faza 3
- [x] Record mode + replay fixture (real -> fixture -> fake). ✅ Faza 3
- [x] Pierwszy dashboard na fixture data. ✅ Faza 2/3
- [x] Multi-profile + settings per profil + auth safeStorage. ✅ Faza 8
- [x] Dokumenty: `AGENTS.md`, `architecture/overview.md`, `architecture/data-flow.md`. ✅ Faza 0

- [x] Import CSV + FTS5 search + integracje IPC/UI + testy integracyjne. DONE Faza 9
- [x] Anomaly detection + trend decomposition + CUSUM + UI feed + overlay + testy integracyjne. DONE Faza 10
- [x] Hardening 10.5: golden DB + snapshot tests + trace_id + lineage + Semantic Layer (step 1).
- [x] Hardening 10.5: docs/adr/000-template.md + minimum 2 ADR + scope freeze checklist.
- [x] LLM Assistant Lite: whitelist read-only tools + LocalStub + persystencja rozmow/evidence + UI chat + testy integracyjne. DONE Faza 11
- [x] Performance i stabilnosc: cache wynikow analitycznych + invalidacja po sync/import + inkrementalny pipeline + monitoring p50/p95/hit-rate. DONE Faza 12
- [x] Quality Scoring: tabela `agg_quality_scores`, silnik komponentow (percentile rank), confidence labels i integracja IPC/UI. DONE Faza 13
- [x] Competitor Intelligence: `dim_competitor` + `fact_competitor_day`, sync snapshotow, hit detection > 3 sigma, momentum ranking i panel UI. DONE Faza 14
- [x] Topic Intelligence: `dim_topic_cluster` + `fact_topic_pressure_day` + `agg_topic_gaps`, klasteryzacja i gap detection z integracją IPC/UI. DONE Faza 15
- [x] Planning System: `planning_plans` + `planning_recommendations`, planner deterministyczny, evidence/rationale/confidence, integracja IPC/UI. DONE Faza 16
- [x] Diagnostics + Recovery: `diagnostics:getHealth` + `diagnostics:runRecovery`, health checks DB/cache/pipeline/IPC, akcje recovery i panel UI. DONE Faza 18
- [ ] ADR-001: Wybór stack'u technologicznego.

---

> Ten dokument jest „żywy": aktualizować po każdej większej decyzji, aby zespół i modele AI pracowały zawsze na tej samej, aktualnej mapie projektu.
