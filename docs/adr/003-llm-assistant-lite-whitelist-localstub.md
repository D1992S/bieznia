# ADR 003: LLM Assistant Lite - whitelist tools + LocalStub

- Status: Accepted
- Data: 2026-02-17
- Faza: 11

## Kontekst

Potrzebny jest asystent AI, ktory dziala evidence-first, offline i nie narusza granic architektury.
Wymagania:

- brak dowolnego SQL od uzytkownika,
- odpowiedz strukturalna z evidence,
- persystencja rozmow i evidence w SQLite,
- integracja przez IPC i UI bez omijania warstwy shared contracts.

## Decyzja

Wdraża się `@moze/llm` jako deterministiczny executor Lite z:

- whitelist narzedzi read-only:
  - `read_channel_info`,
  - `read_kpis`,
  - `read_top_videos`,
  - `read_anomalies`,
- LocalStub jako domyslny runtime (brak zewnetrznego providera),
- structured output:
  - `answer`,
  - `evidence[]`,
  - `confidence`,
  - `followUpQuestions[]`,
  - `usedStub`,
- persystencja:
  - `assistant_threads`,
  - `assistant_messages`,
  - `assistant_message_evidence`.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - tylko read-only tools,
  - deterministiczny LocalStub,
  - SQLite persistence,
  - IPC + UI tab (chat, watki, evidence viewer).
- Nie robimy:
  - integracji z zewnetrznymi LLM API,
  - planner/executor multi-step z dynamicznym SQL,
  - streamingu tokenow i zaawansowanej orkiestracji promptow,
  - nowego feature scope poza asystentem Lite.

## Alternatywy

1. Zewnetrzny provider LLM od razu.
   - Odrzucone: wyzsze ryzyko kosztow, zaleznosci i niestabilnosci.
2. Dowolne SQL jako narzedzie.
   - Odrzucone: ryzyko bezpieczenstwa i brak kontroli nad evidence.

## Konsekwencje

- Plusy:
  - stabilny, testowalny i offline-first asystent,
  - kontrolowany scope i niski koszt utrzymania.
- Minusy:
  - ograniczona elastycznosc odpowiedzi wzgledem pelnego LLM runtime.

## Metryki sukcesu

- odpowiedzi zawieraja evidence do konkretnych rekordow DB,
- testy integracyjne shared/llm/desktop przechodza,
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` bez bledow.
