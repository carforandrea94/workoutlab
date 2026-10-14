# Workout Lab

App di allenamento e dieta: ognuno costruisce e segue i propri protocolli (scheda, dieta e obiettivo di corsa) e registra sedute, corse e misure. Angular 21 + Ionic 9 + Capacitor 8, su Firebase
(Authentication email/password e Firestore). È la ricostruzione di `imperial-gym-app`: l'analisi
dell'originale e le decisioni del passaggio a Ionic sono in
[docs/REVERSE-ENGINEERING.md](docs/REVERSE-ENGINEERING.md).

## Comandi

```bash
npm install          # il file .npmrc usa legacy-peer-deps
npm start            # ng serve su http://localhost:4200
npm run build        # build di produzione
npm test             # test unitari (Vitest)
npm run test:rules   # test delle regole Firestore sull'emulatore
```

## Creare il progetto Firebase nuovo

L'app non parte finché in `src/environments/` ci sono i segnaposto `INSERISCI_...`. I dati del
progetto vecchio non vengono migrati: si parte da un progetto pulito.

1. **Crea il progetto.** Vai su <https://console.firebase.google.com> → *Aggiungi progetto*, dagli
   un nome (l'ID che ne risulta è il tuo `PROJECT_ID`). Google Analytics è facoltativo.
2. **Attiva l'autenticazione.** *Build → Authentication → Inizia → Metodo di accesso* → abilita
   **Email/password** (non serve il link via email).
3. **Crea il database.** *Build → Firestore Database → Crea database*. Scegli la posizione
   **`eur3` (Europa)** — non si può cambiare dopo — e la modalità *produzione*: le regole vere si
   caricano al punto 7.
4. **Registra l'app web.** *Impostazioni progetto (ingranaggio) → Le tue app → icona `</>`*. Dai
   un nome all'app; l'Hosting si può saltare (lo configura già `firebase.json`). Copia l'oggetto
   `firebaseConfig` che compare.
5. **Incolla la configurazione.** Nei due file `src/environments/environment.ts` (sviluppo) e
   `src/environments/environment.prod.ts` (produzione) sostituisci i valori `INSERISCI_...` con
   quelli della console: `apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId` (e `measurementId` se hai attivato Analytics, altrimenti lascia
   `''`). Non sono segreti: a proteggere i dati sono le regole di Firestore.
6. **Collega la CLI al progetto.**

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

   Scegli il progetto nuovo e dagli l'alias `default`: l'ID finisce in `.firebaserc`, al posto di
   `INSERISCI_PROJECT_ID`.
7. **Pubblica regole e indici.**

   ```bash
   npm run deploy:rules
   ```

   Carica `firestore.rules` e `firestore.indexes.json` (senza indici: non ne servono). Prima del deploy puoi provare le regole con `npm run test:rules`.
8. **Primo avvio.** `npm start`, poi *Crea un account* per registrarti. Dalla sezione Scheda,
   con il pulsante in alto a destra, si apre l'elenco dei **Protocolli**: da lì si crea il
   primo (a mano o importando i PDF) e lo si attiva.

### Hosting e deploy automatico

Da terminale, a mano:

```bash
npm run deploy:hosting     # build di produzione + firebase deploy --only hosting
```

Il sito è su <https://workout-lab-8c567.firebaseapp.com>. Usa **questo** indirizzo, e da questo
installa la PWA sulla Home: è il dominio di `authDomain`, e solo se coincide con quello da cui si
apre l'app l'accesso con Google funziona su iOS. Hosting risponde anche su
`workout-lab-8c567.web.app`, ma da lì la finestra di Google può restare appesa (sono due
origini diverse). Per usare `web.app` bisogna cambiare `authDomain` in `src/environments/` **e**
aggiungere `https://workout-lab-8c567.web.app/__/auth/handler` fra gli URI di reindirizzamento
autorizzati del client OAuth (Google Cloud › API e servizi › Credenziali).

**Pipeline GitHub** (`.github/workflows/firebase-deploy.yml`):

- su ogni **pull request** verso `main`: installa, lancia i test e compila. Non pubblica niente;
- quando la PR viene **mergiata su `main`** (cioè a ogni push su `main`): test, build e deploy di
  **solo Firebase Hosting** sul canale `live`. La build che ha passato i test è quella pubblicata;
- da *Actions → Run workflow*, per ripubblicare senza un nuovo commit.

Le regole e gli indici di Firestore **non** partono dalla pipeline: quando cambiano si lancia
`npm run deploy:rules`.

**Per attivarla serve un solo secret**, `FIREBASE_SERVICE_ACCOUNT`. Finché manca, build e test
girano e il deploy viene saltato con un avviso giallo.

1. In [Google Cloud › IAM › Account di servizio](https://console.cloud.google.com/iam-admin/serviceaccounts?project=workout-lab-8c567)
   crea un account di servizio, per esempio `github-hosting-deploy`.
2. Dagli i ruoli **Firebase Hosting Admin** e **Service Usage Consumer**. Se il primo deploy
   protesta per un permesso mancante, il messaggio dice quale aggiungere (di solito **API Keys
   Viewer** o **Cloud Run Viewer**).
3. Dal suo menu *Gestisci chiavi → Aggiungi chiave → Crea nuova chiave → JSON*: scarica il file.
4. Su GitHub: *Settings → Secrets and variables → Actions → New repository secret*, nome
   `FIREBASE_SERVICE_ACCOUNT`, valore **l'intero contenuto** del file JSON. Poi cancella il file
   dal computer: la chiave non va mai committata (il `.gitignore` esclude i nomi più comuni).

In alternativa `firebase init hosting:github` fa tutto da solo (crea l'account di servizio e il
secret), ma propone anche di scrivere due suoi workflow: rifiutali, c'è già il nostro.

Perché il deploy parta solo dopo un controllo, in *Settings → Branches* conviene proteggere
`main` richiedendo una pull request e il job *Build e test*.

### App native (Capacitor)

```bash
npm run cap:sync           # build di produzione + npx cap sync
npx cap add ios            # una volta sola, poi anche: npx cap add android
npx cap open ios
```

## Note su Ionic

- Ogni pagina ha il suo `ion-header`/`ion-toolbar` (titolo, `ion-back-button` con `defaultHref`,
  pulsanti a destra) e un `ion-content` con dentro `<div class="wrap">`. Non esiste più una navbar
  centrale.
- La barra a tab è in `src/app/tabs/tabs.page.ts`, una pila di navigazione per tab. Ionic assegna la pila
  dal primo segmento dell'URL: tutto sotto `/scheda/...` (compresi `/scheda/protocolli/...`) sta
  nella pila della tab Scheda.
- Le pagine non devono avere `:host { display: block }` negli stili: rompe `.ion-page`.
- Le variabili Ionic (`--ion-background-color`, `--ion-color-primary`, ...) sono mappate sui token
  di `src/styles.css`, in tema scuro e chiaro.
