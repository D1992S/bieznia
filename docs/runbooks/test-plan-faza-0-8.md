# Runbook testów funkcjonalnych (Fazy 0-8)

> Cel: dopracować i ustabilizować funkcje dostarczone do końca Fazy 8, zanim rozpoczniemy Fazę 9.

## 0. Instrukcja krok po kroku (dla osoby bez doświadczenia)

Jeśli to Twoje pierwsze testy, zrób **dokładnie** poniższe kroki w tej kolejności.

### Krok 0 — przygotowanie
1. Otwórz terminal w katalogu projektu.
2. Wklej i uruchom:
   - `corepack pnpm install`
   - `corepack pnpm dev`
3. Poczekaj aż:
   - otworzy się okno aplikacji desktop,
   - strona `http://127.0.0.1:5173` odpowiada.

### Krok 1 — wykonaj 7 obszarów testowych (po kolei)
Przejdź przez sekcje:
1. Foundation (2.1)
2. Data Core (2.2)
3. Data Modes (2.3)
4. Sync (2.4)
5. ML baseline (2.5)
6. Raporty i eksport (2.6)
7. Profile/settings/auth (2.7)

W każdej sekcji:
- wykonaj część **Manual QA**,
- zapisz wynik jako `PASS` albo `FAIL`,
- jeśli `FAIL`, zapisz: co kliknięto, co się stało, co powinno się stać.

### Krok 2 — użyj AI (LLM) do sprawdzenia logów
1. Skopiuj prompt z danej sekcji.
2. Wklej do modelu AI.
3. Dołącz dane wejściowe (logi, payloady, zrzuty ekranu).
4. Zapisz odpowiedź modelu i oznacz wynik `PASS`/`FAIL`.

### Krok 3 — decyzja "czy możemy wejść w Fazę 9"
Możemy przejść dalej tylko jeśli:
- nie ma otwartych błędów P0/P1,
- regresja techniczna jest zielona (`lint/typecheck/test/build`),
- krytyczne ścieżki E2E przechodzą.

### Gotowy szablon raportu (kopiuj-wklej)
```md
# Raport testów Fazy 0-8 — [DATA]

## Wynik końcowy
- Foundation: PASS/FAIL
- Data Core: PASS/FAIL
- Data Modes: PASS/FAIL
- Sync: PASS/FAIL
- ML baseline: PASS/FAIL
- Raporty/Eksport: PASS/FAIL
- Profile/Settings/Auth: PASS/FAIL

## Błędy P0/P1
- [ ] brak
- [ ] są (lista poniżej)

## Lista błędów
1. [PRIORYTET] Tytuł
   - Kroki odtworzenia:
   - Wynik obecny:
   - Wynik oczekiwany:
   - Załączniki (log/screenshot):

## Decyzja
- [ ] GOTOWE do Fazy 9
- [ ] NIEGOTOWE do Fazy 9
```

---

## 1. Zakres testów

Plan obejmuje:
- testy manualne (operator/UI),
- testy wspierane przez LLM (asystent QA analizujący logi, wyniki i artefakty),
- regresję techniczną (lint/typecheck/test/build).

Aktualnie objęte obszary funkcjonalne:
- Foundation + uruchamianie aplikacji,
- Data Core + odczyt KPI/timeseries/channel info,
- Data modes (`fake`, `real`, `record`) + probe,
- Sync Orchestrator,
- Bazowy ML (baseline + forecast),
- Dashboard + Raporty + Eksport,
- Auth + Profile + Settings.

## 2. Matryca funkcji: test manualny + prompt dla LLM

Każdy scenariusz ma dwie części:
1. **Manual QA** — co klikać i co ma się wydarzyć.
2. **Prompt dla LLM** — gotowy tekst do wklejenia do modelu oceniającego jakość i spójność.

---

## 2.1 Foundation / startup / zdrowie runtime

### Manual QA
1. Uruchom:
   - `corepack pnpm install`
   - `corepack pnpm dev`
2. Zweryfikuj:
   - UI odpowiada pod `http://127.0.0.1:5173`.
   - Desktop Electron startuje bez błędu preload/import.
   - Brak krytycznych błędów w konsoli main/renderer.
3. W aplikacji odśwież widok i ponownie uruchom desktop — aplikacja ma pozostać stabilna.

### Prompt dla LLM (diagnoza startupu)
```text
Jesteś QA Lead dla aplikacji Electron + React. Oceń startup i stabilność runtime.

Dane wejściowe:
- log z uruchomienia `corepack pnpm dev`
- log konsoli Electron main
- log konsoli renderer
- informacja, czy UI odpowiada pod http://127.0.0.1:5173

Sprawdź:
1) Czy występują błędy blokujące preload/IPC/runtime.
2) Czy pojawiają się oznaki błędnego bundlingu (ESM/CJS mismatch).
3) Czy są ostrzeżenia, które mogą stać się regresją (np. ABI/node).
4) Czy startup można uznać za GOTOWY DO QA (TAK/NIE) + uzasadnienie.

Zwróć odpowiedź w formacie:
- Status: PASS/FAIL
- Krytyczne problemy
- Problemy niekrytyczne
- Rekomendowane działania naprawcze (max 5)
```

---

## 2.2 Data Core: KPI, timeseries, channel info

### Manual QA
1. Na aktywnym profilu sprawdź dashboard dla domyślnego kanału.
2. Zweryfikuj, że:
   - KPI są widoczne i mają wartości liczbowe,
   - wykres timeseries renderuje punkty,
   - dane kanału (nazwa/opis/statystyki) są ładowane.
3. Zmień zakres dat (np. 7d, 30d, 90d) i sprawdź odświeżenie danych.
4. Wymuś przypadek „brak danych” (np. nietrafiony channelId w ustawieniach) i sprawdź czy błąd jest czytelny dla użytkownika.

### Prompt dla LLM (walidacja jakości danych)
```text
Przeanalizuj dane wyjściowe UI/API dla KPI, timeseries i channel info.

Dane wejściowe:
- payloady odpowiedzi dla: db:getKpis, db:getTimeseries, db:getChannelInfo
- zrzuty ekranu/dashboard po zmianie zakresu dat
- ewentualne błędy user-facing

Sprawdź:
1) Spójność zakresu dat i metryk między KPI a timeseries.
2) Czy wartości wyglądają realistycznie (brak oczywistych anomalii typu ujemne views).
3) Czy user-facing error messages są po polsku i zrozumiałe.
4) Czy odpowiedzi pasują do kontraktów DTO (wymagane pola, typy logiczne).

Zwróć:
- PASS/FAIL
- Lista niespójności danych
- Lista niespójności UX/komunikatów
- Priorytety poprawek (P0/P1/P2)
```

---

## 2.3 Data Modes (`fake` / `real` / `record`) + probe

### Manual QA
1. Otwórz sekcję trybu danych.
2. Przełącz kolejno: `fake` → `real` → `record` → `fake`.
3. Po każdej zmianie sprawdź:
   - potwierdzenie aktywnego trybu,
   - czy dashboard dalej działa,
   - czy nie ma zawieszenia UI.
4. Uruchom `probe` i zweryfikuj, że zwraca sensowne informacje (provider, liczność recent videos, ścieżka record file gdy dotyczy).

### Prompt dla LLM (analiza zachowania trybów)
```text
Oceń poprawność działania trybów danych fake/real/record.

Dane wejściowe:
- logi IPC dla app:getDataMode, app:setDataMode, app:probeDataMode
- obserwacje UI po każdym przełączeniu trybu
- payload probe

Sprawdź:
1) Czy przejścia stanów są deterministyczne i bez niespójności.
2) Czy UI i backend raportują ten sam aktywny tryb.
3) Czy probe daje dane użyteczne diagnostycznie.
4) Czy istnieją ryzyka race condition przy szybkim przełączaniu.

Zwróć:
- PASS/FAIL
- Wykryte niespójności stanów
- Potencjalne race conditions
- Konkretne rekomendacje hardeningu
```

---

## 2.4 Sync Orchestrator

### Manual QA
1. Uruchom sync (`sync:start`) dla aktywnego kanału.
2. Obserwuj postęp i status końcowy.
3. Jeśli możliwe, zasymuluj przerwanie i użyj `sync:resume`.
4. Zweryfikuj:
   - postęp rośnie,
   - status końcowy jest spójny,
   - po wznowieniu nie ma duplikacji ani utraty integralności.

### Prompt dla LLM (audyt sync)
```text
Przeanalizuj przebieg syncu i jego odporność.

Dane wejściowe:
- logi eventów: sync:progress, sync:complete, sync:error
- payloady odpowiedzi: sync:start, sync:resume
- dane przed/po sync (rekordy i metryki)

Sprawdź:
1) Czy progresja etapów jest logiczna.
2) Czy retry/resume zachowuje spójność danych.
3) Czy błędy są klasyfikowane i raportowane w czytelny sposób.
4) Czy można uznać mechanizm za bezpieczny do dalszej rozbudowy (TAK/NIE).

Zwróć:
- PASS/FAIL
- Problemy integralności danych
- Problemy ergonomii UX
- Sugestie monitoringu i alertów
```

---

## 2.5 Bazowy ML: baseline + forecast

### Manual QA
1. Uruchom baseline ML (`ml:runBaseline`) dla metryki `views`.
2. Pobierz forecast (`ml:getForecast`) i sprawdź:
   - punkt forecastu,
   - confidence interval,
   - metadane modelu.
3. Zmień metrykę (np. `subscribers`) i porównaj wynik.
4. Zweryfikuj zachowanie przy małej ilości danych (czy degradacja jest kontrolowana i czytelna).

### Prompt dla LLM (ocena jakości forecastu)
```text
Oceń jakość i wiarygodność baseline forecast.

Dane wejściowe:
- output ml:runBaseline
- output ml:getForecast dla min. dwóch metryk
- liczba punktów historycznych użytych do treningu

Sprawdź:
1) Czy forecast jest numerycznie sensowny względem historii.
2) Czy confidence interval ma poprawną logikę (low <= point <= high).
3) Czy metryki jakości modelu są spójne i interpretowalne.
4) Czy przy małej liczbie danych aplikacja stosuje graceful degradation.

Zwróć:
- PASS/FAIL
- Ocena ryzyka błędnej interpretacji przez użytkownika
- Rekomendacje dla UX prezentacji forecastu
```

---

## 2.6 Dashboard + Raporty + Eksport

### Manual QA
1. Otwórz dashboard i sprawdź komplet: KPI, wykresy, sekcja raportów.
2. Wygeneruj raport (`reports:generate`) dla zakresu 30d.
3. Wyeksportuj raport (`reports:export`) w formatach: `json`, `csv`, `html`.
4. Zweryfikuj:
   - pliki powstały,
   - pliki mają niezerowy rozmiar,
   - zawartość zgadza się z danymi na dashboardzie.

### Prompt dla LLM (audyt raportowania)
```text
Oceń spójność i jakość raportów oraz eksportu.

Dane wejściowe:
- wynik reports:generate
- wynik reports:export (lista plików + sizeBytes)
- próbki zawartości JSON/CSV/HTML
- zrzut dashboardu dla tego samego zakresu dat

Sprawdź:
1) Czy raport i dashboard prezentują ten sam obraz danych.
2) Czy formaty eksportu zawierają kluczowe sekcje i są kompletne.
3) Czy nie ma rozjazdów dat/metryk między plikami.
4) Czy insighty są zrozumiałe i nie wprowadzają w błąd.

Zwróć:
- PASS/FAIL
- Tabela rozjazdów (jeśli są)
- Priorytet poprawek
```

---

## 2.7 Auth + Profile + Settings

### Manual QA
1. Profile:
   - utwórz nowy profil,
   - przełącz aktywny profil,
   - zamknij i uruchom ponownie aplikację (persist aktywnego profilu).
2. Settings:
   - zmień `defaultChannelId`, `defaultDatePreset`, `preferredForecastMetric`, `reportFormats`.
   - zweryfikuj, że ustawienia są per profil (izolacja).
3. Auth:
   - połącz konto (`auth:connect`),
   - sprawdź status (`auth:getStatus`),
   - rozłącz (`auth:disconnect`).
4. Zweryfikuj UX:
   - komunikaty dla użytkownika po polsku,
   - brak wycieku tokenów do UI/logów user-facing.

### Prompt dla LLM (audyt profili i bezpieczeństwa)
```text
Przeprowadź audyt funkcji profile/settings/auth pod kątem spójności i bezpieczeństwa.

Dane wejściowe:
- logi IPC: profile:list/create/setActive, settings:get/update, auth:getStatus/connect/disconnect
- snapshot ustawień dla min. 2 profili
- logi aplikacji podczas connect/disconnect

Sprawdź:
1) Czy profile są odseparowane danych i ustawień.
2) Czy zmiana aktywnego profilu poprawnie przeładowuje stan backendu/UI.
3) Czy status auth jest poprawnie aktualizowany.
4) Czy istnieje ryzyko wycieku sekretów (tokeny/plaintext).

Zwróć:
- PASS/FAIL
- Wykryte ryzyka bezpieczeństwa
- Wykryte problemy UX
- Lista poprawek przed Fazą 9
```

---

## 3. Scenariusze E2E „krytyczna ścieżka”

### E2E-1: Świeży użytkownik
1. Start aplikacji.
2. Utworzenie profilu.
3. Ustawienie kanału domyślnego.
4. Sync danych.
5. Uruchomienie baseline ML.
6. Wygenerowanie i eksport raportu.

**Kryterium PASS:** użytkownik przechodzi cały flow bez blokera i bez ręcznej ingerencji technicznej.

### E2E-2: Użytkownik wieloprofilowy
1. Profil A i Profil B z różnymi ustawieniami.
2. Przełączanie A↔B.
3. Weryfikacja izolacji danych i konfiguracji.

**Kryterium PASS:** brak „przecieków” ustawień lub danych między profilami.

### E2E-3: Odporność na przerwanie pracy
1. Start sync.
2. Przerwanie procesu.
3. Resume.
4. Weryfikacja integralności końcowej.

**Kryterium PASS:** brak duplikatów i logicznie domknięty status procesu.

## 4. Minimalny pakiet regresji przed wejściem w Fazę 9

Uruchomić bez wyjątków:
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

Dodatkowo rekomendowane:
- smoke test desktop runtime (`corepack pnpm dev`),
- manualny przegląd UI krytycznych ekranów: dashboard, profiles/settings/auth, raporty.

## 5. Kryterium gotowości do Fazy 9

Do Fazy 9 przechodzimy tylko gdy:
1. Wszystkie scenariusze z sekcji 2 i 3 mają status PASS albo mają jawnie zaakceptowane ryzyka.
2. Brak otwartych błędów P0/P1 dla flow: sync → dashboard → ML → report.
3. Regresja techniczna (lint/typecheck/test/build) jest zielona.
4. Nie ma potwierdzonego wycieku danych/sekretów w funkcjach auth/profile.
