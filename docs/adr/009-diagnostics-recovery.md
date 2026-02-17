# ADR 009: Diagnostics + Recovery - health checks i bezpieczne akcje naprawcze

- Status: Accepted
- Date: 2026-02-17
- Faza: 18

## Kontekst

Po domknieciu Fazy 16 aplikacja ma rozbudowany pipeline analityczny i wiele punktow styku (DB, cache, IPC, pipeline).
Brakowalo jednej, jawnej warstwy diagnostyki, ktora:

- pokazuje aktualny stan techniczny kluczowych modulow,
- umożliwia bezpieczne akcje recovery bez ręcznego grzebania w bazie,
- pozostaje deterministyczna i w pełni lokalna (offline-first).

## Decyzja

Wdrażamy Faze 18 jako dedykowany moduł `@moze/diagnostics` + kontrakty IPC i panel UI:

- kontrakty IPC:
  - `diagnostics:getHealth`,
  - `diagnostics:runRecovery`.
- DTO:
  - wejscie/wyjscie health check,
  - wejscie/wyjscie recovery z lista krokow i statusami.
- serwis `@moze/diagnostics`:
  - health checks: DB integrity, cache snapshot, pipeline freshness, IPC bridge,
  - recovery actions:
    - `integrity_check`,
    - `invalidate_analytics_cache`,
    - `rerun_data_pipeline`,
    - `reindex_fts`,
    - `vacuum_database`.
- desktop runtime:
  - nowe komendy backendu z tracingiem:
    - `diagnostics.getHealth`,
    - `diagnostics.runRecovery`.
- UI:
  - panel „Diagnostyka i recovery (Faza 18)” w zakładce `Statystyki`,
  - odswiezenie health check,
  - uruchomienie bezpiecznego recovery i prezentacja wynikow krokow.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - read-only health check modułów DB/cache/pipeline/IPC,
  - deterministyczne akcje recovery z jawnym statusem kroku,
  - integracje `shared/diagnostics/desktop/ui`,
  - testy kontraktowe i integracyjne.
- Nie robimy:
  - nowych funkcji analitycznych (poza diagnostyką),
  - plugin runtime (Faza 17 pozostaje SKIP),
  - telemetry opt-in i packaging dystrybucyjny (Faza 19).

## Alternatywy

1. Recovery tylko przez ręczne SQL i komendy techniczne.
   - Odrzucone: zbyt wysoki koszt operacyjny i ryzyko błędów użytkownika.
2. „Magiczne” auto-recovery bez ekspozycji kroków.
   - Odrzucone: słaba audytowalność i trudny debugging.
3. Brak dedykowanego pakietu diagnostics, wszystko w `apps/desktop`.
   - Odrzucone: mieszanie odpowiedzialnosci i gorsza testowalność.

## Konsekwencje

- Plusy:
  - jawny stan techniczny i szybka lokalna diagnostyka,
  - kontrolowane recovery bez naruszania granic architektury,
  - gotowosc pod Fazę 19 (polish UX) bez długu operacyjnego.
- Minusy:
  - dodatkowa powierzchnia utrzymaniowa (DTO + IPC + UI + testy),
  - skutecznosc recovery zalezy od kompletności danych wejściowych (np. kanal/range).

## Metryki sukcesu

- health check zwraca czytelny status kluczowych modułów,
- recovery naprawia co najmniej jeden scenariusz stalego stanu danych/cache,
- UI pokazuje status i pozwala uruchomić recovery bez błędów IPC,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez błędów.
