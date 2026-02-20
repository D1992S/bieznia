# Smoke + Regresja (Solo) - aktualny runbook

## Cel

Szybko potwierdzic, ze aplikacja po zmianach nadal dziala i nadaje sie do codziennej pracy.

## Krok 1: bramki techniczne (obowiazkowe)

Uruchom:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:perf
```

Warunek przejscia:
- wszystkie komendy PASS.

## Krok 2: szybki smoke funkcjonalny (10-15 min)

1. Start aplikacji:
- `pnpm dev`
- UI i desktop startuja bez bledu.

2. Dashboard:
- KPI i wykres laduja sie.
- Zmiana zakresu dat odswieza dane.

3. Sync:
- start sync,
- widoczny postep,
- brak crashu po zakonczeniu.

4. Import/Search:
- podglad CSV,
- import CSV,
- wyszukiwanie tresci zwraca wyniki.

5. Raport:
- generacja raportu,
- eksport plikow.

## Krok 3: decyzja

GO:
- bramki techniczne PASS,
- smoke PASS,
- brak blockerow.

NO-GO:
- dowolna bramka FAIL,
- krytyczny blad w smoke.

## Co zapisac po sesji

1. Krotki wpis w `CHANGELOG_AI.md`.
2. Aktualizacja `NEXT_STEP.md` (jednoznaczny kolejny krok).
