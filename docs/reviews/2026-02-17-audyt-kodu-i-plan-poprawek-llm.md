# Audyt kodu aplikacji + lista poprawek dla kolejnego LLM

Data: 2026-02-17  
Autor: GPT-5 Codex

## 1) Zakres i metodologia

Przegląd objął cały monorepo (`apps/*`, `packages/*`, kluczowe pliki workflow/dokumentacji). Audyt wykonano w 3 warstwach:

1. **Bramki jakości**: lint/typecheck/test/build.
2. **Hotspoty utrzymaniowe**: długość plików, centralizacja odpowiedzialności, duplikacja kontraktów.
3. **Ryzyka architektoniczne i testowe**: pokrycie UI, automatyzacja granic modułów, kontrola budżetów wydajności.

### Wynik bramek jakości (stan bazowy)

- `pnpm lint` — PASS
- `pnpm typecheck` — PASS
- `pnpm test` — PASS (25 plików testowych, 116 testów)
- `pnpm build` — PASS

Wniosek: projekt jest **stabilny funkcjonalnie**, ale ma narastający dług techniczny w warstwie kompozycji UI/IPC.

---

## 2) Najważniejsze ustalenia audytu

## A. Zbyt duże „god files" i kumulacja odpowiedzialności

Największe hotspoty (LOC):

- `apps/ui/src/App.tsx` — 2967 linii.
- `apps/desktop/src/main.ts` — 1942 linie.
- `apps/ui/src/hooks/use-dashboard-data.ts` — 822 linie.
- `apps/desktop/src/ipc-handlers.ts` — 861 linii.
- `packages/shared/src/ipc/contracts.ts` — 1193 linie.

Konsekwencje:
- rosnący koszt zmian i konfliktów merge,
- trudniejsze code review i regresje przy modyfikacji pozornie lokalnej,
- wysoka podatność na przypadkowe „rozjechanie" logiki między UI/desktop/shared.

## B. Duplikacja definicji i mapowań IPC (shared ↔ preload ↔ desktop ↔ UI)

Kontrakty i mapowania są utrzymywane w wielu miejscach:

- kanały i schemy: `packages/shared/src/ipc/contracts.ts`,
- mapowania `ipcMain.handle`: `apps/desktop/src/ipc-handlers.ts`,
- walidowany bridge preload: `apps/desktop/src/preload.ts`,
- warstwa wywołań UI: `apps/ui/src/lib/electron-api.ts`.

Konsekwencje:
- wysoki koszt dodania pojedynczego endpointu,
- większe ryzyko niespójności typów i nazw kanałów,
- utrudnione refaktory i automatyczne walidacje kompatybilności.

## C. Niski poziom testów UI względem złożoności interfejsu

- UI ma bardzo rozbudowany ekran główny (`App.tsx`),
- jednocześnie w `apps/ui/src` jest tylko 1 plik testowy (`use-dashboard-data.test.ts`).

Konsekwencje:
- największa powierzchnia regresji (interakcje użytkownika) ma najsłabszą ochronę testową,
- zmiany wizualne i sekwencje user-flow nie są objęte testami komponentowymi/e2e.

## D. Brak automatycznego egzekwowania granic zależności w CI

Aktualne CI uruchamia lint/typecheck/test/snapshots/build, ale nie ma kroku weryfikującego import graph i zakaz circular dependencies między pakietami.

Konsekwencje:
- ryzyko cichego naruszenia zasad architektury rośnie wraz z liczbą modułów,
- błędy tego typu wychodzą późno, zwykle przy większych refaktorach.

## E. Brak egzekwowania budżetów wydajności jako twardego gate w CI

W dokumentacji projektu są zdefiniowane budżety wydajności, ale CI ich nie sprawdza automatycznie.

Konsekwencje:
- degradacje wydajności mogą przechodzić niezauważone,
- szczególnie ryzykowne przy dalszym rozwoju UI i IPC.

---

## 3) Backlog poprawek dla kolejnego LLM (kolejność wdrażania)

## P0 — Stabilizacja architektury bez zmiany funkcjonalnej

1. **Rozbić `apps/ui/src/App.tsx` na moduły domenowe (feature-first).**
   - Cel: ≤ 600 LOC na moduł ekranu, osobne komponenty dla sekcji: Stats, Reports, Settings, Import, Assistant.
   - Dostarczyć: folder `apps/ui/src/features/*`, wyodrębnione komponenty i helpery formatowania.
   - DoD: brak zmian UX; wszystkie obecne testy PASS.

2. **Rozbić `apps/desktop/src/main.ts` na moduły runtime.**
   - Cel: separacja odpowiedzialności (bootstrap DB, profile manager, sync wiring, analytics wiring, window lifecycle).
   - Dostarczyć: `apps/desktop/src/runtime/*` + cienki `main.ts` jako orchestrator.
   - DoD: brak zmiany API IPC, testy integracyjne desktop PASS.

3. **Wydzielić `use-dashboard-data.ts` do hooków per domena.**
   - Cel: osobne pliki hooków dla: sync, ML, reports, import/search, assistant, diagnostics/planning.
   - DoD: zachowany publiczny interfejs używany przez App UI.

## P1 — Redukcja kosztu utrzymania IPC

4. **Wprowadzić generator/registry dla warstwy IPC.**
   - Cel: jedno źródło prawdy dla endpointów + automatyczne generowanie adapterów preload/UI (lub silnie typowany registry).
   - Minimalny zakres: zredukować ręczną duplikację mapowań kanałów i wrapperów invoke.
   - DoD: dodanie nowego endpointu wymaga zmian maksymalnie w 1-2 miejscach.

5. **Dodać test zgodności „IPC contract parity".**
   - Cel: test, który sprawdza że endpointy z kontraktów shared mają implementację i ekspozycję w preload/UI.
   - DoD: test failuje przy brakującym mapowaniu po którejkolwiek stronie.

## P1 — Twardsza jakość UI

6. **Rozszerzyć testy UI (React Testing Library / testy komponentowe).**
   - Priorytetowe scenariusze:
     - przełączanie zakładek,
     - one-click weekly flow,
     - obsługa błędów mutacji i komunikatów po polsku,
     - import CSV + walidacje.
   - DoD: min. 10 nowych testów komponentowych dla krytycznych flow.

7. **Dodać smoke E2E dla krytycznej ścieżki użytkownika.**
   - Zakres minimalny: start app → odczyt KPI → start sync → generacja raportu.
   - DoD: test uruchamialny lokalnie i w CI (nawet jako osobny job optional/allow-failure na start).

## P2 — Egzekwowanie reguł architektury i wydajności

8. **Dodać automatyczne sprawdzanie granic modułów i cykli importów w CI.**
   - Narzędzie: np. dependency-cruiser / madge (z regułami zgodnymi z AGENTS.md).
   - DoD: job CI failuje przy naruszeniu graph dependency.

9. **Dodać performance smoke gates do CI.**
   - Minimalnie:
     - kontrola rozmiaru bundla UI (próg + trend),
     - prosty benchmark p95 dla wybranych zapytań IPC.
   - DoD: jasne progi i raport artefaktów przy przekroczeniu.

10. **Wprowadzić limit wielkości pliku + limit złożoności funkcji (ESLint).**
    - Cel: zapobieganie odtwarzaniu „god files".
    - DoD: reguły `max-lines`, `complexity` dla krytycznych katalogów z uzasadnionymi wyjątkami.

---

## 4) Proponowany plan wykonania (2 sprinty AI)

### Sprint A (struktura i bezpieczeństwo zmian)
- Zadania: P0.1, P0.2, P0.3, P1.5.
- Kryterium wejścia: zielony baseline (`lint/typecheck/test/build`).
- Kryterium wyjścia: brak zmian funkcjonalnych, mniejsza liczba konfliktów i czytelniejsze moduły.

### Sprint B (jakość i skalowalność)
- Zadania: P1.4, P1.6, P1.7, P2.8, P2.9, P2.10.
- Kryterium wyjścia: krótszy czas dodawania endpointów IPC, lepsza ochrona regresyjna UI, twarde gate'y architektury/performance.

---

## 5) Ryzyka wdrożenia poprawek

- **Ryzyko 1:** refaktor modułów UI/desktop może naruszyć niejawne zależności.
  - Mitigacja: małe PR-y, testy po każdym kroku, brak zmiany kontraktów IPC.
- **Ryzyko 2:** zbyt ambitny generator IPC zwiększy złożoność toolingu.
  - Mitigacja: zacząć od „typed registry" zamiast pełnego codegen.
- **Ryzyko 3:** rozszerzenie testów UI może wydłużyć czas CI.
  - Mitigacja: podział testów na smoke + pełne, równoległe joby.

---

## 6) Następny krok (dla kolejnego LLM)

Zacznij od **Sprint A / zadanie P0.1** (rozbicie `App.tsx`) i wykonaj refaktor w małych, etapowych commitach:

1. wydziel komponenty per zakładka,
2. wydziel wspólne helpery formatowania,
3. utrzymaj istniejące teksty UI i kontrakty bez zmian,
4. po każdym etapie uruchom `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
