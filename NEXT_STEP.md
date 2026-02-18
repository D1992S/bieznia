# NEXT_STEP.md - Plan Solo (aktualny)

> Ten plik ma byc krotki i aktualny. Historyczne szczegoly trzymamy w `CHANGELOG_AI.md`.

## Status produktu

| Obszar | Status |
|---|---|
| Fazy 0-20 | DONE |
| Faza 17 Plugins (solo) | SKIP |
| Stabilnosc po merge PR #27 | OK |

## Plan solo (obowiazujacy)

### S1 - Porzadek operacyjny minimum
Status: DONE

Zakres:
- `NEXT_STEP.md` jest skrocony i aktualny.
- Po kazdej sesji dopisywany jest wpis do `CHANGELOG_AI.md`.
- Jeden aktualny runbook smoke/regresji: `docs/runbooks/smoke-regression-solo.md`.

### S2 - Realne bramki jakosci
Status: DONE

Zakres:
- Utrzymane gate'y: `lint`, `typecheck`, `test`, `build`, `check:boundaries`, `check:perf`, `test:snapshots`.
- `check:loc` pilnuje realnych hotspotow kodu (nie cienkich wrapperow).

### S3 - Cykliczny maintenance (co 2-4 tygodnie)
Status: DONE (cykl 1: 2026-02-18)

Zakres:
1. `pnpm audit` i ocena ryzyk.
2. `pnpm outdated -r` i bezpieczny batch update.
3. Pelna regresja:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `pnpm check:perf`

Wynik cyklu 1:
- wykonano bezpieczny batch update:
  - `typescript-eslint` -> `8.56.0`
  - `electron` -> `40.4.1`
- pelna regresja PASS.
- pozostale aktualizacje (major) odlozone do osobnego okna:
  - `eslint`, `@eslint/js`, `vite`, `@vitejs/plugin-react`, `esbuild`.
- pozostaje 1 advisory `moderate` (`ajv` przez `eslint` chain); do domkniecia przy planowanym oknie upgrade `eslint`.

### S4 - Refaktor przy okazji
Status: TODO (opcjonalne)

Zasada:
- Refaktor tylko lokalnego fragmentu, gdy i tak dotykasz duzego pliku.

### S5 - Dokumentacja minimum
Status: DONE

Zakres:
- Jeden plik notatek systemowych: `SYSTEM_NOTES.md`.

## Co robimy teraz

1. Rozwijac funkcje produktowe i robic tylko lokalne refaktory (S4).
2. Zaplanowac kolejne okno S3 za 2-4 tygodnie (lub szybciej, jesli wejdzie zmiana toolchainu).

## Definicja gotowosci sesji

Sesja jest zamknieta, gdy:
- `CHANGELOG_AI.md` ma aktualny wpis,
- `NEXT_STEP.md` wskazuje jeden, konkretny nastepny krok,
- repo jest zielone na kluczowych bramkach.
