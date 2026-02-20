# ADR 006: Competitor Intelligence - snapshoty konkurencji, hit detection i momentum

- Status: Accepted
- Data: 2026-02-17
- Faza: 14

## Kontekst

Po Fazie 13 aplikacja umiala oceniac jakosc naszych filmow, ale brakowalo warstwy porownawczej:

- jak nasze wyniki wypadaja na tle konkurencji,
- czy konkurenci publikuja szybciej lub wolniej od nas,
- kiedy konkurencja publikuje "hity" znaczaco ponad swoim baseline.

Bez tego decyzje strategiczne (tempo publikacji, reakcja na ruchy rynku) są robione bez twardych sygnalow.

## Decyzja

Wprowadzamy modul Competitor Intelligence oparty o dzienne snapshoty i analityke porownawcza:

- migracja `010-competitor-intelligence-schema`:
  - `dim_competitor`,
  - `fact_competitor_day`,
  - indeksy po `channel_id/date` i `(channel_id, competitor_channel_id, date)`.
- nowy serwis `@moze/analytics`:
  - `syncCompetitorSnapshots(...)`:
    - deterministiczny local-stub provider metryk konkurencji,
    - delta detection (`inserted/updated/unchanged`) przy zapisie snapshotow.
  - `getCompetitorInsights(...)`:
    - relative growth vs kanal wlasciciela,
    - market share,
    - content frequency comparison,
    - hit detection (`views > mean + 3 * sigma`),
    - momentum score i ranking.
- nowe IPC endpointy:
  - `analytics:syncCompetitors`,
  - `analytics:getCompetitorInsights`.
- UI:
  - panel "Analiza konkurencji (Faza 14)" w zakladce `Statystyki`,
  - synchronizacja danych konkurencji,
  - ranking momentum + lista hitow.

## Scope Freeze (robimy / nie robimy)

- Robimy:
  - schema + storage konkurencji,
  - sync snapshotow z delta detection,
  - porownanie min. 3 kanalow konkurencji,
  - hit detection i ranking momentum,
  - integracje `shared/core/analytics/desktop/ui`,
  - testy integracyjne i aktualizacje dokumentacji.
- Nie robimy:
  - realnego pobierania z YouTube Data API (pelna integracja providerow zostaje na kolejne iteracje),
  - wizualny wykres radarowy (MVP pokazuje porownanie tabelaryczne/tekstowe),
  - alerting push/notification center,
  - persystencji progow konfigurowanych przez uzytkownika.

## Alternatywy

1. Zapis tylko agregatow tygodniowych.
   - Odrzucone: utrata precyzji dla hit detection i momentum.
2. Brak persystencji, jedynie runtime compare.
   - Odrzucone: brak audytu i slabasza testowalnosc.
3. Hit detection po sztywnym progu absolutnym views.
   - Odrzucone: brak dopasowania do skali poszczegolnych konkurentow.

## Konsekwencje

- Plusy:
  - porownanie "my kanal vs konkurenci" w jednym panelu,
  - wykrywanie outlierow konkurencji przez baseline per kanal,
  - czytelny sygnal momentum do priorytetyzacji reakcji.
- Minusy:
  - dodatkowa zlozonosc storage i query path,
  - local-stub metryk konkurencji nie zastepuje jeszcze prawdziwego provider API.

## Metryki sukcesu

- dane konkurencji zapisywane i odczytywane przez IPC,
- planted outlier jest flagowany jako hit (`zScore > 3`),
- UI pokazuje porownanie min. 3 konkurentow po synchronizacji,
- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` przechodzi bez bledow.
