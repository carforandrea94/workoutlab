import { Injectable, signal, NgZone, ApplicationRef } from '@angular/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  User
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { UserProfile, Sex } from '../models/user.model';
import { ZoneFixService } from '../utils/zone.util';
import { PRIVACY_VERSION } from '../privacy';
import { profiloCompleto } from '../utils/profile-completeness.util';

/**
 * L'accesso e' riuscito ma il profilo non c'e'.
 *
 * Succede quando la registrazione ha creato l'utente su Auth e poi non e'
 * riuscita a scrivere il documento del profilo. Chi ci finisce dentro non
 * entra ("profilo non trovato") e non puo' nemmeno reiscriversi ("email gia'
 * registrata"): senza un codice riconoscibile qui, l'unica uscita sarebbe
 * cancellare l'utente dalla console di Firebase.
 *
 * Chi lo riceve NON e' scollegato: la sessione serve a scrivere il profilo che
 * manca, ed e' l'unica cosa che quella sessione puo' fare, perche' currentUser
 * resta nullo e le guardie rimandano all'accesso.
 */
export const PROFILE_MISSING = 'app/profile-missing';

/**
 * Le raccolte personali di un utente, quelle che si cancellano insieme al suo
 * account: allenamenti salvati, uscite, misurazioni, bozze, protocolli e
 * promemoria (con i telefoni iscritti).
 */
const SOTTORACCOLTE = ['sessions', 'runs', 'measurements', 'state', 'protocols', 'promemoria'] as const;

/**
 * L'accettazione dell'informativa, come finisce sul profilo.
 *
 * Non basta la data: senza la versione, fra sei mesi non si saprebbe COSA ha
 * accettato chi si e' iscritto oggi. Le regole pretendono tutti e due su ogni
 * profilo nuovo, quindi ogni strada che ne crea uno passa di qui - ed e' il
 * modo di non dimenticarsene aggiungendone una domani.
 */
function privacyAccettata(): { privacyAcceptedAt: string; privacyVersion: string } {
  return { privacyAcceptedAt: new Date().toISOString(), privacyVersion: PRIVACY_VERSION };
}

/** Quanto si aspetta il profilo dopo l'accesso con Google. Come l'accesso con la password. */
export const PROFILO_TIMEOUT_MS = 15000;

/**
 * La promessa, oppure un errore TIMEOUT (lo stesso che le pagine gia' sanno
 * dire all'utente) se non arriva in tempo. Il timer si toglie a promessa
 * conclusa: non resta uno scatto pendente dietro a ogni accesso riuscito.
 */
function conTempoMassimo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promessa.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<UserProfile | null>(null);
  authReady = signal(false);
  /** Da fare prima di uscire, finche' si puo' ancora scrivere sui propri dati (vedi primaDiUscire). */
  private allUscita: (() => Promise<void>)[] = [];

  /**
   * "Più tardi" sulla schermata dei dati mancanti: vale per questa sessione.
   * Al prossimo accesso, se i dati mancano ancora, la schermata ricompare.
   */
  onboardingRimandato = false;

  private readyResolve!: () => void;
  readonly ready: Promise<void> = new Promise(res => { this.readyResolve = res; });

  constructor(
    private fb: FirebaseService,
    private zone: NgZone,
    private zoneFix: ZoneFixService,
    private appRef: ApplicationRef
  ) {
    onAuthStateChanged(this.fb.auth, async (fbUser: User | null) => {
      // L'SDK Firebase puo' invocare questo callback fuori dalla zone di
      // Angular: senza zone.run() i signal si aggiornerebbero ma la vista
      // (navbar/tabbar/guard) non si ridisegnerebbe di conseguenza.
      await this.zone.run(async () => {
        if (!fbUser) {
          this.currentUser.set(null);
        } else {
          const profile = await this.loadProfile(fbUser.uid);
          this.currentUser.set(profile);
        }
        if (!this.authReady()) {
          this.authReady.set(true);
          this.readyResolve();
        }
      });
      setTimeout(() => this.appRef.tick(), 0);
    });
  }

  private async loadProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(this.fb.db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  }

  login(email: string, password: string): Promise<UserProfile> {
    return this.zoneFix.run((async () => {
      const cred = await signInWithEmailAndPassword(this.fb.auth, email.trim(), password);
      const profile = await this.loadProfile(cred.user.uid);

      if (!profile) {
        // Niente signOut: la sessione appena aperta e' quello che permette di
        // scrivere il profilo mancante (le regole consentono la creazione solo
        // all'utente stesso). Chiuderla renderebbe il guasto irreparabile.
        throw Object.assign(new Error('Profilo utente non trovato.'), { code: PROFILE_MISSING });
      }

      this.currentUser.set(profile);
      return profile;
    })());
  }

  /**
   * Accesso (o prima iscrizione) con l'account Google.
   *
   * Google non dice se l'account e' nuovo: lo si capisce dal profilo. Chi entra
   * per la prima volta ha l'utente su Auth ma non il documento su Firestore, ed
   * e' lo stesso caso dell'iscrizione a meta' (PROFILE_MISSING): la sessione
   * resta aperta e la pagina di iscrizione chiede solo quello che manca, cioe'
   * il nome e l'accettazione dell'informativa. Le regole la pretendono su ogni
   * profilo nuovo, e un clic su "Continua con Google" non e' un'accettazione.
   */
  loginWithGoogle(): Promise<UserProfile> {
    return this.zoneFix.run((async () => {
      const provider = new GoogleAuthProvider();
      // Senza, chi ha piu' account Google nel browser entra con l'ultimo usato
      // senza poter scegliere.
      provider.setCustomParameters({ prompt: 'select_account' });
      // Il popup NON ha un tempo massimo: lo chiude chi sceglie l'account.
      const cred = await signInWithPopup(this.fb.auth, provider);
      // La lettura del profilo invece si': e' una richiesta di rete come quella
      // dell'accesso con la password (che ha i suoi quindici secondi), e senza
      // limite un Firestore che non risponde lascia la schermata su
      // "Un attimo…" per sempre.
      const profile = await conTempoMassimo(this.loadProfile(cred.user.uid), PROFILO_TIMEOUT_MS);

      if (!profile) {
        throw Object.assign(new Error('Profilo utente non trovato.'), { code: PROFILE_MISSING });
      }

      this.currentUser.set(profile);
      return profile;
    })());
  }

  /**
   * Manda l'email per reimpostare la password.
   *
   * Non dice se quell'indirizzo esiste, e Firebase nemmeno: su un indirizzo
   * sconosciuto non fallisce. Confermarlo vorrebbe dire far sapere a chiunque
   * quali indirizzi sono registrati, provandone uno per volta.
   */
  sendPasswordReset(email: string): Promise<void> {
    return this.zoneFix.run(sendPasswordResetEmail(this.fb.auth, email.trim()));
  }

  /**
   * Toglie l'utente appena creato su Auth quando la registrazione si e' rotta
   * a meta'. Se anche questo fallisce - ed e' probabile, visto che la causa
   * piu' comune e' la rete - non si dice nulla di nuovo: l'errore da mostrare
   * resta quello della registrazione, e chi resta bloccato lo recupera
   * all'accesso con completeProfile.
   */
  private async rollbackAuthUser(user: User): Promise<void> {
    try {
      await deleteUser(user);
    } catch {
      /* resta l'utente orfano: lo raccoglie il recupero all'accesso */
    }
  }

  /**
   * Cancella tutto quello che sta sotto un utente, e per ultimo il suo profilo.
   *
   * L'ordine conta: Firestore non cancella a cascata, le sottoraccolte restano
   * anche quando il documento che le contiene sparisce. Le regole lasciano
   * cancellare i propri dati solo a chi e' collegato, quindi vanno tolti prima
   * che l'account sparisca.
   */
  private async wipeUserData(uid: string): Promise<void> {
    for (const nome of SOTTORACCOLTE) {
      const snap = await getDocs(collection(this.fb.db, 'users', uid, nome));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }
    await deleteDoc(doc(this.fb.db, 'users', uid));
  }

  /** Mancano dati dell'account (cognome, nascita, sesso, altezza...): va mostrata la schermata per inserirli. */
  profiloIncompleto(): boolean {
    const utente = this.currentUser();
    return !!utente && !profiloCompleto(utente);
  }

  /** C'e' una sessione aperta senza profilo, cioe' un'iscrizione da finire. */
  hasPendingProfile(): boolean {
    return !!this.fb.auth.currentUser && !this.currentUser();
  }

  /** Il nome che Google (o chi ha creato l'utente) ha gia' scritto, per precompilare il campo. */
  pendingDisplayName(): string | null {
    return this.fb.auth.currentUser?.displayName ?? null;
  }

  /** La sessione da completare e' di un account Google: non c'e' una password da scegliere. */
  pendingIsGoogle(): boolean {
    return !this.usesPassword();
  }

  /**
   * L'account si apre con una password. Falso per chi e' entrato solo con
   * Google: non ne ha una, e per confermare un'azione delicata (chiudere
   * l'account) si deve rifare l'accesso con Google invece di scriverla.
   * Senza informazioni sui provider si assume la password, il caso di sempre.
   */
  usesPassword(): boolean {
    const providers = this.fb.auth.currentUser?.providerData;
    if (!providers || providers.length === 0) return true;
    return providers.some(p => p.providerId === 'password');
  }

  /** L'email della sessione da completare, da mostrare a chi la sta finendo. */
  pendingEmail(): string | null {
    return this.fb.auth.currentUser?.email ?? null;
  }

  /**
   * Scrive il profilo che manca, sulla sessione gia' aperta.
   * E' la registrazione, meno la parte che era gia' riuscita.
   */
  completeProfile(displayName: string): Promise<UserProfile> {
    return this.zoneFix.run((async () => {
      const user = this.fb.auth.currentUser;
      if (!user) throw new Error('Sessione scaduta. Accedi di nuovo.');

      const profile: UserProfile = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: displayName.trim(),
        createdAt: new Date().toISOString(),
        ...privacyAccettata()
      };
      await setDoc(doc(this.fb.db, 'users', profile.uid), profile);
      this.currentUser.set(profile);
      return profile;
    })());
  }

  /**
   * Chiude l'account e cancella quello che si porta dietro.
   *
   * Chiede la password (o, per chi e' entrato con Google, rifa' l'accesso con
   * Google) e conferma l'identita' prima di toccare qualsiasi cosa: per due
   * motivi. Firebase rifiuta la cancellazione di un utente la cui sessione
   * e' vecchia (auth/requires-recent-login), e soprattutto e' un'azione che non
   * si annulla - scriverla e' la conferma, un tasto solo no.
   *
   * L'ordine non e' indifferente: prima i documenti, per ultimo l'utente.
   * Le regole permettono di cancellare i propri dati solo a chi e' collegato,
   * quindi chiudendo prima l'account resterebbero li' per sempre, senza piu'
   * nessuno che possa toglierli.
   *
   * Resta un caso che da qui non si copre: se la cancellazione dell'utente
   * fallisce dopo che i dati sono spariti, resta una sessione senza profilo.
   * E' lo stesso stato dell'iscrizione interrotta, e si riprova da capo.
   * Chiuderlo davvero vorrebbe dire farlo fare al server, non al telefono.
   */
  deleteAccount(password?: string): Promise<void> {
    return this.zoneFix.run((async () => {
      const user = this.fb.auth.currentUser;
      const profile = this.currentUser();
      if (!user || !profile) throw new Error('Sessione scaduta. Accedi di nuovo.');
      if (this.usesPassword()) {
        if (!user.email) throw new Error("Questo account non ha un'email: non si può confermare la password.");
        await reauthenticateWithCredential(
          user, EmailAuthProvider.credential(user.email, password ?? '')
        );
      } else {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }

      await this.wipeUserData(user.uid);

      await deleteUser(user);
      this.currentUser.set(null);
    })());
  }

  /**
   * Qualcosa da fare prima di uscire dall'account, quando le regole lasciano
   * ancora scrivere: i promemoria tolgono questo telefono. Non blocca
   * l'uscita: un errore o un'attesa oltre i tre secondi la lasciano passare.
   */
  primaDiUscire(f: () => Promise<void>): void {
    this.allUscita.push(f);
  }

  logout(): Promise<void> {
    return this.zoneFix.run((async () => {
      if (this.allUscita.length) {
        const fatti = Promise.allSettled(this.allUscita.map(f => f()));
        await Promise.race([fatti, new Promise(r => setTimeout(r, 3000))]);
      }
      await signOut(this.fb.auth);
      this.currentUser.set(null);
    })());
  }

  /** Registrazione di un nuovo account: utente su Auth e profilo su Firestore. */
  register(displayName: string, email: string, password: string): Promise<UserProfile> {
    return this.zoneFix.run((async () => {
      const cred = await createUserWithEmailAndPassword(this.fb.auth, email.trim(), password);
      try {
        const profile: UserProfile = {
          uid: cred.user.uid,
          email: email.trim(),
          displayName: displayName.trim(),
          createdAt: new Date().toISOString(),
          ...privacyAccettata()
        };
        await setDoc(doc(this.fb.db, 'users', profile.uid), profile);
        this.currentUser.set(profile);
        return profile;
      } catch (e) {
        // L'utente su Auth c'e' gia' e il profilo no: lasciarlo li' chiude
        // fuori per sempre chi ci ha provato. Toglierlo rimette le cose come
        // prima del tentativo, e "riprova" torna a voler dire qualcosa.
        await this.rollbackAuthUser(cred.user);
        throw e;
      }
    })());
  }

  /**
   * Salva sul profilo i campi che l'utente cambia da solo: nome, cognome,
   * data di nascita, sesso e altezza, o un sottoinsieme qualsiasi. `null`
   * toglie il valore.
   *
   * Sono gli unici che l'utente tocca, e le regole non gli lasciano scrivere
   * altro: uid, email e accettazione dell'informativa li decide l'iscrizione.
   *
   * Altezza, sesso e data di nascita stanno qui e non fra le misurazioni
   * perche' si dichiarano una volta e restano: in `MeasurementEntry` l'app li
   * richiederebbe a ogni controllo, accanto a peso e pliche, che invece
   * cambiano ogni volta.
   *
   * Chi cambia nome o cognome deve passare anche displayName ricomposto: e'
   * quello che l'app mostra ovunque, e lasciarlo indietro farebbe comparire il
   * nome vecchio nell'intestazione e nell'Account.
   *
   * Scrive in merge invece che rimpiazzare il documento: il profilo porta
   * campi che quella schermata non conosce e una scrittura piena li
   * azzererebbe.
   *
   * Aggiorna anche il signal, altrimenti il valore resterebbe quello vecchio
   * fino al prossimo accesso: `currentUser` non rilegge da solo.
   */
  patchBody(patch: {
    heightCm?: number | null;
    sex?: Sex | null;
    birthDate?: string | null;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<void> {
    return this.zoneFix.run((async () => {
      const user = this.currentUser();
      if (!user) throw new Error('Nessun utente collegato.');
      await setDoc(doc(this.fb.db, 'users', user.uid), patch, { merge: true });
      this.currentUser.set({ ...user, ...patch });
    })());
  }


}
