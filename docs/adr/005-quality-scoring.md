# ADR 005: Quality Scoring - ranking contentu z percentile rank i confidence

- Status: Accepted
- Data: 2026-02-17
- Faza: 13

## Kontekst

Po Fazie 12 mamy stabilny pipeline, cache i trace dla analityki, ale brakowalo jednej warstwy:

- jawnego rankingu jakosci filmow,
- porownania materialow po wielu komponentach naraz,
- czytelnej informacji o wiarygodnosci wyniku przy krotkiej historii danych.

Bez tego dashboard pokazuje metryki punktowe, ale nie daje prostego priorytetu "ktore materialy sa najlepsze / najslabsze".

## Decyzja

Wprowadzamy quality scoring oparty o piec komponentow i normalizacje percentile rank wewnatrz kanalu:

- `velocity` (0.25),
- `efficiency` (0.20),
- `engagement` (0.25),
- `retention` (0.15),
- `consistency` (0.15).

Realizacja techniczna:

- nowa tabela `agg_quality_scores` (migracja `009-quality-scoring-schema`),
- serwis `@moze/analytics` (`getQualityScores`) liczacy komponenty i finalny score,
- persystencja wynikow do `agg_quality_scores` dla `(channel_id, video_id, date_from, date_to)`,
- confidence zalezny od `daysWithData`:
  - `high` > 60,
  - `medium` 30-60,
  - `low` < 30,
- nowy IPC endpoint `analytics:getQualityScores`,
- integracja UI w zakladce `Statystyki` (ranking + breakdown komponentow + confidence).

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - tabela `agg_quality_scores` + indeksy,
  - scoring dla aktywnego zakresu dat i kanalu,
  - zapis komponentow i score do bazy,
  - odczyt przez IPC i render rankingu w UI,
  - testy integracyjne (`analytics`, `shared`, `desktop`).
- Nie robimy:
  - konfiguracji wag przez uzytkownika,
  - osobnej osi trendu score (improving/declining/stable) per video,
  - dedykowanego panelu historycznego quality score w czasie,
  - rozszerzenia o competitor/topic scoring (to nalezy do Faz 14-15).

## Alternatywy

1. Normalizacja sigmoid.
   - Odrzucone: slabsza interpretowalnosc i wieksza wrazliwosc na outliery.
2. Score liczony tylko po jednej metryce (np. engagement).
   - Odrzucone: zbyt duze uproszczenie, brak balansu miedzy wzrostem i stabilnoscia.
3. Brak persystencji, tylko runtime response.
   - Odrzucone: utrudnia audyt i lineage wynikow.

## Konsekwencje

- Plusy:
  - czytelny ranking contentu dla aktywnego zakresu,
  - porownywalnosc filmow przez wspolny model komponentow,
  - jawna informacja o confidence przy krotkiej historii.
- Minusy:
  - dodatkowy koszt obliczeniowy przy odswiezaniu rankingu,
  - wynik zalezy od rozkladu danych w kanale (percentile jest relatywny, nie absolutny).

## Metryki sukcesu

- ranking zwraca score + breakdown dla aktywnego kanalu i zakresu,
- confidence labels sa zgodne z liczba dni historii,
- planted high-engagement scenario podnosi wybrany material w rankingu,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez bledow.
