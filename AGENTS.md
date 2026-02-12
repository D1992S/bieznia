# AGENTS.md — Zasady modyfikacji kodu

> Ten plik jest **obowiązkowym punktem startowym** dla każdego modelu AI pracującego nad tym repozytorium.

## 1. Przed rozpoczęciem pracy

1. Przeczytaj ten plik (`AGENTS.md`).
2. Przeczytaj `docs/architecture/overview.md` — mapa modułów.
3. Przeczytaj `docs/architecture/data-flow.md` — pipeline danych.
4. Przeczytaj `CHANGELOG_AI.md` — ostatnie 5 wpisów (kontekst zmian).
5. Przeczytaj runbook dla swojego zadania (`docs/runbooks/`).

## 2. Zasady modyfikacji

### Granice modułów

```
packages/shared    → Importowalny przez WSZYSTKIE pakiety. Zero zależności wewnętrznych.
packages/core      → Zależy od: shared. Dostęp do SQLite.
packages/data-pipeline → Zależy od: shared, core.
packages/sync      → Zależy od: shared, core, data-pipeline.
packages/reports   → Zależy od: shared, core.
packages/llm       → Zależy od: shared, core.
packages/ml        → Zależy od: shared, core, data-pipeline.
packages/analytics → Zależy od: shared, core, ml.
packages/plugins   → Zależy od: shared, core.
packages/diagnostics → Zależy od: shared, core.
apps/desktop       → Zależy od: shared + dowolny package (main process).
apps/ui            → Zależy od: shared (TYLKO). Komunikacja przez IPC.
```

**Zasady:**
- `apps/ui` **NIGDY** nie importuje z `core`, `sync`, `ml`, itp. — tylko `shared`.
- Circular dependencies = błąd krytyczny.
- Nowa zależność między pakietami wymaga aktualizacji tego pliku.

### Konwencje kodu

- **TypeScript strict** — zero `any`, zero `as` casts bez uzasadnienia w komentarzu.
- **Zod** walidacja na wszystkich granicach (IPC, API, import).
- **Explicit sorting** — każde query z ORDER BY.
- **Result type** — `Result<T, AppError>` zamiast throw (w logice biznesowej).
- **Naming**: camelCase (zmienne/funkcje), PascalCase (typy/klasy), SCREAMING_SNAKE (stałe).
- **Pliki**: kebab-case (`get-kpis.ts`, `channel-info-dto.ts`).

### Co WOLNO

- Dodawać nowe DTO/eventy/kontrakty w `shared`.
- Dodawać nowe migracje w `core` (forward-only, numbered).
- Dodawać nowe IPC handlery w `desktop` (z kontraktem w `shared`).
- Dodawać nowe komponenty w `ui` (z hookami do IPC przez TanStack Query).
- Dodawać testy.

### Czego NIE WOLNO

- Łamać istniejących kontraktów IPC (backwards compatibility).
- Usuwać/modyfikować istniejących migracji (tylko nowe).
- Importować pakietów niezgodnie z grafem zależności powyżej.
- Commitować bez wpisu w `CHANGELOG_AI.md`.
- Robić "duży refactor" bez ADR (`ADR/*.md`).
- Dodawać `any` lub `@ts-ignore` bez uzasadnienia.
- Usuwać lub modyfikować testów, które nie są bezpośrednio związane z taskiem.

## 3. Rytuał zakończenia sesji

Przed zakończeniem każdej sesji AI:

1. **Regression check**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
2. **CHANGELOG_AI.md**: dodaj wpis z template (data, autor, zakres, co/dlaczego, ryzyko, weryfikacja, następny krok).
3. **DoD checklist**: zweryfikuj Definition of Done z `docs/PLAN_REALIZACJI.md` sekcja 8.
4. **Ryzyka**: wymień w commicie co może się wysypać.
5. **Następny krok**: opisz co powinien zrobić kolejny model/developer.

## 4. Struktura commitów

```
<type>(<scope>): <opis>

Typy: feat, fix, refactor, test, docs, chore
Scope: shared, core, data-pipeline, sync, reports, llm, ml, analytics, plugins, diagnostics, desktop, ui

Przykład: feat(ml): add Holt-Winters baseline forecast model
```

## 5. Priorytety przy konflikcie

1. **Nie łam istniejących testów** — napraw swój kod, nie testy.
2. **Nie łam IPC kontraktów** — dodaj nowy endpoint zamiast modyfikować stary.
3. **Performance budget** — jeśli przekraczasz limity, optymalizuj lub zgłoś jako ryzyko.
4. **Data integrity** — SQLite constraints > application-level checks.
