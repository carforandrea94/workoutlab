# Promemoria degli allenamenti: come si accendono

L'utente sceglie in Account → Promemoria i giorni e l'ora in cui si allena.
Mezz'ora prima gli arriva una notifica con la seduta che tocca ("Oggi alle
18:00: Petto e tricipiti"); toccandola si apre quella seduta. Se quel giorno si
è già allenato, o ha già finito la scheda della settimana, la notifica non arriva.

A telefono chiuso l'app non gira: la notifica la manda il server. Sono tre pezzi:

| Pezzo | Dove | Cosa fa |
|---|---|---|
| La pagina | `src/app/pages/promemoria/` | Interruttore, giorni, ora; chiede il permesso delle notifiche e iscrive il telefono |
| Il documento | `users/{uid}/promemoria/impostazioni` | Orario, fuso, telefoni iscritti, e cosa sa l'app della settimana |
| La funzione | `functions/` | Ogni 5 minuti cerca i promemoria arrivati all'ora e li manda con Web Push |

Le notifiche sono firmate con una coppia di chiavi VAPID: la pubblica sta
nell'app e nella funzione, la privata solo fra i segreti di Firebase.

Finché la chiave pubblica nell'app è vuota, la pagina Promemoria dice che non
sono ancora disponibili e l'interruttore resta spento.

## Una volta sola

1. **Piano Blaze.** Le Cloud Functions chiedono il piano a consumo: console
   Firebase → ⚙️ → Utilizzo e fatturazione → Modifica piano. A questi numeri
   resta dentro la quota gratuita (vedi Costi), ma serve una carta collegata.
   Conviene mettere un avviso di budget (per esempio 1 €) dalla console Google Cloud.

2. **Le chiavi VAPID.** Dalla cartella del progetto:

   ```sh
   npm --prefix functions install
   npm --prefix functions run chiavi
   ```

   Stampa una *Public Key* e una *Private Key*.

3. **La chiave pubblica**, in tre posti:
   - `src/environments/environment.ts` → `vapidPublicKey: '...'`
   - `src/environments/environment.prod.ts` → `vapidPublicKey: '...'`
   - `functions/.env` (copia di `functions/.env.example`) → `VAPID_PUBLIC_KEY=...`

4. **La chiave privata**, come segreto (la chiede incollata, non resta nei file):

   ```sh
   npx firebase-tools@13 functions:secrets:set VAPID_PRIVATE_KEY
   ```

5. **Pubblicare** la funzione con l'indice e le regole, poi l'app:

   ```sh
   npm run deploy:functions
   npm run deploy:hosting
   ```

   Il primo deploy delle funzioni attiva da solo le API che servono (Cloud
   Functions, Cloud Build, Cloud Scheduler, Secret Manager) e può chiedere
   qualche minuto. L'indice di Firestore (`firestore.indexes.json`) si
   costruisce in qualche minuto: finché non è pronto, la funzione scrive un
   errore nel log e riprova al giro dopo.

## Provare

- **iPhone (iOS 16.4 o successivo):** apri l'app in Safari → Condividi →
  «Aggiungi alla schermata Home». Apri Workout Lab dalla Home (non da Safari)
  → Account → Promemoria → accendi, e consenti le notifiche.
- **Android / computer:** Chrome, Edge o Firefox vanno bene anche senza installare.
- Per una prova veloce, scegli oggi e un'ora fra 35-40 minuti: la notifica arriva
  mezz'ora prima, entro cinque minuti dall'ora giusta.
- Il log della funzione: `npx firebase-tools@13 functions:log --only promemoria`.
  Nel documento `users/{uid}/promemoria/impostazioni` i campi `ultimoGiro` e
  `ultimoEsito` dicono com'è andato l'ultimo invio ("mandato a 1 su 1",
  "gia' fatta oggi", "settimana completa"...).

## Prove automatiche

```sh
npm run test:functions                      # orari, fusi, cambio d'ora, messaggio
npm --prefix functions run test:integrazione   # la funzione intera su Firestore in emulazione (serve Java 21)
npm run test:rules                          # le regole (serve Java 21)
```

La prova d'integrazione manda le notifiche a due telefoni finti su un server
locale e le decifra come fa il browser: controlla firma, cifratura, contenuto e
che il telefono che non c'è più venga tolto.

## Costi

- **Cloud Scheduler:** un job; i primi tre per account sono gratis.
- **Cloud Functions:** un'esecuzione ogni 5 minuti, circa 8.700 al mese, contro i
  2 milioni gratuiti.
- **Firestore:** ogni giro legge solo i promemoria arrivati all'ora (almeno una
  lettura anche quando non ce n'è nessuno): circa 9.000 letture al mese più una
  per notifica, contro le 50.000 gratuite **al giorno**.
- **Web Push** (i servizi di Apple, Google e Mozilla): gratuito.

## Cosa non fa (ancora)

- Il numero sull'icona dell'app (badge): servirebbe un service worker scritto a
  mano accanto a quello di Angular.
- Un'ora diversa per ogni giorno: c'è un'ora sola per tutti i giorni scelti.
- Se un telefono rinnova la sua iscrizione mentre l'app è chiusa, il nuovo
  indirizzo arriva al server alla prossima apertura dell'app.
