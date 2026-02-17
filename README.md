# Mozetobedzieto

Analityczna maszyna dla content creatorĂłw (YouTube) â€” desktop app (Electron), ktĂłra zbiera dane, prognozuje trendy, wykrywa anomalie, ocenia jakoĹ›Ä‡ contentu i daje rekomendacje oparte na evidence. PodejĹ›cie **AI-first**.

## PostÄ™p realizacji

> Ukończono Fazę 18; Faza 17 to SKIP (solo); następna: Faza 19 (Polish + Local UX). Szczegóły: [`NEXT_STEP.md`](NEXT_STEP.md)

| Faza | Nazwa | Status | Co powinno dziaĹ‚aÄ‡ (prosty opis) |
|------|-------|--------|-----------------------------------|
| 0 | Foundation (monorepo, TS, Electron, shared) | DONE | Aplikacja siÄ™ uruchamia: jest okno desktop, podstawowy ekran i fundament techniczny. |
| 1 | Data Core (SQLite, migracje, query layer) | DONE | Aplikacja ma stabilnÄ… bazÄ™ danych i potrafi zapisywaÄ‡/odczytywaÄ‡ podstawowe dane kanaĹ‚u i filmĂłw. |
| 2 | Desktop Backend + IPC | DONE | Interfejs bezpiecznie rozmawia z backendem i pokazuje dane z bazy przez IPC. |
| 3 | Data Modes + Fixtures | DONE | MoĹĽna pracowaÄ‡ na danych testowych albo prawdziwych i przeĹ‚Ä…czaÄ‡ tryb pracy (fake/real/record). |
| 4 | Data Pipeline + Feature Engineering | DONE | DziaĹ‚a deterministyczny ETL: staging, walidacja danych, feature engineering i lineage. |
| 5 | Sync Orchestrator | DONE | Jest kontrolowany sync z postÄ™pem, retry i moĹĽliwoĹ›ciÄ… wznowienia po przerwaniu. |
| 6 | Bazowy ML Framework | DONE | PojawiajÄ… siÄ™ pierwsze prognozy (np. wyĹ›wietlenia/subskrypcje) z ocenÄ… jakoĹ›ci modelu. |
| 7 | Dashboard + Raporty + Eksport | DONE | DziaĹ‚a dashboard KPI, wykresy i eksport raportĂłw (np. PDF/CSV). |
| 8 | Auth + Profile + Settings | DONE | MoĹĽna podĹ‚Ä…czyÄ‡ konto, mieÄ‡ kilka profili i osobne ustawienia. |
| 9 | Import + Enrichment + Search | DONE | MoĹĽna importowaÄ‡ dane (CSV), wzbogacaÄ‡ je i wygodnie przeszukiwaÄ‡. |
| 10 | Anomaly Detection + Trend Analysis | DONE | Aplikacja sama wykrywa nietypowe skoki/spadki i zmiany trendĂłw. |
| 10.5 | Hardening (spĂłjnoĹ›Ä‡ liczb + regresje + trace) | DONE | Ustabilizowane metryki i debug pipeline (golden DB, snapshoty, trace/lineage, semantic layer). |
| 11 | LLM Assistant (Lite) | DONE | DziaĹ‚a lekki asystent AI oparty o whitelist tooli i evidence z DB. |
| 12 | Performance i stabilnoĹ›Ä‡ (cache + inkrementalnoĹ›Ä‡) | DONE | DziaĹ‚a cache metryk, invalidacja po sync/import i inkrementalne przeliczenia pipeline. |
| 13 | Quality Scoring | DONE | KaĹĽdy materiaĹ‚ dostaje czytelny wynik jakoĹ›ci z uzasadnieniem i confidence. |
| 14 | Competitor Intelligence | DONE | WidaÄ‡ porĂłwnanie do konkurencji i sygnaĹ‚y o ich mocnych ruchach. |
| 15 | Topic Intelligence | DONE | Aplikacja podpowiada tematy z potencjaĹ‚em i pokazuje luki tematyczne. |
| 16 | Planning System | DONE | MoĹĽna wygenerowaÄ‡ plan publikacji z priorytetami, evidence i ostrzeĹĽeniami kanibalizacji. |
| 17 | Plugins (Insights/Alerts) | SKIP (solo) | Poza zakresem w trybie solo (bez plugin runtime). |
| 18 | Diagnostics + Recovery | DONE | Aplikacja wykrywa problemy techniczne i pomaga je naprawiÄ‡. |
| 19 | Polish + Local UX | **NASTÄPNA** | Dopracowany UX lokalny bez packagingu dystrybucyjnego i bez telemetrii opt-in. |

## Dokumentacja

| Dokument | Opis |
|----------|------|
| [`NEXT_STEP.md`](NEXT_STEP.md) | **Co robiÄ‡ teraz** â€” czytaj jako pierwsze |
| [`docs/PLAN_REALIZACJI.md`](docs/PLAN_REALIZACJI.md) | GĹ‚Ăłwny plan realizacji (20 faz, architektura danych, ML pipeline) |
| [`AGENTS.md`](AGENTS.md) | Zasady modyfikacji kodu (obowiÄ…zkowe przed kaĹĽdÄ… sesjÄ… AI) |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Mapa moduĹ‚Ăłw i dependency graph |
| [`docs/architecture/data-flow.md`](docs/architecture/data-flow.md) | Pipeline danych: ingestion â†’ ML â†’ prezentacja |
| [`CHANGELOG_AI.md`](CHANGELOG_AI.md) | Dziennik zmian AI |
| [`docs/runbooks/test-plan-faza-0-8.md`](docs/runbooks/test-plan-faza-0-8.md) | Runbook testĂłw funkcjonalnych (wersja ultra-prosta dla poczÄ…tkujÄ…cych) + opcjonalne wsparcie AI |

## Stack technologiczny

Electron + React + TypeScript strict + SQLite + Zod + Zustand + TanStack Query + Vitest

## Uruchomienie (Foundation)

1. `corepack pnpm install`
2. `corepack pnpm dev` (UI + Electron)

SkrĂłt do samego UI: `corepack pnpm dev:ui`  
SkrĂłt do samego desktop runtime: `corepack pnpm dev:desktop`

## Zasada pracy z PR

Wymagamy jawnego logowania zmian, ĹĽeby kolejny model AI mĂłgĹ‚ kontynuowaÄ‡ prace bez zgadywania:
- sekcja â€žCo zmienionoâ€ť,
- sekcja â€žWpĹ‚yw i ryzykoâ€ť,
- sekcja â€žJak zweryfikowanoâ€ť,
- wpis do `CHANGELOG_AI.md`.

SzczegĂłĹ‚y: `docs/PLAN_REALIZACJI.md` (sekcja 3.3) i `AGENTS.md`.

