# Mozetobedzieto

Analityczna maszyna dla content creatorów (YouTube) — desktop app (Electron), która zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakość contentu i daje rekomendacje oparte na evidence. Podejście **AI-first**.

## Dokumentacja

| Dokument | Opis |
|----------|------|
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
