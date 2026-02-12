# Data Flow — Pipeline danych

> Szczegółowy opis przepływu danych od ingestion do prezentacji.

## Status implementacji

- Faza 4: **DONE** (minimum pipeline w kodzie).
- Faza 5: **DONE** (sync orchestrator + checkpoint/resume + retry/backoff + post-sync pipeline).
- Faza 6: **DONE** (bazowy framework ML + backtesting + quality gate + predictions).
- Faza 7: **DONE** (dashboard KPI + wykres forecast overlay + raporty + eksport lokalny).
- Zaimplementowany runner: `packages/data-pipeline/src/pipeline-runner.ts`.
- Zaimplementowany orchestrator: `packages/sync/src/sync-orchestrator.ts`.
- Zaimplementowany baseline ML: `packages/ml/src/ml-baseline.ts`.
- Zaimplementowany raport i eksport: `packages/reports/src/report-service.ts`.
- Zaimplementowane tabele: `stg_channels`, `stg_videos`, `ml_features`, `data_lineage`, `ml_models`, `ml_backtests`, `ml_predictions`.

## Pełny pipeline

```
┌─────────┐    ┌────────────┐    ┌─────────┐    ┌───────────┐    ┌───────────┐    ┌─────┐    ┌────────────┐
│INGESTION│───►│ VALIDATION │───►│ STAGING │───►│ TRANSFORM │───►│ ANALYTICS │───►│ ML  │───►│PRESENTATION│
│         │    │            │    │         │    │           │    │           │    │     │    │            │
│ API     │    │ Zod schema │    │Normalize│    │ Features  │    │ KPIs      │    │Fore-│    │ Dashboard  │
│ CSV     │    │ Range check│    │ Dedupe  │    │ Aggregate │    │ Trends    │    │cast │    │ Reports    │
│ Import  │    │ Freshness  │    │ Upsert  │    │ Engineer  │    │ Scores    │    │Anom.│    │ Export     │
└─────────┘    └────────────┘    └─────────┘    └───────────┘    └───────────┘    └─────┘    └────────────┘
     │               │                │               │               │              │             │
     ▼               ▼                ▼               ▼               ▼              ▼             ▼
 raw_api_       (reject +        stg_videos     ml_features     agg_kpi_daily   ml_models     IPC → UI
 responses      log reason)      stg_channels                  agg_trends      ml_predictions PDF/CSV
 raw_csv_                                                     agg_quality_    ml_anomalies
 imports                                                        scores         ml_backtests
```

## Szczegóły każdego etapu

### 1. Ingestion

**Źródła:**
- YouTube Data API (sync orchestrator)
- CSV import (user upload)
- SRT/transcript import

**Output:** `raw_api_responses` / `raw_csv_imports`

**Reguły:**
- Surowe dane zapisywane as-is (JSON blob).
- Każdy rekord ma: `source`, `fetched_at`, `sync_run_id`.
- Retry z exponential backoff przy API errors.
- Rate limiter: token bucket, max requests per window.

### 2. Validation

**Input:** Raw data
**Output:** Validated data → staging LUB reject + log

**Checks:**
- **Schema validation** (Zod): czy pola mają poprawne typy.
- **Range check**: views >= 0, subscribers >= 0, dates w rozsądnym zakresie.
- **Freshness check**: czy dane nie starsze niż X (konfigurowalne).
- **Null reason**: brakujące pole → `NULL` + `missing_reason` (nie cicha interpolacja).

**Reject policy:** Invalid rekord → log z powodu + kontynuuj (nie crash pipeline).

### 3. Staging

**Input:** Validated data
**Output:** `stg_videos`, `stg_channels`

**Operacje:**
- Normalizacja nazw kolumn (camelCase → snake_case w DB).
- Deduplikacja (upsert by natural key).
- Type casting (string dates → ISO timestamps).
- Data lineage entry per stage: `ingest`, `validation`, `staging`, `feature-generation`.

### 4. Transform

**Input:** Staging tables + Dimension/Fact tables
**Output:** `ml_features`, updated aggregates

**Feature Engineering:**

```
fact_video_day
    ├── views_7d = SUM(views) OVER (7 days)
    ├── views_30d = SUM(views) OVER (30 days)
    ├── views_acceleration = views_7d(t) - views_7d(t-7) / views_7d(t-7)
    ├── like_rate = likes / views
    ├── comment_rate = comments / views
    ├── publish_frequency = COUNT(videos) OVER (30 days)
    ├── days_since_last_video
    ├── day_of_week (categorical → one-hot)
    └── seasonal_index (month-based historical average)
```

**Agregacje:**
- Dzienne: per video, per channel.
- Tygodniowe: rolling 7-day windows.
- Miesięczne: rolling 30-day windows.

**Versioning:** Każdy feature set ma `feature_set_version`. Zmiana formuły = nowa wersja.

### 5. Analytics

**Input:** Fact tables + Features
**Output:** `agg_kpi_daily`, `agg_trends`, `agg_quality_scores`, `agg_topic_clusters`

**KPI calculation:**
- Total views (period), delta vs previous period, % change.
- Subscriber growth rate.
- Avg engagement rate.
- Publication frequency.
- Best/worst performing video.

**Quality scoring:**
- Per-video wielowymiarowy score (velocity, efficiency, engagement, retention, consistency).
- Normalizacja: percentile rank wewnątrz kanału.
- Confidence level based on data availability.

### 6. ML

**Input:** `ml_features`, historical `ml_predictions`
**Output:** `ml_predictions`, `ml_anomalies`, `ml_backtests`

**Forecast pipeline:**
```
1. Feature selection (based on model config)
2. Data split: train / validation / test (time-based, nie random)
3. Train model
4. Validate (rolling window backtesting)
5. Calculate metrics: MAE, sMAPE, MASE
6. Quality gate: metrics < threshold → activate, else → shadow mode
7. Generate predictions: p10, p50, p90
8. Store in ml_predictions
```

**Anomaly pipeline:**
```
1. Calculate baselines (rolling mean + std)
2. Z-score method: |value - mean| / std > 3 → anomaly
3. IQR method: value < Q1 - 1.5*IQR or value > Q3 + 1.5*IQR → anomaly
4. Consensus: both methods agree → high confidence
5. Generate explanation: "Views dropped 40% vs 7-day avg"
6. Store in ml_anomalies
```

### 7. Presentation

**Input:** Analytics + ML results (via IPC)
**Output:** Dashboard, Reports, Exports

**Dashboard refresh:**
- TanStack Query z stale time = 30s.
- Background refresh po sync complete event.
- Optimistic updates where applicable.

**Report generation:**
```
1. Collect: KPIs + timeseries + predictions + top videos + insights
2. Render: HTML report template
3. Package: JSON + CSV + HTML → export directory
4. Expose via IPC: `reports:generate`, `reports:export`
```

## Data Lineage

Każdy uruchomiony etap pipeline ma wpis w `data_lineage`:

```sql
CREATE TABLE data_lineage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_stage TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_record_count INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    source_sync_run_id INTEGER REFERENCES sync_runs(id),
    produced_at TEXT NOT NULL
);
```

Query: "Skąd pochodzi ta predykcja?" →
```
ml_predictions ← ml_features ← fact_video_day ← stg_videos ← raw_api_responses
```
