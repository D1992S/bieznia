# ADR 008: Planning System - deterministyczny planner publikacji

- Status: Accepted
- Date: 2026-02-17
- Faza: 16

## Kontekst

Po Fazie 15 aplikacja ma trzy niezalezne zrodla sygnalow:

- quality scoring materialow,
- intelligence konkurencji,
- luki i trendy tematyczne.

Brakowalo warstwy, ktora zamienia te sygnaly na konkretny plan publikacji z priorytetem, terminem i uzasadnieniem.

## Decyzja

Wdrażamy deterministyczny Planning System (MVP), bez komponentu generatywnego:

- kontrakty IPC:
  - `planning:generatePlan`,
  - `planning:getPlan`.
- nowe DTO:
  - input generowania i odczytu planu,
  - `PlanningPlanResultDTO`,
  - `PlanningRecommendationItemDTO`,
  - `PlanningEvidenceItemDTO`.
- migracja `012-planning-system-schema`:
  - `planning_plans`,
  - `planning_recommendations`.
- serwis `@moze/analytics`:
  - `generatePlanningPlan(...)`,
  - `getPlanningPlan(...)`,
  - ranking rekomendacji z sygnalow quality + competitor + topic,
  - conflict resolution (deduplikacja tematow + kara za kanibalizacje),
  - persystencja planu i read-only odczyt.
- UI:
  - panel „System planowania (Faza 16)” w zakladce `Statystyki`,
  - generowanie planu, lista rekomendacji, rationale i evidence.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - planner oparty o reguly deterministyczne,
  - persystencje planu,
  - evidence + confidence + ostrzezenia kanibalizacji,
  - integracje `shared/core/analytics/desktop/ui`,
  - testy integracyjne planera i IPC.
- Nie robimy:
  - auto-publikacji do kalendarzy zewnetrznych,
  - plugin runtime / alert center (Faza 17 = SKIP w trybie solo),
  - asynchronicznej orkiestracji wieloetapowych workflow AI.

## Alternatywy

1. LLM planner jako glowny silnik decyzji.
   - Odrzucone: brak deterministycznosci i trudniejsza reprodukowalnosc.
2. Planner bez persystencji (tylko runtime response).
   - Odrzucone: brak historii i slabasza audytowalnosc.
3. Planner oparty tylko o topic gaps.
   - Odrzucone: pomija jakosc materialow i sygnaly konkurencji.

## Konsekwencje

- Plusy:
  - jawny, reprodukowalny plan publikacji z uzasadnieniem,
  - latwa integracja z kolejnymi fazami (Diagnostics + Recovery),
  - spojnosc z architektura evidence-first.
- Minusy:
  - heurystyczny ranking wymaga dalszego strojenia wag,
  - jakość planu zalezy od swiezosci danych quality/topic/competitor.

## Metryki sukcesu

- planner zwraca rekomendacje publikacji dla zakresu dat,
- kazda rekomendacja ma rationale + evidence + confidence,
- UI generuje i odczytuje plan bez bledow IPC,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez bledow.
