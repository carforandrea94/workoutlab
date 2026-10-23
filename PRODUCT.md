# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Chiunque si iscriva: l'app è aperta al pubblico, con registrazione libera (email e password, o
Google). L'interfaccia è solo in italiano. Ogni utente costruisce e segue da sé i propri
protocolli: non esiste il ruolo del coach (c'era nell'app originale, `imperial-gym-app`, ed è
stato tolto).

La situazione che conta di più è la seduta in palestra: il telefono in una mano, pochi secondi
fra una serie e l'altra, il recupero che scorre. Le altre situazioni d'uso sono la giornata
alimentare (che pasto tocca, cosa si mangia, la lista della spesa), il ritorno da una corsa e
il momento delle misure corporee.

## Product Purpose

Workout Lab tiene in un solo protocollo la scheda di allenamento, la dieta e l'obiettivo di
corsa, e accanto registra sedute, uscite di corsa e misure. L'utente lo segue giorno per giorno
e vede come va: storico delle sedute, resoconto di fine allenamento, andamento delle misure,
forma fisica.

Funziona se, in palestra, la seduta si segue e si registra fra una serie e l'altra senza
fermarsi a cercare nulla. E se scheda, dieta, corsa e misure restano lo stesso piano, non
quattro app.

## Positioning

- **Tutto in un posto.** Allenamento, dieta, corsa e misure stanno nello stesso protocollo
  attivo: quando lo si cambia, lo seguono subito tutte le sezioni.
- **Fatta per il tempo fra le serie.** La seduta in corso è il caso d'uso principale. Carichi,
  ripetizioni, "Fatta" e recupero sono a portata di pollice, in pochi secondi.

## Operating Context

- Si usa soprattutto come PWA installata sulla Home dell'iPhone, dal dominio
  `workout-lab-8c567.firebaseapp.com` (l'accesso con Google su iOS funziona solo da lì). Le app
  native iOS e Android con Capacitor sono previste ma non ancora create.
- Durante una seduta attiva la barra delle tab lascia il posto alla fascia del recupero. Lo
  schermo resta acceso (Wake Lock), a fine recupero arriva un segnale sonoro (si sceglie in
  Impostazioni) e nell'app nativa una vibrazione.
- Il protocollo spesso non nasce nell'app: lo si importa dai PDF (due modelli di scheda, dieta,
  integrazione) o lo si scrive nel builder.
- Tema scuro e chiaro, a scelta dell'utente.

## Capabilities and Constraints

**Sezioni** (barra delle tab: Scheda · Dieta · Corsa · Account):

- **Scheda:** giorni del programma, settimana in corso, seduta con serie, carichi, recupero,
  salvataggio automatico, stima del massimale e carico a percentuale (Brzycki). Ci sono anche
  le serie a onda e le serie cluster a blocchi, a numero fisso o a esaurimento. Seguono lo
  storico delle sedute, modificabile, il resoconto con i confronti per esercizio e le info del
  programma.
- **Protocolli** (nella pila di Scheda): elenco, nuovo, import da PDF, aggiornamento da PDF e
  builder di scheda, dieta e corsa. Un protocollo è bozza, attivo o archiviato; ce n'è uno solo
  attivo per utente.
- **Dieta:** piani, pasti con combinazioni e alternative, pasti fatti del giorno, lista della
  spesa.
- **Corsa:** uscite (lento, medio, ripetute; facile, giusta, dura), obiettivo settimanale e
  storico.
- **Account:** forma fisica (BMI, FFMI, massa grassa Jackson-Pollock) e misure corporee: peso,
  7 pliche, 9 circonferenze, con storico e andamento. Ci sono poi le impostazioni (tema, dati,
  percentuale del massimale, suono) e la chiusura dell'account.

**Termini dell'app:** protocollo, scheda, giorno, seduta, serie, blocchi (cluster), onda,
recupero, massimale, piano, pasto, combinazione, alternative, lista della spesa, uscita,
misure, pliche, circonferenze, andamento.

**Vincoli tecnici:**

- Stack: Angular 21 (standalone, zoneless, signals), Ionic 9 forzato in modalità iOS su ogni
  piattaforma, Capacitor 8, Firebase (Authentication e Firestore in `eur3`), service worker.
- Ogni utente legge e scrive solo i propri dati.
- La chiusura dell'account cancella tutto: sedute, corse, misure, stato e protocolli.
- Privacy accettata e versionata alla creazione del profilo.
- L'accesso con Google è nascosto nell'app nativa.

**Ancora da decidere:** l'`appId` definitivo delle app native, oggi provvisorio
(`it.workoutlab.app`), va fissato prima del primo `npx cap add`.

## Brand Commitments

- Nome: **Workout Lab**.
- Il marchio esiste già: monogramma WL e nome in Kanit Bold Italic (`public/icons/`,
  `src/app/components/logo/`, schermata d'avvio, login).
- Voce: italiano semplice e diretto, con verbi d'azione e spesso in prima persona dalla parte
  di chi si allena: "Inizia", "Chiudo la serie", "Riapri questa serie", "Più tardi", "Salva e
  attiva".
- I testi visibili, aria-label compresi, usano gli accenti veri (è, più, perché), mai
  l'apostrofo. Un test (`accenti.spec`) lo controlla.

## Evidence on Hand

- Icone dell'app, favicon e logo: `public/icons/`.
- Schermate d'avvio per gli iPhone, chiare e scure: `public/avvio/`.
- Informativa sulla privacy: `/privacy`.
- Documentazione: `README.md` e `docs/REVERSE-ENGINEERING.md`.

Non ci sono testimonianze, numeri di utenti, recensioni, stampa né prezzi: nessun lavoro futuro
deve inventarli.

## Product Principles

1. **Fra le serie vince.** Durante la seduta ogni azione deve essere a un pollice e a pochi
   secondi; niente deve fermare, coprire o rallentare chi si sta allenando.
2. **Un protocollo, un posto.** Scheda, dieta, corsa e misure leggono lo stesso protocollo
   attivo e si muovono insieme; non diventano sezioni scollegate.
3. **Come un'app dell'iPhone.** Navigazione a pile, freccia e swipe indietro, barra delle tab,
   fogli e liste come in iOS. Un comportamento da sito web è un difetto.

## Accessibility & Inclusion

Nessuno standard formale è stato scelto. Il codice rispetta già queste regole, da conservare:

- con "riduci movimento" restano solo le dissolvenze di opacità e colore;
- tema chiaro e scuro;
- bersagli di tocco di almeno 44 px;
- uso completo da tastiera: tab bar, ruote numeriche, intestazioni a fisarmonica;
- nomi accessibili sui controlli.
