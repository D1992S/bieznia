# ADR 011: Wybór stacku technologicznego

- Status: Zaakceptowany
- Data: 2026-02-17
- Faza: przekrojowa (0-20)

## Kontekst

Aplikacja ma działać lokalnie (offline-first), być łatwa w utrzymaniu przez mały zespół i umożliwiać szybkie iteracje analityki bez backendu chmurowego.

## Decyzja

Przyjmujemy następujący stack jako docelowy i stabilny:

- Runtime aplikacji: Electron.
- Język: TypeScript (strict).
- Baza danych: SQLite (`better-sqlite3`) + migracje forward-only.
- UI: React + TanStack Query + Zustand.
- Granica komunikacji: IPC z walidacją Zod (`@moze/shared`).
- Testy: Vitest (unit/integration/smoke), snapshoty analityki.
- Raportowanie: lokalny eksport JSON/CSV/HTML/PDF bez usług zewnętrznych.

## Uzasadnienie

- Electron + SQLite spełnia wymóg offline-first i prostą dystrybucję lokalną.
- TypeScript strict + Zod obniża ryzyko regresji na granicach IPC.
- React Query + Zustand dobrze rozdzielają async state i local UI state.
- Monorepo z pakietem shared utrzymuje spójny kontrakt między UI i desktop runtime.

## Konsekwencje

- Plusy:
  - przewidywalny rozwój bez zależności od backendu SaaS,
  - pełna kontrola nad danymi i logiką analityczną,
  - wysoka testowalność i czytelna separacja warstw.
- Minusy:
  - większa odpowiedzialność za wydajność i utrzymanie lokalnego runtime,
  - konieczność dbania o granice modułów i budżety techniczne wraz ze wzrostem kodu.

## Alternatywy odrzucone

1. Web-app + zewnętrzny backend API.
   - Odrzucone: większy koszt operacyjny i naruszenie założenia local-first.
2. Serwerowa baza (PostgreSQL) dla trybu solo.
   - Odrzucone: nadmiarowa złożoność wdrożeniowa dla single-user.
3. Niestrukturalna komunikacja bez kontraktów Zod.
   - Odrzucone: rosnące ryzyko niezgodności IPC i trudniejsze debugowanie.
