# Mozetobedzieto

Analityczna maszyna dla content creatorów (YouTube) — desktop app (Electron), która zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakość contentu i daje rekomendacje oparte na evidence. Podejście **AI-first**.

## Postęp realizacji

> Aktualny status: **Faza 7 ukończona.** Szczegóły: [`NEXT_STEP.md`](NEXT_STEP.md)

| Faza | Nazwa | Status | Co powinno działać (prosty opis) |
|------|-------|--------|-----------------------------------|
| 0 | Foundation (monorepo, TS, Electron, shared) | DONE | Aplikacja się uruchamia: jest okno desktop, podstawowy ekran i fundament techniczny. |
| 1 | Data Core (SQLite, migracje, query layer) | DONE | Aplikacja ma stabilną bazę danych i potrafi zapisywać/odczytywać podstawowe dane kanału i filmów. |
| 2 | Desktop Backend + IPC | DONE | Interfejs bezpiecznie rozmawia z backendem i pokazuje dane z bazy przez IPC. |
| 3 | Data Modes + Fixtures | DONE | Można pracować na danych testowych albo prawdziwych i przełączać tryb pracy (fake/real/record). |
| 4 | Data Pipeline + Feature Engineering | DONE | Działa deterministyczny ETL: staging, walidacja danych, feature engineering i lineage. |
| 5 | Sync Orchestrator | DONE | Jest kontrolowany sync z postępem, retry i możliwością wznowienia po przerwaniu. |
| 6 | Bazowy ML Framework | DONE | Pojawiają się pierwsze prognozy (np. wyświetlenia/subskrypcje) z oceną jakości modelu. |
| 7 | Dashboard + Raporty + Eksport | DONE | Działa dashboard KPI, wykresy i eksport raportów (np. PDF/CSV). |
| 8 | Auth + Profile + Settings | **NASTĘPNA** | Można podłączyć konto, mieć kilka profili i osobne ustawienia. |
| 9 | Import + Enrichment + Search | — | Można importować dane (CSV), wzbogacać je i wygodnie przeszukiwać. |
| 10 | Anomaly Detection + Trend Analysis | — | Aplikacja sama wykrywa nietypowe skoki/spadki i zmiany trendów. |
| 11 | LLM Assistant | — | Działa asystent AI, który odpowiada na pytania na podstawie Twoich danych. |
| 12 | LLM Guardrails + Cost Control | — | Jest kontrola kosztów AI i ochrona danych wrażliwych. |
| 13 | Quality Scoring | — | Każdy materiał dostaje czytelny wynik jakości z uzasadnieniem. |
| 14 | Competitor Intelligence | — | Widać porównanie do konkurencji i sygnały o ich mocnych ruchach. |
| 15 | Topic Intelligence | — | Aplikacja podpowiada tematy z potencjałem i pokazuje luki tematyczne. |
| 16 | Planning System | — | Można planować publikacje i oceniać pomysły przed nagraniem. |
| 17 | Plugins (Insights/Alerts) | SKIP (solo) | Poza zakresem w trybie solo (bez plugin runtime). |
| 18 | Diagnostics + Recovery | — | Aplikacja wykrywa problemy techniczne i pomaga je naprawić. |
| 19 | Polish + Local UX | — | Dopracowany UX lokalny bez packagingu dystrybucyjnego i bez telemetrii opt-in. |

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

## Uruchomienie (Foundation)

1. `pnpm install`
2. `pnpm dev` (UI + Electron)

Skrót do samego UI: `pnpm dev:ui`  
Skrót do samego desktop runtime: `pnpm dev:desktop`

## Zasada pracy z PR

Wymagamy jawnego logowania zmian, żeby kolejny model AI mógł kontynuować prace bez zgadywania:
- sekcja „Co zmieniono",
- sekcja „Wpływ i ryzyko",
- sekcja „Jak zweryfikowano",
- wpis do `CHANGELOG_AI.md`.

Szczegóły: `docs/PLAN_REALIZACJI.md` (sekcja 3.3) i `AGENTS.md`.
