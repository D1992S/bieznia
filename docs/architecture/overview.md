# Architecture Overview

> Mapa modułów i przepływ danych w aplikacji Mozetobedzieto.

## Diagram modułów

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPS LAYER                               │
│  ┌──────────────┐    IPC (Zod DTO)    ┌──────────────────────┐ │
│  │  apps/ui     │◄──────────────────►│  apps/desktop        │ │
│  │  React       │                     │  Electron main       │ │
│  │  Zustand     │                     │  + preload           │ │
│  │  TanStack Q  │                     │                      │ │
│  └──────────────┘                     └──────────┬───────────┘ │
│                                                  │             │
├──────────────────────────────────────────────────┼─────────────┤
│                    PACKAGES LAYER                 │             │
│                                                  ▼             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  sync    │  │  reports │  │   llm    │  │ plugins  │      │
│  │          │  │          │  │          │  │          │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │              │            │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐      │
│  │              data-pipeline / ml / analytics           │      │
│  │  ETL, Feature Engineering, Forecasting, Scoring      │      │
│  └──────────────────────┬───────────────────────────────┘      │
│                         │                                      │
│  ┌──────────────────────┴───────────────────────────────┐      │
│  │                     core                              │      │
│  │  SQLite, Migrations, Query Layer, Mutation Layer      │      │
│  └──────────────────────┬───────────────────────────────┘      │
│                         │                                      │
│  ┌──────────────────────┴───────────────────────────────┐      │
│  │                    shared                             │      │
│  │  DTO, Zod Schemas, IPC Contracts, Events, AppError   │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                 diagnostics                           │      │
│  │  Health checks, Perf monitoring, Recovery             │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Tryb solo (aktualny scope):** warstwa `plugins` jest poza zakresem implementacji.

## Dependency Graph (dozwolone importy)

```
shared (zero deps)
  ↑
core (shared)
  ↑
data-pipeline (shared, core)
  ↑
├── sync (shared, core, data-pipeline)
├── ml (shared, core, data-pipeline)
├── analytics (shared, core, ml)
├── reports (shared, core)
├── llm (shared, core)
├── plugins (shared, core) [out-of-scope w trybie solo]
├── diagnostics (shared, core)
  ↑
apps/desktop (shared + dowolny package)
apps/ui (TYLKO shared — komunikacja przez IPC)
```

## Kluczowe wzorce

### IPC Communication
```
UI → (invoke IPC command) → Preload → Main → Package Logic → DB
UI ← (IPC response/event) ← Preload ← Main ← Package Logic ← DB
```

- Każda komenda IPC ma kontrakt w `shared/src/ipc/contracts.ts`.
- Walidacja Zod na obu stronach (sender i receiver).
- Odpowiedzi: `Result<T, AppError>` — nigdy nie rzucamy przez IPC.

### Data Flow (Sync → ML → UI)
```
1. Sync: YouTube API → raw_api_responses (RAW)
2. Pipeline: RAW → Validation → stg_* (STAGING)
3. Pipeline: STAGING → dim_*, fact_* (WAREHOUSE)
4. Pipeline: WAREHOUSE → ml_features (FEATURES)
5. ML: FEATURES → ml_predictions (PREDICTIONS)
6. Analytics: WAREHOUSE + PREDICTIONS → agg_* (ANALYTICS)
7. UI: ANALYTICS → IPC → Dashboard/Reports
```

### Error Handling
```
AppError {
  code: string        // np. 'SYNC_API_ERROR', 'ML_INSUFFICIENT_DATA'
  message: string     // czytelny komunikat
  severity: 'fatal' | 'error' | 'warning' | 'info'
  context: Record<string, unknown>  // dodatkowe dane
  cause?: Error       // oryginalny error
}
```

### State Management (UI)
```
Zustand: synchronous UI state (sidebar open, selected tab, filters)
TanStack Query: async data from IPC (KPIs, timeseries, predictions)
```

TanStack Query zapewnia: cache, stale-while-revalidate, retry, background refresh.

## Technologie

| Warstwa | Technologia | Wersja (min) |
|---------|-------------|-------------|
| Runtime | Electron | 28+ |
| UI | React | 18+ |
| State | Zustand | 4+ |
| Async state | TanStack Query | 5+ |
| Language | TypeScript (strict) | 5.3+ |
| Database | SQLite (better-sqlite3) | latest |
| Validation | Zod | 3+ |
| Testing | Vitest | 1+ |
| Package manager | pnpm | 8+ |
| Linting | ESLint (flat config) | 9+ |
| Formatting | Prettier | 3+ |
