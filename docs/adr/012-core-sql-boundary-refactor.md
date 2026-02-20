# ADR-012: SQL Boundary Centralization in `@moze/core`

- Status: Accepted
- Date: 2026-02-17

## Context

Kod domenowy w pakietach `@moze/llm`, `@moze/analytics`, `@moze/data-pipeline` i `@moze/ml` wykonywal bezposrednie `db.prepare(...)` (zarowno SELECT, jak i mutacje). To lamalo granice architektoniczna opisana w `AGENTS.md` i utrudnialo:

- jednolita obsluge bledow bazodanowych,
- testowanie warstwy dostepu do danych,
- kontrolowany rozwoj schematu SQL.

## Decision

Wprowadzamy twarda granice SQL: kod domenowy nie wykonuje juz bezposrednich zapytan `db.prepare(...)`.

Wszystkie zapytania zostaly przeniesione do `@moze/core`:

- Queries: `assistant`, `competitor`, `planning`, `quality`, `topic`, `pipeline`, `ml`
- Repositories: `assistant`, `competitor`, `planning`, `quality`, `topic`, `pipeline`, `ml`

Pakiety domenowe korzystaja tylko z metod `create*Queries` i `create*Repository`, zwracajacych `Result<T, AppError>`.

## Scope Freeze

Zakres ADR obejmuje tylko centralizacje SQL i standaryzacje obslugi bledow.
Poza zakresem:

- zmiany logiki biznesowej rankingow/scoringow,
- zmiany schematu bazy danych,
- zmiany kontraktow IPC/API.

## Consequences

- Plusy:
  - wyrazna separacja odpowiedzialnosci (domain vs data-access),
  - jednolity model bledow DB,
  - latwiejsze audyty i dalsze refaktory.
- Minus:
  - wieksza liczba modulow w `@moze/core` i koszt utrzymania mapowania typow.

## Verification

Weryfikacja po wdrozeniu:

- brak `db.prepare(...)` w kodzie produkcyjnym pakietow domenowych,
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` przechodza.
