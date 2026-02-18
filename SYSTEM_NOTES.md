# SYSTEM_NOTES.md

Krotkie notatki operacyjne dla trybu solo.

## 1. Mapa systemu

- `apps/desktop`: Electron main/preload + IPC handlers.
- `apps/ui`: React UI (komunikacja tylko przez IPC).
- `packages/shared`: DTO, schemy Zod, kontrakty IPC, `AppError`.
- `packages/core`: SQLite, migracje, query/repository layer.
- `packages/sync`: orkiestracja synchronizacji i retry.
- `packages/data-pipeline`: ETL i cechy.
- `packages/ml`: baseline, anomaly, trend.
- `packages/analytics`: quality, competitor, topic, planning.
- `packages/reports`: raport i eksport.
- `packages/llm`: asystent lite i read-only tooling.
- `packages/diagnostics`: health checks i recovery.

## 2. Najwazniejsze komendy

### Dev

```bash
pnpm dev
```

### Pelna regresja

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:perf
pnpm check:boundaries
pnpm check:loc
```

### Snapshoty

```bash
pnpm test:snapshots
pnpm test:snapshots:update
```

## 3. Najczestsze scenariusze debug

### A. CI padl na perf

1. `pnpm build`
2. `pnpm check:perf`
3. sprawdz rozmiary chunkow w `apps/ui/dist/assets`.

### B. CI padl na boundaries

1. `pnpm check:boundaries`
2. popraw importy niezgodne z grafem zaleznosci.

### C. CI padl na LOC

1. `pnpm check:loc`
2. sprawdz hotspoty:
   - `apps/ui/src/features/studio/studio-app.tsx`
   - `apps/desktop/src/runtime/desktop-main.ts`
   - `apps/desktop/src/ipc-handlers.ts`
   - `apps/ui/src/hooks/dashboard/use-dashboard-data-core.ts`

### D. Desktop nie startuje po zmianach

1. `pnpm --filter @moze/desktop run build`
2. `pnpm dev`
3. w razie problemow z natywnymi modulami: rebuild `better-sqlite3`.

## 4. Rytm utrzymania (S3)

Co 2-4 tygodnie:

1. `pnpm audit`
2. `pnpm outdated -r`
3. bezpieczny batch aktualizacji
4. pelna regresja (sekcja 2)

## 5. Zasada zmian

- najpierw poprawka/funkcja,
- refaktor tylko lokalnego fragmentu, ktory i tak dotykasz,
- po zmianie zawsze wpis do `CHANGELOG_AI.md` i aktualizacja `NEXT_STEP.md`.
