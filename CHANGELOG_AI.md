# CHANGELOG_AI

Dziennik zmian wykonywanych przez modele AI.

## Template wpisu

- Data:
- Autor (model):
- Zakres plików:
- Co zmieniono:
- Dlaczego:
- Ryzyko/regresja:
- Jak zweryfikowano:
- Następny krok:

## 2026-02-12

- Data: 2026-02-12
- Autor (model): GPT-5.2-Codex
- Zakres plików: `docs/PLAN_REALIZACJI.md`, `README.md`, `CHANGELOG_AI.md`
- Co zmieniono: Dodano formalną sekcję 3.3 z obowiązkowym logowaniem zmian dla PR/commit oraz doprecyzowano to w README.
- Dlaczego: Użytkownik chciał jednoznacznego wymogu, aby każda ingerencja była opisana tak, by inny model mógł bazować na historii zmian.
- Ryzyko/regresja: Brak ryzyka runtime (zmiany wyłącznie w dokumentacji).
- Jak zweryfikowano: Sprawdzenie diff i odczyt plików.
- Następny krok: Wymusić template PR i checklistę w repo (np. `.github/pull_request_template.md`).

## 2026-02-12 (v2)

- Data: 2026-02-12
- Autor (model): Claude Opus 4.6
- Zakres plików: `docs/PLAN_REALIZACJI.md`, `AGENTS.md`, `docs/architecture/overview.md`, `docs/architecture/data-flow.md`, `README.md`, `CHANGELOG_AI.md`
- Co zmieniono:
  - Gruntowna przebudowa PLAN_REALIZACJI.md (496 → 834 linii):
    - Dodano 2 nowe zasady: Performance budgets (#7) i Data quality first (#8).
    - Dodano sekcję 4: Architektura danych (model warstwowy RAW→STAGING→DIM/FACT→ANALYTICS→ML, pipeline ETL, feature engineering, strategia brakujących danych).
    - Zreorganizowano kolejność faz: ML Framework przesunięty z Fazy 10 do Fazy 6.
    - Dodano nową Fazę 4 (Data Pipeline + Feature Engineering) i Fazę 10 (Anomaly Detection + Trend Analysis).
    - Rozszerzono fazy ML o konkretne algorytmy (Holt-Winters, ARIMA, LightGBM roadmap), confidence intervals, shadow mode, graceful degradation.
    - Usprawniono Quality Scoring: percentile rank zamiast sigmoid, confidence levels, szczegółowe formuły.
    - Dodano nowe pakiety: data-pipeline, analytics, top-level fixtures.
    - Dodano UI stack: Zustand + TanStack Query.
    - Dodano sekcje: Risk Register, Milestone'y, mierzalne KPI targets.
  - Stworzono AGENTS.md: pełne zasady modyfikacji kodu, graf zależności, konwencje, rytuał zakończenia sesji.
  - Stworzono docs/architecture/overview.md: diagram modułów, dependency graph, wzorce (IPC, data flow, error handling, state management).
  - Stworzono docs/architecture/data-flow.md: szczegółowy pipeline 7-etapowy, feature engineering formulas, data lineage schema.
  - Zaktualizowano README.md: opis projektu, tabela dokumentów, stack technologiczny.
- Dlaczego: Oryginalny plan miał krytyczne braki: brak data pipeline, ML za późno (Faza 10/18), brak feature engineering, brak strategii state management, brak performance budgets, za płytkie ML (brak konkretnych algorytmów), brak anomaly detection, brak obsługi brakujących danych.
- Ryzyko/regresja: Brak (zmiany tylko w dokumentacji, zero kodu).
- Jak zweryfikowano: Review struktury dokumentów, spójność między PLAN_REALIZACJI ↔ AGENTS.md ↔ overview.md ↔ data-flow.md.
- Następny krok: Rozpocząć implementację Fazy 0 (Foundation) — monorepo setup, TS strict, shared package, Electron shell.
