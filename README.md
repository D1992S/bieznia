# Mozetobedzieto

Mozetobedzieto to desktopowa aplikacja analityczna dla twórców YouTube.

Cel: w jednym miejscu przejść od danych kanału do decyzji publikacyjnych:
- zsynchronizować dane,
- przeanalizować KPI, trendy i anomalie,
- sprawdzić jakość treści, konkurencję i tematy,
- wygenerować plan publikacji,
- wyeksportować raport.

## Co aplikacja robi w praktyce

### 1) Zakładka `Statystyki`
- KPI kanału dla wybranego zakresu dat.
- Wykres szeregów czasowych + prognoza ML.
- Analiza anomalii i punktów zmiany trendu.
- Ocena jakości treści (ranking filmów).
- Analiza konkurencji (snapshoty i momentum).
- Analiza tematów (klastry i luki contentowe).
- Planowanie publikacji (rekomendacje z uzasadnieniem).
- Diagnostyka i naprawa kluczowych modułów.

### 2) Zakładka `Asystent AI`
- Asystent odpowiada na pytania o dane z aplikacji.
- Pokazuje kontekst/evidence użyte do odpowiedzi.
- Utrzymuje historię wątków i wiadomości.

### 3) Zakładka `Raporty i eksport`
- Generuje raport dashboardowy.
- Eksportuje wyniki do plików (JSON/CSV/HTML).

### 4) Zakładka `Import i wyszukiwanie`
- Importuje dane CSV do lokalnej bazy.
- Obsługuje mapowanie kolumn i walidację danych.
- Umożliwia wyszukiwanie treści po imporcie.

### 5) Zakładka `Ustawienia`
- Profile użytkownika (przełączanie kontekstu pracy).
- Połączenie/rozłączenie konta YouTube.
- Ustawienia domyślnego kanału i zakresu dat.
- Przełączanie trybu danych (`fake` / `real` / `record`).

## Jak używać aplikacji (prosty workflow)

1. Otwórz zakładkę `Statystyki`.
2. Ustaw zakres dat (np. 30 dni) i kanał.
3. Kliknij `Uruchom przebieg tygodniowy` (one-click flow).
4. Sprawdź:
   - KPI i prognozę,
   - anomalie/trendy,
   - jakość treści,
   - konkurencję i tematy,
   - plan publikacji.
5. Przejdź do `Raporty i eksport` i zapisz raport.
6. Jeśli coś działa niestabilnie, użyj sekcji `Diagnostyka i naprawa`.

## Instalacja i uruchomienie

### Wymagania
- Node.js `>=22`
- pnpm `>=10`

### Start lokalny (dev)

```bash
corepack pnpm install
corepack pnpm dev
```

Po starcie aplikacja uruchamia:
- UI (`Vite`) na `http://localhost:5173`,
- desktop (`Electron`) z backendem IPC.

## Najczęstsze problemy i szybkie rozwiązania

### Problem: błąd `better-sqlite3` / `NODE_MODULE_VERSION`
Objaw: aplikacja lub testy nie startują po zmianie wersji Node/Electron.

Rozwiązanie:
1. Dla testów pod Node:
```bash
pnpm --filter @moze/core rebuild better-sqlite3
```
2. Dla uruchomienia desktop (Electron) przebuduj zależności natywne pod Electron.

### Problem: uruchamia się tylko web UI bez IPC
Sprawdź, czy startujesz przez:
```bash
corepack pnpm dev
```
a nie sam serwer UI.

## Bramka jakości (dla developmentu)

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Architektura repo (skrót)

- `apps/desktop` - proces główny Electron + IPC backend.
- `apps/ui` - interfejs React.
- `packages/core` - DB SQLite, migracje, zapytania.
- `packages/sync` - synchronizacja danych.
- `packages/data-pipeline` - pipeline analityczny.
- `packages/ml` - modele i analizy ML.
- `packages/analytics` - scoring, konkurencja, tematy, planowanie.
- `packages/reports` - raporty i eksport.
- `packages/diagnostics` - health checks i recovery.
- `packages/llm` - warstwa asystenta AI.

## Status projektu

Projekt jest ukończony funkcjonalnie dla faz 0-20 (z wyjątkiem Fazy 17 oznaczonej jako `SKIP solo`).

Szczegóły planu i statusu:
- `NEXT_STEP.md`
- `docs/PLAN_REALIZACJI.md`
- `docs/architecture/overview.md`
