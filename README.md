# Mozetobedzieto

Analityczna aplikacja desktopowa (Electron) dla twórców YouTube: synchronizacja danych, pipeline analityczny, ML, asystent AI Lite, scoring jakości, analiza konkurencji, analiza tematów, planowanie publikacji oraz diagnostyka.

## Postęp realizacji

> Ukończono fazy 0-19 (z wyjątkiem Fazy 17 oznaczonej jako SKIP solo). Projekt jest gotowy do używania lokalnie i do testów regresyjnych. Szczegóły: [`NEXT_STEP.md`](NEXT_STEP.md)

| Faza | Nazwa | Status | Co działa |
|------|-------|--------|-----------|
| 0 | Foundation | DONE | Szkielet monorepo + Electron + TS |
| 1 | Data Core | DONE | SQLite, migracje i warstwa zapytań |
| 2 | Desktop Backend + IPC | DONE | Stabilna komunikacja UI ↔ backend |
| 3 | Data Modes + Fixtures | DONE | Tryby fake/real/record |
| 4 | Data Pipeline + Feature Engineering | DONE | Deterministyczny ETL i cechy |
| 5 | Sync Orchestrator | DONE | Kontrolowany sync z retry/wznawianiem |
| 6 | Bazowy ML Framework | DONE | Bazowe prognozy i metryki jakości |
| 7 | Dashboard + Raporty + Eksport | DONE | Dashboard KPI + eksport JSON/CSV/HTML |
| 8 | Auth + Profile + Settings | DONE | Profile, ustawienia i połączenie konta |
| 9 | Import + Enrichment + Search | DONE | Import CSV i wyszukiwanie FTS |
| 10 | Anomaly Detection + Trend Analysis | DONE | Anomalie, trend i punkty zmiany |
| 10.5 | Hardening | DONE | Snapshoty, trace, lineage, semantic layer |
| 11 | LLM Assistant (Lite) | DONE | Asystent z evidence i LocalStub |
| 12 | Performance i stabilność | DONE | Cache + inwalidacja + inkrementalny pipeline |
| 13 | Quality Scoring | DONE | Ranking jakości i confidence |
| 14 | Competitor Intelligence | DONE | Snapshoty konkurencji i momentum |
| 15 | Topic Intelligence | DONE | Klastry tematów i wykrywanie luk |
| 16 | Planning System | DONE | Plan publikacji z evidence/rationale |
| 17 | Plugins (Insights/Alerts) | SKIP (solo) | Poza zakresem dla trybu solo |
| 18 | Diagnostics + Recovery | DONE | Kontrola stanu + akcje naprawcze |
| 19 | Polish + Local UX | DONE | Onboarding, skróty, one-click flow, UX polish |
| 20 | Refactor stabilizacyjny (modularyzacja UI/IPC + testy) | **NASTĘPNA** | Redukcja długu technicznego bez zmian funkcjonalnych |

## Uruchomienie lokalne

```bash
corepack pnpm install
corepack pnpm dev
```

## Bramka jakości

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Dokumentacja

- [`NEXT_STEP.md`](NEXT_STEP.md) - aktualny status i kolejny krok
- [`docs/PLAN_REALIZACJI.md`](docs/PLAN_REALIZACJI.md) - plan faz i checklisty
- [`AGENTS.md`](AGENTS.md) - zasady pracy w repo
- [`docs/architecture/overview.md`](docs/architecture/overview.md) - mapa architektury
- [`docs/adr`](docs/adr) - decyzje architektoniczne (ADR)
