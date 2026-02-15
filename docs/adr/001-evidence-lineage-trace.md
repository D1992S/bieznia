# ADR 001 - Evidence/Lineage + trace_id dla analityki

- Data: 2026-02-15
- Status: Accepted
- Decydenci: owner projektu + AI implementujące Fazę 10.5

## Kontekst

Po Fazie 10 mieliśmy działającą analitykę (KPI, trend, anomaly, raport), ale brakowało spójnego śladu:
- jaka operacja policzyła daną liczbę,
- z jakich tabel i filtrów pochodził wynik,
- jak długo trwało zapytanie i ile rekordów zwróciło.

To blokowało "evidence-first" dla Fazy 11 (LLM Assistant Lite), bo odpowiedzi muszą być audytowalne.

## Problem

Bez ustandaryzowanego trace/log lineage:
- regresje liczb trudniej diagnozować,
- brak prostego powiązania wyników UI z wejściem SQL,
- nie ma technicznego fundamentu pod evidence viewer i guardrails.

## Opcje

1. Logi tylko w plikach (JSON logger).
2. Logi i lineage tylko w pamięci procesu desktop.
3. Trwały zapis trace + lineage w SQLite (dedykowane tabele).

## Decyzja

Wybór: **opcja 3**.

Wprowadzamy:
- `analytics_trace_runs` (trace_id, operation_name, params_json, status, row_count, duration_ms, error),
- `analytics_trace_lineage` (trace_id, source_table, primary_keys_json, date_from/date_to, filters_json).

Integracja:
- wrapper `runWithAnalyticsTrace(...)` w `@moze/core`,
- użycie w kluczowych operacjach (`metrics`, `channel`, `reports`, `ml`).

## Konsekwencje pozytywne

- Każde krytyczne zapytanie ma `trace_id` i trwały ślad.
- Łatwiejsza diagnostyka regresji liczbowych.
- Gotowy fundament pod evidence viewer w Fazie 11.

## Konsekwencje negatywne / ryzyka

- Lekki narzut I/O (dodatkowe inserty przy odczytach).
- Potrzeba retencji/archiwizacji trace w dłuższym horyzoncie.

## Plan wdrożenia

1. Migracja DB `006-analytics-trace-schema`.
2. Wrapper trace + lineage w `@moze/core`.
3. Integracja z query/report/ml flows.
4. Testy integracyjne i snapshoty.

## Metryki sukcesu

- `trace_id` zapisany dla wszystkich krytycznych operacji z listy 10.5.
- `analytics_trace_lineage` zawiera tabele + filtry + zakres dat.
- Testy integracyjne i snapshoty przechodzą.

## Plan rollback

- Możliwość wyłączenia wywołań wrappera w warstwie kodu.
- Zachowanie tabel (brak destrukcyjnego rollback migracji).

