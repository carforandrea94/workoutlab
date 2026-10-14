# Imperial Gym — reverse engineering dell'app originale

Analisi della repo `carforandrea94/imperial-gym-app` (commit `c6d659a`, PR #137) fatta per
ricostruirla come progetto nuovo in **Angular + Ionic**, con un **progetto Firebase nuovo**.

L'analisi è fatta sul sorgente, non sul bundle: il codice completo c'è, e leggere il sorgente
è più preciso che ricostruirlo da un build compilato.

> **Aggiornamento — un solo tipo di account.** L'app originale aveva due ruoli, coach e cliente.
> In questa ricostruzione il ruolo del coach non esiste più: c'è solo l'utente, che costruisce da
> sé i propri protocolli con l'editor (builder e import da PDF, che nell'originale erano del
> coach). Le sezioni 1, 3, 4, 5 e 7 descrivono lo stato attuale; dove serve, tra parentesi c'è
> com'era l'originale.

---

## 1. In una riga

PWA Angular 21 (standalone, zoneless, signals) su Firebase (Auth email/password + Firestore),
con un solo tipo di account: l'utente scrive i propri protocolli (scheda di allenamento +
dieta + obiettivo di corsa), li segue, registra sedute, corse e misure corporee. (Nell'originale
i protocolli li scriveva un coach per i suoi clienti.)

## 2. Stack originale

| Pezzo | Versione | Note |
|---|---|---|
| Angular | 21.2 | standalone, zoneless, signals, `withComponentInputBinding` |
| Build/test | `@angular/build` + Vitest 4 (jsdom) | `ng test` |
| Firebase JS SDK | 12.15 | Auth, Firestore (`experimentalAutoDetectLongPolling`), Analytics |
| UI | CSS proprio (`styles.css`, ~1.400 righe di token + componenti) | tema scuro/chiaro con `data-theme` |
| Icone | `lucide-angular` 1.0 | + `sport-shoe` disegnata a mano |
| Drag & drop | `@angular/cdk/drag-drop` | builder della dieta |
| PDF | `pdfjs-dist` 6.1 | import di scheda/dieta/integrazione da PDF |
| PWA | `@angular/service-worker` | auto-update con reload |
| Hosting | Firebase Hosting, deploy da GitHub Actions su push a `main` |

Dimensioni: 26 pagine, 8 componenti, ~18 servizi, 21 file di utilità, ~13.500 righe di
TypeScript (spec escluse), ~3.100 di template, 39 file di test.

## 3. Account e flussi di autenticazione

- **Iscrizione** — da `/registrati`: nome, email, password e accettazione dell'informativa.
  Nessun codice, nessun ruolo. (Originale: il cliente si iscriveva con il codice di un coach,
  il coach da `/coach/registrati`.)
- **Iscrizione a metà** — se l'utente Auth esiste ma il profilo Firestore no
  (`PROFILE_MISSING`), il login non chiude la sessione: manda a completare il profilo
  (`completeProfile`). Se la scrittura del profilo fallisce durante la registrazione,
  l'utente Auth viene cancellato (rollback).
- **Chiusura account** — riautenticazione con password, poi cancellazione delle sottoraccolte
  (`sessions`, `runs`, `measurements`, `state`, `protocols`) **prima** del profilo
  (Firestore non cancella a cascata), poi dell'utente Auth.
- Privacy: `privacyAcceptedAt` + `privacyVersion` obbligatori alla creazione del profilo.
- **Dati dell'account mancanti** — se al profilo mancano nome, cognome, data di nascita, sesso o
  altezza, dopo l'accesso `profileGuard` manda a `/benvenuto` (BenvenutoComponent), che li chiede
  in un'unica schermata con quelli già noti precompilati (il nome, per chi entra con Google).
  "Più tardi" lascia entrare per la sessione (`AuthService.onboardingRimandato`); se i dati
  mancano ancora, la schermata ricompare al prossimo accesso. Eta', sesso e altezza servono alle
  formule di composizione corporea delle Misure.
- **Accesso con Google** — `signInWithPopup` dalla pagina di login (nascosto nell'app nativa).
  Un account Google nuovo non ha profilo: segue lo stesso percorso dell'iscrizione a metà
  (`PROFILE_MISSING` → `/registrati?completa=1`), perché le regole pretendono l'accettazione
  dell'informativa. Chi ha solo Google non ha una password: chiude l'account riautenticandosi con
  Google (`reauthenticateWithPopup`).

Guardie: `authGuard` (sessione + profilo), `guestGuard` (solo non autenticati: gli altri vanno
in `/scheda`), `protocolGuard` (attende `ProtocolBootstrapService.ensureLoaded()` così le pagine
trovano il protocollo già caricato). Quando l'utente modifica, attiva o elimina un protocollo,
`ProtocolService.changed$` fa rileggere quello attivo e Scheda, Dieta e Corsa lo seguono.

## 4. Modello dati Firestore

```
users/{uid}                         UserProfile
  ├─ protocols/{id}                 Protocol (scheda + dieta + corsa)
  ├─ sessions/{id}                  WorkoutSession (sedute salvate)
  ├─ runs/{id}                      Run (uscite di corsa)
  ├─ measurements/{id}              MeasurementEntry
  └─ state/app                      AppState (bozze e preferenze, un documento solo)
```

Nessun indice composito. (Originale: anche `coachCodes/{code}` e `announcements/{id}` con
l'indice `announcements (coachId ASC, createdAt DESC)`, rimossi insieme al coach.)
Realtime Database: presente solo con regole tutto-chiuso, **non usato** → non riportato.

### UserProfile
`uid, email, displayName, firstName?, lastName?, heightCm?, sex? ('m'|'f'),
birthDate? (yyyy-mm-dd), createdAt, privacyAcceptedAt?, privacyVersion?`

### Protocol
`id, userId, name, status ('draft'|'active'|'archived'), source ('manual'|'pdf'),
workout { weekPlan[8]{sets,reps}, days[], programStart }, diet DietPlan[], running? RunGoal,
infoNote, dietNotesSource?, supplementNotesSource?, createdAt, updatedAt`.
Un solo protocollo `active` per utente: è quello che si vede in Scheda, Dieta e Corsa.

- **Day** `{ id, label, rec, ex: Exercise[] }`
- **Exercise** `{ name, scheme ('wave'|'plain'), sets, muscle, text?, reps?, note?, weekPlan?, cluster? }`
- **ClusterSpec** `{ blocks[], restSec, end ('fixed'|'open') }`
- **DietPlan** `{ id, name, meals: NamedMeal[] }` → **NamedMeal** `{ id, name, combinations[],
  alternatives {carb[],protein[],fat[]}, supplements? }` → **MealCombination**
  `{ id, label, carb, protein, fat }` → **FoodItem** `{ name, qty, category?, alt?[] }`
- **RunGoal** `{ weeklyMinutes, weeklyRuns, note? }`

### WorkoutSession / Run / MeasurementEntry
- **WorkoutSession** `{ dayId, dayLabel, date, exercises[{ name, sets: PerformedSetRecord[] }], durationSec? }`
  con `PerformedSetRecord { load, reps, done, blocks?[] }` (i blocchi servono ai cluster).
- **Run** `{ date, durationMin, type ('lento'|'medio'|'ripetute'), effort ('facile'|'giusta'|'dura'), note? }`
- **MeasurementEntry** `{ date, peso, 7 pliche (mm), 9 circonferenze (cm) }`, tutti
  stringa o null. Categorie UI: peso / centimetri / pliche.

### AppState (`users/{uid}/state/app`)
Bozze dell'allenamento per giorno, override dei recuperi, bozza delle misure, spunte e voci
libere della lista della spesa, modalità vista lista/slider (scheda e dieta), completamento
pasti del giorno, tema, **sessione di allenamento attiva** (`dayId, startedAt, pausedAt,
pausedMs`), percentuale di carico sul massimale.

Tutte le scritture passano da `sanitizeForFirestore` (niente `undefined`).

## 5. Regole di sicurezza

- `users/{uid}`: ognuno legge, crea, aggiorna e cancella solo il proprio. `create` con privacy
  accettata, `uid` coerente e solo i campi noti del profilo; `update` solo per i campi anagrafici
  (`selfEditableFields`, con validazione di formati e lunghezze).
- Sottoraccolte `sessions|runs|measurements|state|protocols`: solo il proprietario, in lettura
  e scrittura.
- Tutto il resto è vietato. (Originale: ruolo coach con letture/cancellazioni sui clienti,
  `coachCodes` con `get` pubblico, `announcements`.)

Le regole hanno una suite di test con l'emulatore (`npm run test:rules`, serve Java 21).

## 6. Logica di dominio (riusata senza cambiamenti)

| File | Cosa fa |
|---|---|
| `load-estimate` | Brzycki: 1RM = w·36/(37−r), carico a %, ripetizioni a % |
| `cluster` | parsing e stime delle serie cluster |
| `extra-sets` | serie aggiuntive oltre lo schema |
| `tonnage`, `session-summary` | volume e riepilogo di fine seduta |
| `week-history`, `date` | settimana del programma, date locali ISO |
| `bodyfat`, `bmi`, `ffmi`, `height` | Jackson-Pollock, BMI, FFMI, scale di altezza |
| `run-math` | ritmi, minuti, obiettivi settimanali |
| `meal-completion` | primo pasto non completato |
| `nome`, `auth-errors`, `sanitize` | nome/cognome, messaggi d'errore Firebase in italiano, pulizia per Firestore |
| `wheel`, `horizontal-slider`, `swipe-nav` | ruota numerica, slider orizzontale, gesto fra le schede |
| `pdf-import.service` | lettura dei PDF di scheda e dieta (due template di scheda, dieta, integrazione) |

## 7. Schermate

**Cliente** (barra: Scheda · Dieta · Corsa · Misure · Account)

| Rotta | Pagina | Azioni in alto |
|---|---|---|
| `/scheda` | elenco giorni, settimana del programma | Storico, Info |
| `/scheda/day/:n` | seduta: serie, carichi, recupero, autosave, stime 1RM | vista lista/slider |
| `/scheda/storico`, `/scheda/storico/:key` | sedute salvate; dettaglio = stessa pagina della seduta in modalità storico, modificabile | vista lista/slider |
| `/scheda/info` | note e piano del programma | — |
| `/dieta`, `/dieta/:mode`, `/dieta/lista-spesa` | piani alimentari, pasti/combinazioni, lista spesa | Lista spesa; vista lista/slider |
| `/corsa`, `/corsa/nuova` | registro uscite e obiettivo settimanale | — |
| `/misure`, `/misure/:categoria`, `/misure/storico(/:key)`, `/misure/analytics` | misure, inserimento per categoria, storico, andamento | Storico, Andamento; Salva |
| `/account`, `/account/impostazioni` | forma fisica, impostazioni (tema, dati, % massimale, chiusura account) | — |

**Protocolli** (nella pila `scheda`, si apre dal pulsante in alto in Scheda)

| Rotta | Pagina | Azioni |
|---|---|---|
| `/scheda/protocolli` | elenco dei protocolli: attiva, modifica, elimina | — |
| `/scheda/protocolli/nuovo`, `…/importa-pdf`, `…/aggiorna-pdf/:pid` | nuovo protocollo, import PDF | — |
| `/scheda/protocolli/builder/:pid` | builder scheda + dieta (drag & drop) + corsa | Aggiorna da PDF, Salva bozza, Salva e attiva |

(Originale: erano le rotte del coach `/coach/clienti/:id/...`, con in più bacheca e elenco clienti.)

**Pubbliche**: `/login`, `/registrati`, `/privacy`.

### Shell originale
Navbar e tabbar sono **centralizzate** in `app.ts`: un `updateNav(url)` di ~260 righe decide
per ogni URL titolo, sottotitolo, freccia e pulsanti; `onBack()` ricostruisce a mano la
risalita. Durante una seduta attiva la tabbar lascia il posto alla barra del recupero.
Ci sono anche correzioni per il viewport della PWA installata su iOS (`--h-schermo`,
`.installata`) e un gesto di swipe orizzontale fra le schede.

## 8. Passaggio ad Angular + Ionic

| Originale | Nel progetto nuovo | Perché |
|---|---|---|
| Navbar centralizzata + `updateNav` | `ion-header`/`ion-toolbar` **dentro ogni pagina**, con le sue azioni | è il modello di Ionic; ogni pagina possiede titolo e pulsanti, niente tabella di URL da tenere allineata |
| `onBack()` scritto a mano | `ion-back-button` con `defaultHref` per pagina | storia di navigazione nativa per tab |
| Tabbar propria | `ion-tabs` + `ion-tab-bar`, una pila per tab | navigazione a stack nativa, stato conservato fra le tab |
| `.content .wrap` + padding per la navbar | `ion-content` + `.wrap` | scroll, safe area e tastiera gestiti da Ionic |
| Correzioni viewport iOS | eliminate | `ion-content` risolve il problema che aggiravano |
| Swipe fra le schede | **eliminato** | si scontra con lo swipe-indietro di iOS di Ionic |
| Barra del recupero al posto della tabbar | tab bar nascosta sulla seduta attiva + barra del recupero in `ion-footer` della pagina | stesso comportamento, nella struttura di Ionic |
| Rotte del coach | eliminate | il ruolo non esiste più; i protocolli stanno sotto `/scheda/protocolli` |
| PWA | resta (service worker + Firebase Hosting) **e** in più app native con Capacitor (iOS/Android) | |
| Tema | stessi token di `styles.css`; le variabili Ionic (`--ion-background-color`, `--ion-text-color`, `--ion-color-primary`, …) mappate sui token | stesso aspetto in tutte e due le modalità |
| Icone | `lucide-angular` mantenuto | parità visiva, nessuna icona da ridisegnare |

Tutto il resto — modelli, servizi, utilità, regole, logica delle pagine — è portato senza
cambiamenti di comportamento.

## 9. Progetto Firebase nuovo

Vedi `README.md` del progetto: creare il progetto, abilitare Authentication (email/password)
e Firestore (`eur3`), registrare l'app web, incollare la configurazione in
`src/environments/`, `firebase use --add`, deploy di regole e indici.
I dati del progetto vecchio **non** vengono migrati: è un progetto pulito.
