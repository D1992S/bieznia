# Plan realizacji projektu (AI-first)

> Cel: zbudowaÄ‡ **analitycznÄ… maszynÄ™** â€” desktop app dla content creatorĂłw (YouTube), ktĂłra zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakoĹ›Ä‡ contentu i daje konkretne rekomendacje oparte na evidence. Jedno, trwaĹ‚e ĹşrĂłdĹ‚o prawdy dla rozwoju krok po kroku.

---

## 1. Zasady prowadzenia projektu

1. **Kontrakt przed implementacjÄ…**
   - Najpierw: DTO, eventy, IPC contract, schema DB, walidacje (Zod).
   - PĂłĹşniej: logika i UI.
   - KaĹĽdy kontrakt ma wersjÄ™ (`v1`, `v2`) â€” nigdy nie Ĺ‚amiemy istniejÄ…cego API, dodajemy nowy endpoint.

2. **Jedno ĹşrĂłdĹ‚o prawdy dla danych**
   - SQLite + migracje (forward-only, brak rollback migracji w produkcji).
   - Brak stanu biznesowego â€žtylko w UI" â€” UI jest projekcjÄ… stanu DB.
   - KaĹĽda zmiana stanu przechodzi przez dedykowany mutation layer, nie raw SQL.

3. **ĹšcisĹ‚e granice moduĹ‚Ăłw**
   - UI nie dotyka DB i systemu plikĂłw.
   - Komunikacja wyĹ‚Ä…cznie przez IPC + DTO.
   - Dependency rule: `shared` â† `core` â† `sync/reports/llm/ml` â† `apps`.
   - Zakaz circular dependencies â€” wymuszane przez lint rule.

4. **DeterministycznoĹ›Ä‡**
   - Jawne sortowanie, seeded RNG, fixtures, checkpointy.
   - Te same wejĹ›cia = te same wyniki (krytyczne dla reprodukowalnoĹ›ci ML).
   - KaĹĽdy model ML ma snapshot konfiguracji + wersjÄ™ danych treningowych.

5. **Tryby pracy danych**
   - **Fake mode**: fixtures (instant, offline, testy).
   - **Record mode**: nagrywanie real API â†’ fixture (budowa golden datasets).
   - **Real mode**: produkcja.
   - KaĹĽdy moduĹ‚ premium (LLM/ML/sync/competitor) ma LocalStub fallback.

6. **Jasna obsĹ‚uga bĹ‚Ä™dĂłw**
   - WspĂłlny standard `AppError` z kodami, severity, kontekstem i stack trace.
   - Brak cichych fallbackĂłw â€” kaĹĽdy error logowany i widoczny w diagnostyce.
   - Graceful degradation: gdy moduĹ‚ padnie, reszta dziaĹ‚a (circuit breaker pattern).

7. **Performance budgets** *(nowe)*
   - IPC response: < 100ms (p95) dla queries, < 500ms dla mutacji.
   - Dashboard render: < 200ms po otrzymaniu danych.
   - ML inference: < 2s per model. Training: background worker, nie blokuje UI.
   - Sync: progress events co 1s minimum (UX responsiveness).

8. **Data quality first** *(nowe)*
   - KaĹĽdy import/sync przechodzi walidacjÄ™ schema + range check + freshness check.
   - BrakujÄ…ce dane: explicite oznaczane (NULL z reason), nie interpolowane cicho.
   - Data lineage: kaĹĽdy rekord wie skÄ…d pochodzi (source, timestamp, sync_run_id).

9. **JÄ™zyk aplikacji â€” POLSKI**
   - CaĹ‚y interfejs uĹĽytkownika (UI) jest **wyĹ‚Ä…cznie po polsku**: etykiety, komunikaty, placeholdery, tooltips, alerty, raporty, opisy na dashboardzie.
   - Komunikaty bĹ‚Ä™dĂłw widoczne dla uĹĽytkownika â€” po polsku.
   - Nazwy zmiennych/funkcji/typĂłw â€” po angielsku (standard branĹĽowy).
   - Komentarze w kodzie â€” po angielsku.
   - SzczegĂłĹ‚owe zasady w `AGENTS.md` sekcja â€žJÄ™zyk aplikacji".

10. **ADR mini + scope freeze przed kaĹĽdÄ… nowÄ… fazÄ…** *(nowe, staĹ‚e)*
   - Przed startem fazy tworzymy mini ADR (krĂłtki kontekst, decyzja, alternatywy, ryzyka, metryki sukcesu).
   - Dodatkowo 10-minutowy **scope freeze**: jawna lista â€žrobimy / nie robimy" dla bieĹĽÄ…cej fazy.
   - KaĹĽdy PR fazowy linkuje ADR i potwierdza brak rozszerzania scope poza freeze.

---

## 2. Struktura repo (docelowa)

```text
/apps
  /desktop          # Electron main + preload
  /ui               # Renderer (React + Zustand + TanStack Query)
/packages
  /shared           # DTO, Zod schema, IPC contracts, event names, AppError
  /core             # DB schema, migracje, query layer, mutation layer
  /data-pipeline    # ETL, preprocessing, normalizacja, feature engineering  â† NOWE
  /sync             # Orchestrator sync + providers + cache/rate limit
  /reports          # KPI, timeseries, raporty HTML/PDF
  /llm              # provider registry + planner/executor/summarizer
  /ml               # training, forecasting, nowcast, anomaly, backtesting
  /analytics        # quality scoring, competitor intel, topic intel  â† NOWE (wydzielone)
  /plugins          # poza zakresem trybu solo (brak plugin runtime)
  /diagnostics      # integrity checks + recovery + perf monitoring
/docs
  /architecture
  /contracts
  /runbooks
  /prompts
/ADR                # Architectural Decision Records
/fixtures           # Golden datasets dla testĂłw i fake mode  â† NOWE
```

### Zmiany vs. oryginalny plan:
- **`/packages/data-pipeline`** â€” wydzielony ETL i feature engineering (wczeĹ›niej implicite w `core`).
- **`/packages/analytics`** â€” quality scoring + competitor + topic intel wydzielone z `reports` (inne odpowiedzialnoĹ›ci).
- **`/fixtures`** â€” top-level golden datasets, nie rozrzucone po pakietach.
- **UI stack**: React + **Zustand** (state) + **TanStack Query** (async state / IPC queries) â€” brakowaĹ‚o strategii state management.

---

## 3. Dokumentacja wymagana pod wspĂłĹ‚pracÄ™ z AI

### 3.1 Pliki obowiÄ…zkowe

| Plik | Cel |
|------|-----|
| `AGENTS.md` (root) | Zasady modyfikacji kodu |
| `docs/architecture/overview.md` | Mapa moduĹ‚Ăłw i przepĹ‚yw danych |
| `docs/architecture/data-flow.md` | Pipeline danych: ingestion â†’ storage â†’ processing â†’ ML â†’ UI |
| `docs/contracts/*.md` | Kontrakty IPC, eventy, DB, bĹ‚Ä™dy |
| `docs/runbooks/*.md` | Jak dodaÄ‡ feature bez Ĺ‚amania architektury |
| `docs/prompts/*.md` | Gotowe prompty do typowych zadaĹ„ |
| `ADR/*.md` | Decyzje architektoniczne |
| `CHANGELOG_AI.md` | Dziennik zmian AI |

### 3.2 Standard opisu moduĹ‚u

KaĹĽdy pakiet **musi** mieÄ‡ `README.md` zawierajÄ…ce:

- **OdpowiedzialnoĹ›Ä‡** (1-2 zdania, co robi i czego NIE robi).
- **WejĹ›cia/wyjĹ›cia** (typy, przykĹ‚ady).
- **ZaleĹĽnoĹ›ci** (od jakich pakietĂłw zaleĹĽy).
- **Public API** (lista eksportowanych funkcji/typĂłw).
- **PrzykĹ‚adowe uĹĽycie** (kod).
- **Performance characteristics** (oczekiwane czasy, limity danych).

### 3.3 ObowiÄ…zkowe logowanie zmian (PR/commit)

Aby inny model mĂłgĹ‚ bezpiecznie kontynuowaÄ‡ pracÄ™, **kaĹĽda ingerencja w repo musi zostawiÄ‡ jawny Ĺ›lad zmian**.

#### ReguĹ‚y obowiÄ…zkowe

1. **KaĹĽdy PR musi zawieraÄ‡ sekcjÄ™ â€žCo zmieniono"** (lista plikĂłw + krĂłtki opis decyzji).
2. **KaĹĽdy PR musi zawieraÄ‡ sekcjÄ™ â€žWpĹ‚yw i ryzyko"** (co moĹĽe siÄ™ wysypaÄ‡).
3. **KaĹĽdy PR musi zawieraÄ‡ sekcjÄ™ â€žJak zweryfikowano"** (komendy testĂłw/checkĂłw i wynik).
4. **KaĹĽda zmiana AI musi dopisaÄ‡ wpis do `CHANGELOG_AI.md`**.
5. **Przy zmianie architektury wymagany jest ADR** (linkowany w PR).
6. **Brak tych sekcji = PR nie jest gotowy do merge**.

#### Template wpisu do `CHANGELOG_AI.md`

```
- Data:
- Autor (model):
- Zakres plikĂłw:
- Co zmieniono:
- Dlaczego:
- Ryzyko/regresja:
- Jak zweryfikowano:
- NastÄ™pny krok:
```

---

## 4. Architektura danych (nowa sekcja â€” krytyczna dla "potwora analitycznego")

### 4.1 Model danych â€” warstwy

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  RAW LAYER (surowe dane z API/importu)      â”‚
â”‚  raw_api_responses, raw_csv_imports         â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  STAGING LAYER (wystandaryzowane)           â”‚
â”‚  stg_videos, stg_channels, stg_metrics     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  DIMENSION TABLES                           â”‚
â”‚  dim_channel, dim_video, dim_topic          â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  FACT TABLES (metryki dzienne)              â”‚
â”‚  fact_channel_day, fact_video_day           â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  ANALYTICS LAYER (przetworzone)             â”‚
â”‚  agg_kpi_daily, agg_trends, agg_forecasts  â”‚
â”‚  agg_quality_scores, agg_topic_clusters     â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  ML LAYER (modele i predykcje)              â”‚
â”‚  ml_models, ml_predictions, ml_backtests    â”‚
â”‚  ml_features, ml_anomalies                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 4.2 Pipeline danych (ETL)

```
Ingestion â†’ Validation â†’ Staging â†’ Transform â†’ Analytics â†’ ML â†’ Presentation
    â”‚            â”‚           â”‚          â”‚           â”‚        â”‚        â”‚
    â–Ľ            â–Ľ           â–Ľ          â–Ľ           â–Ľ        â–Ľ        â–Ľ
  API/CSV    Schema+Range  Normalize  Features   KPIs    Predict   UI/PDF
  Import     Freshness     Dedupe     Engineer   Trends  Anomaly   Export
             NullReason    Upsert     Aggregate  Score   Forecast
```

KaĹĽdy krok pipeline'u:
- Ma **input/output schema** (Zod).
- Loguje **czas wykonania** i **liczbÄ™ rekordĂłw**.
- Przy bĹ‚Ä™dzie: **retry z backoff** (ingestion) lub **skip + log** (transform).
- Zapisuje **data lineage** (source â†’ transform â†’ output).

### 4.3 Feature Engineering (dla ML)

Cechy generowane automatycznie z fact tables:

| Kategoria | PrzykĹ‚adowe features |
|-----------|---------------------|
| **Velocity** | views_7d, views_30d, views_acceleration, publish_frequency |
| **Engagement** | like_rate, comment_rate, avg_watch_time, retention_curve_slope |
| **Growth** | subscriber_delta_7d, subscriber_acceleration, growth_consistency |
| **Temporal** | day_of_week, hour_of_publish, days_since_last_video, seasonal_index |
| **Content** | title_length, tag_count, description_length, thumbnail_score_proxy |
| **Competitive** | relative_velocity_vs_niche, market_share_delta |

Features przechowywane w `ml_features` z wersjonowaniem (feature_set_version).

### 4.4 Strategia obsĹ‚ugi brakujÄ…cych danych

| Sytuacja | Strategia |
|----------|-----------|
| Brak metryk za dany dzieĹ„ | `NULL` + `missing_reason: 'no_sync'` â€” NIE interpolujemy |
| API zwraca 0 | Zapisujemy 0 â€” to jest valid data point |
| Za maĹ‚o danych do ML (< 30 dni) | Graceful degradation: pokazuj raw trends, ukryj forecast |
| Za maĹ‚o danych do quality score | Partial score z flagÄ… `confidence: 'low'` |
| Outlier detection | Z-score > 3Ď: flagujemy, NIE usuwamy. UĹĽytkownik decyduje |

---

## 5. Fazy realizacji (zoptymalizowana kolejnoĹ›Ä‡)

### Zmiana kolejnoĹ›ci vs. oryginalny plan

**Problem w oryginalnym planie:** ML i analytics dopiero w fazach 10-14, co oznacza ĹĽe przez 60% developmentu app nie robi tego, do czego jest przeznaczona.

**Nowa strategia:** WczeĹ›niejsze wprowadzenie data pipeline i bazowego ML, ĹĽeby kaĹĽda kolejna faza budowaĹ‚a na dziaĹ‚ajÄ…cej analityce.

---

### Faza 0 â€” Foundation

**Cel:** DziaĹ‚ajÄ…cy szkielet monorepo ze wszystkimi narzÄ™dziami dev.

**Zakres:**
- Monorepo (pnpm workspaces) z peĹ‚nÄ… strukturÄ… katalogĂłw.
- TypeScript strict + ESLint (flat config) + Prettier.
- Vitest setup (unit + integration configs).
- `shared`: DTO, Zod schemas, IPC contracts, event names, `AppError`, `Result<T,E>` type.
- Logger (structured JSON, severity levels, context).
- Zustand store skeleton w `ui`.
- Electron minimal shell (main + preload + renderer z React).

**Definition of Done:**
- `pnpm install` â†’ `pnpm build` â†’ `pnpm test` â†’ `pnpm lint` â€” wszystko przechodzi.
- Electron startuje i pokazuje "Hello" z React.
- Shared types importowalne z kaĹĽdego pakietu.
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

### Faza 1 â€” Data Core

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
- Seed fixtures: realistyczne dane 90-dniowe dla 1 kanaĹ‚u + 50 filmĂłw.

**Definition of Done:**
- Testy integracyjne DB przechodzÄ… (in-memory SQLite).
- Fixture zapisuje siÄ™ i odczytuje poprawnie.
- Migracje sÄ… idempotentne (podwĂłjne uruchomienie = brak bĹ‚Ä™du).
- Query results sÄ… deterministyczne (jawne ORDER BY wszÄ™dzie).

---

### Faza 2 â€” Desktop Backend + IPC

**Cel:** Bezpieczny, typowany most UI â†” backend.

**Zakres:**
- Electron security: contextIsolation, sandbox, no nodeIntegration w renderer.
- Single instance lock.
- IPC Router pattern: typed handler registration.
- Zod walidacja po obu stronach IPC.
- `AppError` serializacja/deserializacja przez IPC.
- TanStack Query hooks w UI do konsumpcji IPC (react-query adapter).
- Progress event streaming (IPC â†’ renderer).

**Minimalne komendy IPC (Faza 2):**

| Komenda | Input | Output |
|---------|-------|--------|
| `app:getStatus` | `void` | `AppStatusDTO` |
| `db:getKpis` | `KpiQueryDTO` | `KpiResultDTO` |
| `db:getTimeseries` | `TimeseriesQueryDTO` | `TimeseriesResultDTO` |
| `db:getChannelInfo` | `ChannelIdDTO` | `ChannelInfoDTO` |

**Definition of Done:**
- UI pobiera KPI/timeseries wyĹ‚Ä…cznie przez IPC.
- Invalid input â†’ AppError z czytelnym komunikatem (nie crash).
- E2E test: UI renderuje dane z DB przez IPC.

---

### Faza 3 â€” Data Modes + Fixtures

**Cel:** Szybka iteracja i powtarzalnoĹ›Ä‡.

**Zakres:**
- **Fake mode**: fixture loader, instant responses.
- **Real mode**: API provider interface (YouTube Data API).
- **Record mode**: proxy zapisuje real responses â†’ fixture JSON.
- Provider interface (`DataProvider`): `getChannelStats()`, `getVideoStats()`, `getRecentVideos()`.
- Cache layer: TTL-based, per-endpoint.
- Rate limiter: token bucket algorithm, konfigurowalny per provider.

**Definition of Done:**
- PrzeĹ‚Ä…czanie fake/real bez zmian w UI (env variable + runtime toggle).
- Record mode tworzy dane odtwarzalne w fake mode.
- Rate limiter blokuje nadmiar requestĂłw z logiem.

---

### Faza 4 â€” Data Pipeline + Feature Engineering *(przeorganizowane â€” wczeĹ›niej niĹĽ w oryginale)*

**Cel:** Automatyczny pipeline od surowych danych do features gotowych do ML.

**Zakres:**
- **ETL orchestrator**: ingestion â†’ validation â†’ staging â†’ transform.
- **Validation step**: Zod schema + range checks + freshness checks.
- **Staging layer**: normalizacja nazw, typĂłw, deduplikacja.
- **Transform layer**: agregacje dzienne/tygodniowe/miesiÄ™czne.
- **Feature engineering**: automatyczne generowanie features z fact tables (tabela z sekcji 4.3).
- **Data lineage**: `data_lineage` table â€” kto/kiedy/skÄ…d.
- Tabele: `stg_videos`, `stg_channels`, `ml_features`, `data_lineage`.

**Definition of Done:**
- Pipeline przetwarza fixture data end-to-end.
- Features generowane deterministycznie (te same dane â†’ te same features).
- BrakujÄ…ce dane oznaczone explicite (NULL + reason), nie interpolowane.
- Data lineage query: "skÄ…d pochodzi ta wartoĹ›Ä‡?" zwraca peĹ‚nÄ… Ĺ›cieĹĽkÄ™.

---

### Faza 5 â€” Sync Orchestrator

**Cel:** Kontrolowany, idempotentny, resilient sync.

**Zakres:**
- Etapy sync z postÄ™pem procentowym (events do UI).
- Checkpointy i resume po przerwaniu.
- `sync_runs` table: status, etap, duration, error log.
- Blokada rĂłwnolegĹ‚ego sync (mutex).
- Automatic retry z exponential backoff dla API errors.
- Post-sync hook: automatycznie uruchamia data pipeline (Faza 4).
- Eventy `sync:progress`, `sync:complete`, `sync:error` do UI.

**Definition of Done:**
- Sync moĹĽna przerwaÄ‡ i wznowiÄ‡ bez utraty spĂłjnoĹ›ci (test: kill w poĹ‚owie â†’ resume).
- Po sync automatycznie uruchamia siÄ™ pipeline i generuje fresh features.
- Error reporting: UI pokazuje co poszĹ‚o nie tak z actionable message.

---

### Faza 6 â€” Bazowy ML Framework *(przesuniÄ™te z Fazy 10!)*

**Cel:** DziaĹ‚ajÄ…cy framework ML z pierwszym modelem prognostycznym.

**Zakres:**
- **Model Registry**: `ml_models` table (id, type, version, config, status, metrics).
- **Training pipeline**: feature selection â†’ train â†’ validate â†’ store.
- **Backtesting**: rolling window cross-validation.
- **Metryki**: MAE, sMAPE, MASE (Mean Absolute Scaled Error).
- **Quality gate**: model aktywowany tylko gdy metryki < threshold.
- **Pierwszy model**: Linear Regression + Exponential Smoothing (Holt-Winters) na views/subscribers.
  - Dlaczego proste modele najpierw: szybkie, interpretowalnĂ©, baseline do porĂłwnaĹ„.
- **Prediction storage**: `ml_predictions` (model_id, target, horizon, predicted, actual, confidence_interval).
- **Confidence levels**: p10/p50/p90 (nie tylko point estimate).
- **Graceful degradation**: < 30 dni danych â†’ ukryj forecast, pokaĹĽ trend line.
- **Shadow mode**: nowy model generuje predykcje obok starego, nie jest aktywny.

**Algorytmy (roadmap wewnÄ…trz fazy):**

| Priorytet | Algorytm | Cel | Kiedy dodaÄ‡ |
|-----------|----------|-----|-------------|
| P0 | Exponential Smoothing (Holt-Winters) | Baseline forecast | Na start |
| P0 | Linear Regression + trend decomposition | Trend detection | Na start |
| P1 | ARIMA/SARIMA | SezonowoĹ›Ä‡ | Po walidacji baseline |
| P1 | Prophet (opcjonalnie) | Automatyczny forecast | JeĹ›li ARIMA niewystarczajÄ…cy |
| P2 | Gradient Boosted Trees (LightGBM) | Feature-rich prediction | Gdy features stabilne |
| P3 | LSTM/Transformer | Zaawansowane sekwencje | Tylko jeĹ›li P1/P2 niewystarczajÄ…ce |

**Definition of Done:**
- Holt-Winters i Linear Regression trenowane na fixture data.
- Backtesting raport: MAE, sMAPE per model per metryka.
- Quality gate blokuje kiepski model (test: model z random weights â†’ nie aktywowany).
- Predictions z confidence intervals (p10/p50/p90).

---

### Faza 7 â€” Dashboard + Raporty + Eksport

**Cel:** Pierwsza duĹĽa wartoĹ›Ä‡ biznesowa â€” wizualizacja danych I predykcji.

**Zakres:**
- KPI cards (aktualne + delta + trend arrow).
- Timeseries chart z overlay predykcji ML (confidence band).
- Zakres dat: 7d / 30d / 90d / custom.
- Anomaly highlights na wykresach (punkty oznaczone czerwono).
- Pipeline raportu: sync â†’ pipeline â†’ ML â†’ metrics â†’ insights â†’ render.
- HTML report template (Handlebars/React SSR).
- PDF generation (hidden BrowserWindow + print-to-PDF).
- Weekly export package: `report.pdf`, `top_videos.csv`, `kpi_summary.json`, `predictions.csv`.

**Definition of Done:**
- Dashboard renderuje real KPIs + ML predictions z confidence bands.
- Jeden klik generuje raport PDF z metrykami i predykcjami.
- Export package zawiera maszynowo czytelne formaty (CSV/JSON).

---

### Faza 8 â€” Auth + Profile + Settings

**Cel:** Multi-user, separacja Ĺ›rodowisk.

**Zakres:**
- OAuth connect/disconnect/status (YouTube API).
- Multi-profile: tworzenie, wybĂłr, przeĹ‚Ä…czanie (osobne DB per profil).
- Settings per profil: API keys, LLM provider, report preferences, ML model preferences.
- Secure credential storage (Electron safeStorage API).

**Definition of Done:**
- Dwa profile dziaĹ‚ajÄ… niezaleĹĽnie po restarcie.
- Credentials nie sÄ… w plaintext (safeStorage).
- PrzeĹ‚Ä…czenie profilu â†’ czyste zaĹ‚adowanie danych tego profilu.

---

### Faza 9 â€” Import + Enrichment + Search

**Cel:** PeĹ‚na kontrola ĹşrĂłdeĹ‚ i wyszukiwania.

**Zakres:**
- Import CSV z mapowaniem kolumn, preview, walidacjÄ… (Zod schema).
- Import automatycznie triggeruje data pipeline (feature regeneration).
- Transkrypcje + parser SRT â†’ `dim_transcript`.
- FTS5 full-text search + snippety + timestamp.
- Search results z relevance score i context.

**Definition of Done:**
- Importowane dane od razu widoczne na wykresach i w predictions.
- Wyszukiwanie zwraca wynik ze snippetem, timestampem i relevance score.
- Import invalid CSV â†’ czytelny error z numerem wiersza i kolumny.

---

### Faza 10 â€” Anomaly Detection + Trend Analysis *(nowa faza)*

**Cel:** Automatyczne wykrywanie nietypowych zdarzeĹ„ i zmian trendĂłw.

**Zakres:**
- **Anomaly detection**: Z-score + IQR (dual method, consensus = higher confidence).
- **Trend decomposition**: STL (Seasonal-Trend decomposition using LOESS).
- **Change point detection**: CUSUM algorithm.
- **Tabele**: `ml_anomalies` (timestamp, metric, severity, method, explanation).
- **Alert generation**: anomaly â†’ insight z kontekstem ("Views spadĹ‚y o 40% vs avg â€” prawdopodobna przyczyna: brak publikacji 5 dni").
- **UI**: anomalie zaznaczone na wykresach + feed anomalii z filtrowaniem.

**Definition of Done:**
- Anomaly detection znajduje znane anomalie w fixture data (test z planted outliers).
- Trend decomposition rozdziela seasonal/trend/residual.
- Change point detection poprawnie znajduje planted change points w fixtures.

---

### Faza 10.5 â€” Hardening (spĂłjnoĹ›Ä‡ liczb, regresje, trace, fundament pod FazÄ™ 11)

**Cel:** UstabilizowaÄ‡ metryki i debugowalnoĹ›Ä‡ pipeline przed asystentem LLM, aby kaĹĽda liczba byĹ‚a reprodukowalna i Ĺ‚atwa do wyjaĹ›nienia.

**Zakres (MVP, krĂłtka faza):**
- **Golden DB**: dodaÄ‡ `fixtures/insight_golden.db` (3 kanaĹ‚y, ~20 filmĂłw, 90 dni, edge-case: braki danych, spike, czÄ™Ĺ›ciowe dni).
- **Snapshot tests**: uruchamianie contract queries i snapshoty JSON (minimum 20 zapytaĹ„):
  - overview `last30d` (`views`, `watch_time`, `avg_view_duration`, `ctr`),
  - top videos `last30d`,
  - compare `last7d` vs `previous7d`,
  - trend (`slope` + `confidence`) dla kluczowych metryk,
  - anomalies (punkty + score).
- Komendy testowe: `pnpm test:snapshots` i `pnpm test:snapshots:update` (Ĺ›wiadoma aktualizacja).
- **Trace ID + lineage (minimum)**: kaĹĽde wywoĹ‚anie analityczne ma `trace_id`; logujemy operacjÄ™, parametry, czas i liczbÄ™ rekordĂłw; lineage zawiera tabelÄ™, klucze gĹ‚Ăłwne, zakres czasu i filtry.
- **Semantic Layer (krok 1)**: katalog 15-25 kluczowych metryk + wspĂłlny interfejs pobierania; nowy kod korzysta z katalogu, migracja starego kodu tylko dla krytycznych ekranĂłw.
- **ADR mini + scope freeze (operacyjnie)**:
  - `docs/adr/000-template.md`,
  - minimum 2 ADR (format evidence/lineage, model metryk; opcjonalnie trzeci: zasady cache pod FazÄ™ 12),
  - obowiÄ…zkowy scope freeze â€žrobimy / nie robimy" przed startem kolejnych faz.

**Definition of Done:**
- Snapshot tests dziaĹ‚ajÄ… local/CI i wykrywajÄ… regresjÄ™ liczbowÄ….
- `trace_id` jest generowany i zapisany dla kluczowych operacji analitycznych.
- Semantic Layer zawiera min. 15-25 metryk i jest uĹĽyty w co najmniej 2 krytycznych miejscach UI.
- W repo istnieje template ADR i co najmniej 2 ADR zwiÄ…zane z evidence/metrykami.

---

### Faza 11 â€” LLM Assistant (Lite)

**Cel:** DostarczyÄ‡ praktycznego asystenta bez budowania peĹ‚nej platformy LLM â€” tylko bezpieczne narzÄ™dzia i odpowiedzi oparte o evidence.

**Zakres:**
- **Whitelist tooli** (bez dowolnego SQL na start): executor korzysta tylko z zatwierdzonych narzÄ™dzi read-only.
- Structured output JSON: `answer`, `evidence[]`, `confidence`, `follow_up_questions[]`.
- Persist rozmĂłw i evidence w SQLite.
- UI: zakĹ‚adka asystenta z chatem, historiÄ… i evidence viewer.
- LocalStub offline dziaĹ‚a deterministycznie.
- Minimalne streszczanie dĹ‚ugich rozmĂłw (context compaction).
- Executor zawsze robi realne lookupy przez tools (nigdy odpowiedĹş â€žz gĹ‚owy").

**Definition of Done:**
- Pytanie "jak szĹ‚y moje filmy w ostatnim miesiÄ…cu?" â†’ odpowiedĹş z konkretnymi liczbami z DB.
- LocalStub mode zwraca poprawnÄ… odpowiedĹş bez zewnÄ™trznego API.
- Evidence linki prowadzÄ… do konkretnych rekordĂłw.
- UI + IPC dla asystenta sÄ… stabilne: `lint/typecheck/test/build` przechodzÄ….

---

### Faza 12 â€” Performance i stabilnoĹ›Ä‡ (cache + inkrementalnoĹ›Ä‡)

**Cel:** PrzyspieszyÄ‡ analitykÄ™ po ustabilizowaniu metryk i uproĹ›ciÄ‡ ponowne przeliczenia bez naruszania spĂłjnoĹ›ci danych.

**Zakres:**
- Cache wynikĂłw analitycznych po `(metric_id, params_hash)`.
- TTL + invalidacja cache po sync/import.
- Inkrementalne przeliczenia tam, gdzie ma to sens kosztowo.
- Mierniki czasu wykonania i spĂłjny monitoring wydajnoĹ›ci (p50/p95 + cache hit-rate).
- Dodatkowo: podstawowe guardrails kosztowe i bezpieczeĹ„stwa utrzymane jako polityki runtime (bez budowy duĹĽej platformy).

**Definition of Done:**
- Cache dziaĹ‚a i raportuje hit/miss dla kluczowych zapytaĹ„.
- Po sync/import cache jest poprawnie uniewaĹĽniany.
- Inkrementalne Ĺ›cieĹĽki skracajÄ… czas wybranych przeliczeĹ„ bez zmiany wyniku merytorycznego.

---

### Faza 13 â€” Quality Scoring *(usprawnione)*

**Cel:** Wielowymiarowy ranking jakoĹ›ci contentu.

**Zakres:**

**SkĹ‚adowe score:**

| SkĹ‚adowa | Waga (default) | Opis | Obliczanie |
|----------|----------------|------|------------|
| Velocity | 0.25 | SzybkoĹ›Ä‡ zbierania views | views_7d / avg_views_7d (percentile w kanale) |
| Efficiency | 0.20 | Views per subscriber | views / subscribers (normalized) |
| Engagement | 0.25 | Interakcja widzĂłw | (likes + comments * 3) / views |
| Retention | 0.15 | Utrzymanie widzĂłw | avg_watch_time / duration (jeĹ›li dostÄ™pne) |
| Consistency | 0.15 | StabilnoĹ›Ä‡ wynikĂłw | 1 - coefficient_of_variation(views_daily) |

- **Normalizacja**: percentile rank wewnÄ…trz kanaĹ‚u (nie sigmoid â€” percentile jest bardziej interpretowalna i odporna na outliers).
- **Confidence level**: `high` (>60 dni danych), `medium` (30-60), `low` (<30).
- **Trend**: score_current vs score_30d_ago â†’ improving / declining / stable.
- **Wagi konfigurowalne** przez uĹĽytkownika (ale sensowne defaults).
- Tabela: `agg_quality_scores` (video_id, score, components, confidence, calculated_at).

**Definition of Done:**
- Ranking z final score i breakdown skĹ‚adowych.
- Test: video z planted high engagement â†’ wysoki score.
- Confidence labels poprawne dla rĂłĹĽnych dĹ‚ugoĹ›ci danych.

---

### Faza 14 â€” Competitor Intelligence

**Cel:** Systemowa analiza konkurencji.

**Zakres:**
- Schema konkurencji: `dim_competitor`, `fact_competitor_day`.
- Sync danych publicznych (YouTube Data API â€” publiczne statystyki).
- Snapshoty dzienne z delta detection.
- **Metryki porĂłwnawcze**: relative growth, market share (w niszy), content frequency comparison.
- **Hit detection**: video z views > 3Ď kanaĹ‚u = "hit".
- **Momentum scoring**: weighted recent growth vs historical.
- Radar chart w UI: ty vs konkurencja (5-6 osi).
- Alert: "Konkurent X opublikowaĹ‚ hit â€” 500% powyĹĽej ich Ĺ›redniej".

**Definition of Done:**
- Competitor data syncs i widoczna w dashboardzie.
- Hit detection poprawnie flaguje outlier videos.
- Radar chart renderuje porĂłwnanie min. 3 kanaĹ‚Ăłw.

---

### Faza 15 â€” Topic Intelligence *(usprawnione)*

**Cel:** Wykrywanie luk tematycznych i trendĂłw topikowych.

**Zakres:**
- **Text processing**: tokenizacja + stop words + stemming (dla PL i EN).
- **TF-IDF** na tytuĹ‚ach + description + tagach â†’ topic vectors.
- **Clustering**: K-Means z automatycznym doborem K (elbow method + silhouette score).
- **Topic pressure**: ile views generuje dany topic cluster w czasie.
- **Gap detection**: "tematy popularne w niszy, ktĂłrych TY nie pokrywasz".
- **Cannibalization detection**: "te 3 filmy konkurujÄ… o ten sam topic â€” jeden kradnie views drugiemu".
- **Topic trend**: rising / stable / declining per cluster.
- **Tabele**: `dim_topic_cluster`, `fact_topic_pressure_day`, `agg_topic_gaps`.

**Definition of Done:**
- Clustering grupuje filmy w sensowne tematy (manual review fixtures).
- Gap detection pokazuje luki z uzasadnieniem.
- Cannibalization check: planted overlapping topics â†’ flagowane.

---

### Faza 16 â€” Planning System

**Cel:** Backlog + kalendarz + ryzyko kanibalizacji.

**Zakres:**
- Backlog CRUD: pomysĹ‚y na filmy z metadanymi.
- **Score pomysĹ‚u**: topic_momentum Ă— (1 - cannibalization_risk) Ă— gap_opportunity Ă— effort_inverse.
- Similarity check tytuĹ‚Ăłw: cosine similarity vs istniejÄ…ce filmy.
- **Optimal publish timing**: analiza historyczna â†’ najlepszy dzieĹ„/godzina.
- Calendar view: zaplanowane + opublikowane + predykcje wynikĂłw.
- Risk warnings: kanibalizacja, oversaturation, off-trend.

**Definition of Done:**
- DodajÄ…c plan, uĹĽytkownik widzi score, ryzyko, sugerowany timing.
- Similarity > 0.7 â†’ warning z linkiem do podobnego filmu.

---

### Faza 17 â€” Plugins (Insights/Alerts) â€” SKIP w trybie solo

**Cel:** Ĺšwiadome wyĹ‚Ä…czenie zakresu plugin runtime dla pojedynczego uĹĽytkownika.

**Zakres:**
- Brak implementacji plugin managera i lifecycle hooks.
- Brak built-in pluginĂłw i dedykowanego notification center.
- Insighty/alerty pozostajÄ… ewentualnie jako czÄ™Ĺ›Ä‡ core UI lub diagnostyki, bez warstwy pluginĂłw.

**Definition of Done:**
- Faza oznaczona jako `SKIP (solo)` w dokumentacji i roadmapie.
- Brak nowych zaleĹĽnoĹ›ci/runtime zwiÄ…zanych z plugin architecture.

---

### Faza 18 â€” Diagnostics + Recovery

**Cel:** Samodiagnoza i naprawa.

**Zakres:**
- `perf_events`: czasy kaĹĽdego etapu pipeline, sync, ML.
- Diagnostics modal w UI: health check wszystkich moduĹ‚Ăłw.
- DB integrity check: foreign keys, orphaned records, index health.
- ML model health: drift detection (prediction error trend), data freshness.
- Safe mode overlay: wyĹ‚Ä…cza problematyczny moduĹ‚, app dziaĹ‚a dalej.
- Recovery actions: VACUUM, reindex FTS5, reset cache, retrain model, re-run pipeline.

**Definition of Done:**
- Health check wykrywa planted problems w fixture (broken FK, stale predictions).
- Recovery actions naprawiajÄ… wykryte problemy.

---

### Faza 19 â€” Polish + Local UX (bez packaging/telemetry)

**Cel:** Dopracowanie codziennego UX dla pojedynczego uĹĽytkownika, bez wymagaĹ„ dystrybucyjnych.

**Zakres:**
- Responsive layout + dark mode.
- Keyboard shortcuts.
- Onboarding flow (first-run wizard).
- Lokalny "one-click weekly package" â†’ sync + pipeline + ML + report + export (bez publikacji paczek instalacyjnych).

**Definition of Done:**
- Aplikacja dziaĹ‚a stabilnie lokalnie po `pnpm dev` / lokalnym buildzie.
- Dark mode peĹ‚ny.
- Onboarding prowadzi uĹĽytkownika pierwszego uruchomienia.

---

## 6. RytuaĹ‚ realizacji kaĹĽdej fazy

KaĹĽdy feature w tej kolejnoĹ›ci (bez wyjÄ…tkĂłw):

1. **Kontrakt** â€” `shared`: DTO, Zod schema, eventy, IPC contract.
2. **Migracja DB** â€” nowe tabele/kolumny w `core`.
3. **Logika** â€” implementacja w odpowiednim pakiecie (`core`/`sync`/`ml`/etc.).
4. **IPC** â€” handler w main, hook w preload.
5. **UI** â€” komponenty + Zustand store + TanStack Query hooks.
6. **Testy** â€” unit (logika) + integration (DB + IPC) + smoke (UI renderuje).
7. **Dokumentacja** â€” README moduĹ‚u, changelog, contracts update.

**Anty-regresja check po kaĹĽdej fazie:**
- `pnpm lint` â€” 0 errors.
- `pnpm typecheck` â€” 0 errors.
- `pnpm test` â€” all pass.
- `pnpm build` â€” succeeds.
- Ĺ»adne istniejÄ…ce IPC kontrakty nie zostaĹ‚y zĹ‚amane (backwards compatible).
- Lokalnie uruchamiaj komendy przez `corepack pnpm ...`, aby natywne zaleĹĽnoĹ›ci (np. `better-sqlite3`) byĹ‚y budowane pod aktywnÄ… wersjÄ™ Node (w projekcie `>=22`).

---

## 7. Definition of Ready (DoR)

Task wchodzi do realizacji **tylko** gdy zawiera:

- [ ] Cel biznesowy (jedno zdanie).
- [ ] Zakres plikĂłw/moduĹ‚Ăłw (lista).
- [ ] Kontrakt wejĹ›cia/wyjĹ›cia (DTO types).
- [ ] Kryteria akceptacji (testowalne).
- [ ] Lista testĂłw do napisania.
- [ ] Lista rzeczy â€žpoza zakresem" (co NIE wchodzi).
- [ ] Dependencies: jakie fazy/taski muszÄ… byÄ‡ ukoĹ„czone.

---

## 8. Definition of Done (DoD)

Task jest zamkniÄ™ty **dopiero** gdy:

- [ ] Typy i walidacje sÄ… kompletne (no `any`, no `as` casts without justification).
- [ ] Testy przechodzÄ… lokalnie i w CI.
- [ ] Performance budget nie przekroczony.
- [ ] Brak naruszeĹ„ granic architektury (lint rule).
- [ ] Brak circular dependencies.
- [ ] Dokumentacja zaktualizowana.
- [ ] Wpis w `CHANGELOG_AI.md` (jeĹ›li zmiana AI).
- [ ] Regression check: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

## 9. KPI postÄ™pu projektu

| KPI | Target | Pomiar |
|-----|--------|--------|
| % faz ukoĹ„czonych | 100% | Fazy z DoD âś“ |
| CI pass rate | > 95% | GitHub Actions |
| Test coverage (core/ml/analytics) | > 80% | Vitest coverage |
| IPC response time (p95) | < 100ms | `perf_events` |
| ML prediction accuracy (sMAPE) | < 20% | `ml_backtests` |
| Cache hit-rate (API) | > 60% | `sync_runs` stats |
| Cache hit-rate (LLM) | > 30% | `llm_usage` stats |
| Regresje na fazÄ™ | < 2 | Bug tracker |
| Anomaly detection precision | > 80% | Test na golden dataset |

---

## 10. Plan realizacji â€” milestone'y

### Milestone 1: Foundation (Fazy 0-2)
**Wynik:** DziaĹ‚ajÄ…cy szkielet z DB, IPC, i pustym dashboardem na fixture data.

### Milestone 2: Data Engine (Fazy 3-5)
**Wynik:** PeĹ‚ny pipeline: sync â†’ ETL â†’ features. Fake/Real/Record modes.

### Milestone 3: Intelligence Core (Fazy 6-7)
**Wynik:** ML forecasting + dashboard z predykcjami i raportami PDF.

### Milestone 4: User-Ready (Fazy 8-9)
**Wynik:** Auth, multi-profile, import, search. Aplikacja uĹĽyteczna solo.

### Milestone 5: Analytics Beast (Fazy 10-15, z hardeningiem 10.5)
**Wynik:** Anomaly detection + hardening liczb, LLM assistant Lite, quality scoring, competitor intel, topic intel, planning. **PeĹ‚ny "potwĂłr analityczny" budowany etapowo.**

### Milestone 6: Production (Fazy 16-19)
**Wynik:** Diagnostics + polish pod uĹĽycie lokalne single-user (bez plugin runtime, packagingu dystrybucyjnego i telemetry opt-in).

---

## 11. WspĂłĹ‚praca z wieloma LLM

1. KaĹĽda sesja AI zaczyna od przeczytania:
   - `AGENTS.md`
   - `docs/architecture/overview.md`
   - Runbook dla konkretnego zadania.
   - `CHANGELOG_AI.md` (ostatnie 5 wpisĂłw â€” co siÄ™ zmieniĹ‚o).

2. KaĹĽda sesja AI koĹ„czy siÄ™:
   - ChecklistÄ… DoD.
   - Wpisem do `CHANGELOG_AI.md`.
   - ListÄ… ryzyk.
   - "NastÄ™pny krok" â€” co powinien zrobiÄ‡ kolejny model.

2a. Przed kaĹĽdÄ… nowÄ… fazÄ… obowiÄ…zuje mini ADR + 10-minutowy scope freeze (jawne â€žrobimy / nie robimy").

3. **Zakaz "duĹĽych refactorĂłw bez ADR"** â€” kaĹĽda zmiana architektury wymaga decyzji.

4. **Jeden PR = jedna odpowiedzialnoĹ›Ä‡** â€” nie mieszamy feature'Ăłw.

5. **Shadow mode dla zmian ML** â€” nowy model nie zastÄ™puje starego automatycznie.

---

## 12. Decyzje architektoniczne

| Obszar | Decyzja | Uzasadnienie |
|--------|---------|--------------|
| Runtime | Electron | Offline-first, dostÄ™p do FS/SQLite, PDF generation |
| JÄ™zyk | TypeScript strict | Type safety, tooling, AI-friendly |
| Baza | SQLite (better-sqlite3) | Zero-config, portable, wystarczajÄ…ca dla single-user |
| State (UI) | Zustand + TanStack Query | Zustand: simple sync state. TQ: async IPC cache/invalidation |
| Komunikacja | IPC + Zod DTO | Type-safe boundary, walidacja na obu stronach |
| Raporty | HTML + PDF (print-to-PDF) | Offline, customizable, no server needed |
| LLM | Provider registry + LocalStub | Vendor-agnostic, testowalne offline |
| ML | Custom pipeline + model registry | Kontrola, reprodukowalnoĹ›Ä‡, nie black-box SaaS |
| ML baseline | Holt-Winters + Linear Regression | Proste, interpretowalnĂ©, szybkie, dobre baseline |
| Normalizacja scores | Percentile rank | Odporna na outliers, intuicyjna interpretacja |
| Feature engineering | Automated z fact tables | Deterministic, versioned, reproducible |
| Text analysis | TF-IDF + K-Means | Proste, nie wymaga GPU, wystarczajÄ…ce dla metadata |

---

## 13. Risk register

| Ryzyko | PrawdopodobieĹ„stwo | Impact | Mitigation |
|--------|-------------------|--------|------------|
| YouTube API rate limits | Wysokie | Ĺšredni | Cache, rate limiter, incremental sync |
| Za maĹ‚o danych dla ML | Ĺšrednie | Wysoki | Graceful degradation, minimum data requirements |
| SQLite performance przy duĹĽych danych | Niskie | Ĺšredni | Indexing strategy, VACUUM schedule, partitioning views |
| Electron memory leaks | Ĺšrednie | Ĺšredni | Perf monitoring, memory budget, worker offloading |
| LLM cost explosion | Ĺšrednie | Ĺšredni | Hard limits, cache, local models as default |
| Model drift | Ĺšrednie | Ĺšredni | Periodic backtesting, shadow mode, alerts |
| Breaking changes w API providerĂłw | Niskie | Wysoki | Adapter pattern, version pinning, integration tests |

---

## 14. Checklista startowa (do odhaczania)

- [x] UtworzyÄ‡ strukturÄ™ monorepo (pnpm workspaces). âś… Faza 0
- [x] SkonfigurowaÄ‡ TS strict + ESLint flat config + Prettier + Vitest. âś… Faza 0
- [x] CI pipeline (GitHub Actions): lint + typecheck + test. âś… Faza 0
- [x] Pakiet `shared`: DTO, Zod schemas, AppError, events, IPC contracts. âś… Faza 0
- [x] Pakiet `core`: SQLite + migracje + query/mutation layer. âś… Faza 1
- [x] Pakiet `data-pipeline`: ETL skeleton + feature engineering stubs. âś… Faza 4
- [x] Pakiet `sync`: orchestrator sync + checkpoint/resume + retry/backoff + mutex. âś… Faza 5
- [x] Pakiet `ml`: model registry + training pipeline stubs. âś… Faza 6
- [x] Pakiet `reports`: generator raportu + eksport JSON/CSV/HTML. âś… Faza 7
- [x] App `desktop`: Electron main + preload (security hardened). âś… Faza 0
- [x] App `ui`: React + Zustand + TanStack Query skeleton. âś… Faza 0
- [x] Minimal IPC: `app:getStatus`, `db:getKpis`, `db:getTimeseries` + rozszerzenia `app:getDataMode`, `app:setDataMode`, `app:probeDataMode`, `profile:list`, `profile:create`, `profile:setActive`, `settings:get`, `settings:update`, `auth:getStatus`, `auth:connect`, `auth:disconnect`, `sync:start`, `sync:resume`, `ml:runBaseline`, `ml:getForecast`, `ml:detectAnomalies`, `ml:getAnomalies`, `ml:getTrend`, `analytics:getQualityScores`, `analytics:syncCompetitors`, `analytics:getCompetitorInsights`, `analytics:runTopicIntelligence`, `analytics:getTopicIntelligence`, `planning:generatePlan`, `planning:getPlan`, `diagnostics:getHealth`, `diagnostics:runRecovery`, `reports:generate`, `reports:export`, `import:previewCsv`, `import:runCsv`, `search:content`, `assistant:ask`, `assistant:listThreads`, `assistant:getThreadMessages`. DONE Faza 2/3/5/6/7/8/9/10/11/13/14/15/16/18
- [x] Realistyczne fixture data (90 dni, 50 filmĂłw). âś… Faza 1
- [x] Fake mode (runtime toggle + loader fixture). âś… Faza 3
- [x] Record mode + replay fixture (real -> fixture -> fake). âś… Faza 3
- [x] Pierwszy dashboard na fixture data. âś… Faza 2/3
- [x] Multi-profile + settings per profil + auth safeStorage. âś… Faza 8
- [x] Dokumenty: `AGENTS.md`, `architecture/overview.md`, `architecture/data-flow.md`. âś… Faza 0

- [x] Import CSV + FTS5 search + integracje IPC/UI + testy integracyjne. DONE Faza 9
- [x] Anomaly detection + trend decomposition + CUSUM + UI feed + overlay + testy integracyjne. DONE Faza 10
- [x] Hardening 10.5: golden DB + snapshot tests + trace_id + lineage + Semantic Layer (step 1).
- [x] Hardening 10.5: docs/adr/000-template.md + minimum 2 ADR + scope freeze checklist.
- [x] LLM Assistant Lite: whitelist read-only tools + LocalStub + persystencja rozmow/evidence + UI chat + testy integracyjne. DONE Faza 11
- [x] Performance i stabilnosc: cache wynikow analitycznych + invalidacja po sync/import + inkrementalny pipeline + monitoring p50/p95/hit-rate. DONE Faza 12
- [x] Quality Scoring: tabela `agg_quality_scores`, silnik komponentow (percentile rank), confidence labels i integracja IPC/UI. DONE Faza 13
- [x] Competitor Intelligence: `dim_competitor` + `fact_competitor_day`, sync snapshotow, hit detection > 3 sigma, momentum ranking i panel UI. DONE Faza 14
- [x] Topic Intelligence: `dim_topic_cluster` + `fact_topic_pressure_day` + `agg_topic_gaps`, klasteryzacja i gap detection z integracjÄ… IPC/UI. DONE Faza 15
- [x] Planning System: `planning_plans` + `planning_recommendations`, planner deterministyczny, evidence/rationale/confidence, integracja IPC/UI. DONE Faza 16
- [x] Diagnostics + Recovery: `diagnostics:getHealth` + `diagnostics:runRecovery`, health checks DB/cache/pipeline/IPC, akcje recovery i panel UI. DONE Faza 18
- [x] Polish + Local UX: onboarding first-run, skrĂłty klawiszowe, one-click przebieg tygodniowy i spĂłjne komunikaty/retry w kluczowych panelach. DONE Faza 19
- [x] Audyt techniczny calego kodu + backlog poprawek dla kolejnego LLM (`docs/reviews/2026-02-17-audyt-kodu-i-plan-poprawek-llm.md`).
- [x] Refactor stabilizacyjny: modularne entrypointy UI/desktop/hooks + parity IPC + testy UI + gate'y CI (`check:boundaries`, `check:loc`, `check:perf`). DONE Faza 20
- [x] ADR: wybór stacku technologicznego (`docs/adr/011-stack-selection.md`).

---

> Ten dokument jest â€žĹĽywy": aktualizowaÄ‡ po kaĹĽdej wiÄ™kszej decyzji, aby zespĂłĹ‚ i modele AI pracowaĹ‚y zawsze na tej samej, aktualnej mapie projektu.

