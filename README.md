# Mozetobedzieto

Analityczna maszyna dla content creatorów (YouTube) — desktop app (Electron), która zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakość contentu i daje rekomendacje oparte na evidence. Podejście **AI-first**.

## Postęp realizacji

> Aktualny status: **Faza 0 ukończona.** Szczegóły: [`NEXT_STEP.md`](NEXT_STEP.md)

| Faza | Nazwa | Status |
|------|-------|--------|
| 0 | Foundation (monorepo, TS, Electron, shared) | DONE |
| 1 | Data Core (SQLite, migracje, query layer) | **NASTĘPNA** |
| 2 | Desktop Backend + IPC | — |
| 3 | Data Modes + Fixtures | — |
| 4 | Data Pipeline + Feature Engineering | — |
| 5 | Sync Orchestrator | — |
| 6 | Bazowy ML Framework | — |
| 7 | Dashboard + Raporty + Eksport | — |
| 8 | Auth + Profile + Settings | — |
| 9 | Import + Enrichment + Search | — |
| 10 | Anomaly Detection + Trend Analysis | — |
| 11 | LLM Assistant | — |
| 12 | LLM Guardrails + Cost Control | — |
| 13 | Quality Scoring | — |
| 14 | Competitor Intelligence | — |
| 15 | Topic Intelligence | — |
| 16 | Planning System | — |
| 17 | Plugins (Insights/Alerts) | — |
| 18 | Diagnostics + Recovery | — |
| 19 | Polish + Packaging | — |

## Dokumentacja

| Dokument | Opis |
|----------|------|
| [`NEXT_STEP.md`](NEXT_STEP.md) | **Co robić teraz** — czytaj jako pierwsze |
| [`docs/PLAN_REALIZACJI.md`](docs/PLAN_REALIZACJI.md) | Główny plan realizacji (20 faz, architektura danych, ML pipeline) |
| [`AGENTS.md`](AGENTS.md) | Zasady modyfikacji kodu (obowiązkowe przed każdą sesją AI) |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Mapa modułów i dependency graph |
| [`docs/architecture/data-flow.md`](docs/architecture/data-flow.md) | Pipeline danych: ingestion → ML → prezentacja |
| [`CHANGELOG_AI.md`](CHANGELOG_AI.md) | Dziennik zmian AI |

## Stack technologiczny

Electron + React + TypeScript strict + SQLite + Zod + Zustand + TanStack Query + Vitest

## Zasada pracy z PR

Wymagamy jawnego logowania zmian, żeby kolejny model AI mógł kontynuować prace bez zgadywania:
- sekcja „Co zmieniono",
- sekcja „Wpływ i ryzyko",
- sekcja „Jak zweryfikowano",
- wpis do `CHANGELOG_AI.md`.

Szczegóły: `docs/PLAN_REALIZACJI.md` (sekcja 3.3) i `AGENTS.md`.
