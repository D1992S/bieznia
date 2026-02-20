# ADR 010: Polish + Local UX (Faza 19)

- Status: Zaakceptowany
- Data: 2026-02-17
- Faza: 19

## Kontekst

Po domknięciu funkcjonalności faz 0-18 aplikacja działała poprawnie technicznie, ale codzienny przepływ pracy nadal wymagał ręcznego przechodzenia przez wiele paneli i niespójnych komunikatów.

Największe tarcia:

- brak spójnego wejścia „od pierwszego uruchomienia”,
- brak szybkiej ścieżki operacyjnej sync → analiza → plan → raport,
- brak konsekwentnych akcji retry w kluczowych stanach błędów,
- niedomknięte copy UX i drobne niespójności językowe.

## Decyzja

W Fazie 19 wdrażamy lokalne dopracowanie UX bez rozszerzania architektury i bez zmiany kontraktów IPC:

- onboarding first-run w UI (lokalny, oparty o `localStorage`),
- skróty klawiszowe dla głównych zakładek i akcji,
- „przebieg tygodniowy” (one-click flow) uruchamiający sekwencję operacji: synchronizacja, analiza, plan i raport,
- spójne komunikaty błędów/loading/empty oraz akcje retry w głównych panelach,
- poprawki responsywności układu panelu asystenta i gęstości layoutu.

## Zamrożenie zakresu (robimy / nie robimy)

- Robimy:
  - UX polish i ergonomię codziennej pracy single-user,
  - uspójnienie copy po polsku,
  - uspójnienie stanów operacyjnych i retry.
- Nie robimy:
  - plugin runtime (Faza 17 pozostaje SKIP),
  - packagingu dystrybucyjnego,
  - telemetry opt-in i integracji chmurowych.

## Konsekwencje

- Plusy:
  - krótszy czas dojścia do wyniku biznesowego w codziennym użyciu,
  - mniejsze ryzyko utknięcia użytkownika po błędach dzięki retry,
  - lepsza gotowość aplikacji do testów manualnych i regresyjnych.
- Minusy:
  - większa powierzchnia UI do utrzymania (onboarding + skróty + flow orchestration),
  - one-click flow wymaga monitorowania czasów i niezawodności przy większych danych.

## Metryki sukcesu

- użytkownik przechodzi pełny przepływ pracy jednym przyciskiem bez ręcznego „szukania” kolejnych ekranów,
- kluczowe panele mają jednoznaczne stany loading/error/empty i akcję retry,
- brak regresji jakości: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez błędów.
