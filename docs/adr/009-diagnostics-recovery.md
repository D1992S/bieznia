# ADR 009: Diagnostyka i naprawa - kontrole stanu oraz bezpieczne akcje naprawcze

- Status: Accepted
- Date: 2026-02-17
- Faza: 18

## Kontekst

Po domknięciu Fazy 16 aplikacja ma rozbudowany pipeline analityczny i wiele punktów styku (DB, cache, IPC, pipeline).
Brakowało jednej, jawnej warstwy diagnostyki, która:

- pokazuje aktualny stan techniczny kluczowych modułów,
- umożliwia bezpieczne akcje naprawcze bez ręcznego ingerowania w bazę,
- pozostaje deterministyczna i w pełni lokalna (priorytet offline).

## Decyzja

Wdrażamy Fazę 18 jako dedykowany moduł `@moze/diagnostics` wraz z kontraktami IPC i panelem UI:

- kontrakty IPC:
  - `diagnostics:getHealth` (pobranie kontroli stanu),
  - `diagnostics:runRecovery` (uruchomienie akcji naprawczych).
- DTO:
  - wejście/wyjście kontroli stanu,
  - wejście/wyjście naprawy z listą kroków i statusami.
- serwis `@moze/diagnostics`:
  - kontrole stanu: integralność DB, snapshot cache, świeżość pipeline, most IPC,
  - akcje naprawcze:
    - `integrity_check` (kontrola integralności),
    - `invalidate_analytics_cache` (inwalidacja cache analityki),
    - `rerun_data_pipeline` (ponowne uruchomienie pipeline danych),
    - `reindex_fts` (przebudowa indeksów FTS),
    - `vacuum_database` (optymalizacja bazy przez VACUUM).
- runtime desktop:
  - nowe komendy backendu z tracingiem:
    - `diagnostics.getHealth`,
    - `diagnostics.runRecovery`.
- UI:
  - panel "Diagnostyka i naprawa (Faza 18)" w zakładce `Statystyki`,
  - odświeżenie kontroli stanu,
  - uruchomienie bezpiecznej naprawy i prezentacja wyników kroków.

## Zamrożenie zakresu (robimy / nie robimy)

- Robimy:
  - kontrolę stanu modułów DB/cache/pipeline/IPC tylko do odczytu,
  - deterministyczne akcje naprawcze z jawnym statusem kroku,
  - integracje `shared/diagnostics/desktop/ui`,
  - testy kontraktowe i integracyjne.
- Nie robimy:
  - nowych funkcji analitycznych (poza diagnostyką),
  - runtime pluginów (Faza 17 pozostaje SKIP),
  - telemetrii opt-in i pakowania dystrybucyjnego (Faza 19).

## Alternatywy

1. Naprawa tylko przez ręczne SQL i komendy techniczne.
   - Odrzucone: zbyt wysoki koszt operacyjny i ryzyko błędów użytkownika.
2. "Magiczna" auto-naprawa bez ekspozycji kroków.
   - Odrzucone: słaba audytowalność i trudny debugging.
3. Brak dedykowanego pakietu diagnostyki, wszystko w `apps/desktop`.
   - Odrzucone: mieszanie odpowiedzialności i gorsza testowalność.

## Konsekwencje

- Plusy:
  - jawny stan techniczny i szybka lokalna diagnostyka,
  - kontrolowana naprawa bez naruszania granic architektury,
  - gotowość pod Fazę 19 (dopracowanie UX po polsku) bez długu operacyjnego.
- Minusy:
  - dodatkowa powierzchnia utrzymaniowa (DTO + IPC + UI + testy),
  - skuteczność naprawy zależy od kompletności danych wejściowych (np. kanał/zakres).

## Metryki sukcesu

- kontrola stanu zwraca czytelny status kluczowych modułów,
- naprawa usuwa co najmniej jeden scenariusz trwałego niespójnego stanu danych/cache,
- UI pokazuje status i pozwala uruchomić naprawę bez błędów IPC,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez błędów.
