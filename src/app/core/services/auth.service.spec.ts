import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock condivisa: vedi src/test-support/firestore-mock.ts per il perche' non
// puo' vivere qui dentro (isolate: false condivide i moduli fra i file).
vi.mock('firebase/firestore', async () => (await import('../../../test-support/firestore-mock')).firestoreMock);

/**
 * La finta Auth. Vive su globalThis per lo stesso motivo della mock di
 * Firestore: le spec chiamano vi.resetModules(), e una const di modulo
 * verrebbe ricreata a ogni rivalutazione.
 */
type UtenteFinto = {
  uid: string; email: string | null; displayName?: string | null; providerData?: { providerId: string }[];
};
type StatoAuth = {
  utenteCorrente: UtenteFinto | null;
  cancellati: string[];
  usciteEffettuate: number;
  creaFallisce: boolean;
  /** Chi esce dal popup di Google, quando si preme "Continua con Google". */
  utenteGoogle: UtenteFinto | null;
  riautenticazioniGoogle: number;
};
const scope = globalThis as unknown as { __authState?: StatoAuth };
const stato: StatoAuth = (scope.__authState ??= {
  utenteCorrente: null, cancellati: [], usciteEffettuate: 0, creaFallisce: false,
  utenteGoogle: null, riautenticazioniGoogle: 0
});

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  getAuth: () => ({}),
  signInWithEmailAndPassword: async (_a: any, email: string) => {
    stato.utenteCorrente = { uid: 'uid-' + email, email };
    return { user: stato.utenteCorrente };
  },
  createUserWithEmailAndPassword: async (_a: any, email: string) => {
    if (stato.creaFallisce) throw Object.assign(new Error('gia usata'), { code: 'auth/email-already-in-use' });
    stato.utenteCorrente = { uid: 'uid-' + email, email };
    return { user: stato.utenteCorrente };
  },
  deleteUser: async (u: { uid: string }) => {
    stato.cancellati.push(u.uid);
    stato.utenteCorrente = null;
  },
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  reauthenticateWithCredential: async (_u: any, cred: { password: string }) => {
    if (cred.password !== 'giusta') throw Object.assign(new Error('no'), { code: 'auth/wrong-password' });
    return { user: stato.utenteCorrente };
  },
  signOut: async () => { stato.usciteEffettuate++; stato.utenteCorrente = null; },
  sendPasswordResetEmail: async () => {},
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: async () => {
    stato.utenteCorrente = stato.utenteGoogle;
    return { user: stato.utenteGoogle };
  },
  reauthenticateWithPopup: async () => {
    stato.riautenticazioniGoogle++;
    return { user: stato.utenteCorrente };
  }
}));

import { mockDocs, firestoreMock } from '../../../test-support/firestore-mock';
import { PRIVACY_VERSION } from '../privacy';

// La setDoc originale, presa UNA volta sola: riprenderla dentro il beforeEach
// significherebbe catturare la spia del giro precedente, e la chiamata
// tornerebbe su se stessa all'infinito.
const setDocPristino = firestoreMock.setDoc;

describe("AuthService — iscrizioni che si rompono a meta'", () => {
  let AuthService: any;
  let PROFILE_MISSING: string;
  let PROFILO_TIMEOUT_MS: number;
  let service: any;
  let scritturaFallisce: (id: string) => boolean;

  beforeEach(async () => {
    mockDocs.clear();
    stato.utenteCorrente = null;
    stato.cancellati = [];
    stato.usciteEffettuate = 0;
    stato.creaFallisce = false;
    stato.utenteGoogle = null;
    stato.riautenticazioniGoogle = 0;
    scritturaFallisce = () => false;

    vi.resetModules();
    const mod = await import('./auth.service');
    AuthService = mod.AuthService;
    PROFILE_MISSING = mod.PROFILE_MISSING;
    PROFILO_TIMEOUT_MS = mod.PROFILO_TIMEOUT_MS;

    const firestore: any = await import('firebase/firestore');
    vi.spyOn(firestore, 'setDoc').mockImplementation(async (ref: any, ...resto: any[]) => {
      if (scritturaFallisce(ref.id)) throw new Error('rete assente');
      return (setDocPristino as any)(ref, ...resto);
    });

    // L'auth finta e' un oggetto vivo: il servizio ci legge currentUser.
    const fbStub = { db: {}, get auth() { return { get currentUser() { return stato.utenteCorrente; } }; } } as any;
    const zoneStub = { run: (fn: any) => fn() } as any;
    const zoneFixStub = { run: (p: Promise<any>) => p } as any;
    const appRefStub = { tick: () => {} } as any;
    service = new AuthService(fbStub, zoneStub, zoneFixStub, appRefStub);
  });

  it("cancella l'utente Auth se il profilo non si scrive", async () => {
    scritturaFallisce = (id) => id.startsWith('uid-');

    await expect(service.register('Anna', 'anna@e.com', 'pw1234')).rejects.toThrow('rete assente');
    expect(stato.cancellati).toEqual(['uid-anna@e.com']);
  });

  it('non cancella niente quando la registrazione riesce', async () => {
    const profilo = await service.register('Anna', 'anna@e.com', 'pw1234');
    expect(profilo.uid).toBe('uid-anna@e.com');
    expect(profilo.displayName).toBe('Anna');
    expect(stato.cancellati).toEqual([]);
  });

  it("il profilo non porta piu' nessun ruolo ne' codice di abbinamento", async () => {
    const profilo = await service.register('Anna', 'anna@e.com', 'pw1234');
    expect(profilo).not.toHaveProperty('role');
    expect(profilo).not.toHaveProperty('coachId');
    expect(profilo).not.toHaveProperty('pairingCode');
    expect(profilo).not.toHaveProperty('paired');
  });

  it("l'accesso senza profilo segnala il caso e NON chiude la sessione", async () => {
    try {
      await service.login('orfano@e.com', 'pw1234');
      throw new Error('doveva fallire');
    } catch (e: any) {
      expect(e.code).toBe(PROFILE_MISSING);
    }
    // Senza la sessione aperta il profilo mancante non si potrebbe piu' scrivere.
    expect(stato.usciteEffettuate).toBe(0);
    expect(service.hasPendingProfile()).toBe(true);
    expect(service.pendingEmail()).toBe('orfano@e.com');
  });

  it("completeProfile finisce l'iscrizione sulla sessione aperta", async () => {
    await service.login('orfano@e.com', 'pw1234').catch(() => {});
    const profilo = await service.completeProfile('Anna');
    expect(profilo.email).toBe('orfano@e.com');
    expect(profilo.displayName).toBe('Anna');
    expect(service.currentUser().uid).toBe('uid-orfano@e.com');
    expect(service.hasPendingProfile()).toBe(false);
  });

  it("senza sessione aperta non c'e' niente da completare", async () => {
    expect(service.hasPendingProfile()).toBe(false);
    expect(service.pendingEmail()).toBeNull();
    await expect(service.completeProfile('Anna')).rejects.toThrow(/Sessione scaduta/);
  });

  describe("chiusura dell'account", () => {
    const entra = async () => {
      mockDocs.set('uid-via@e.com', { uid: 'uid-via@e.com', email: 'via@e.com' });
      await service.login('via@e.com', 'pw1234');
    };

    it("porta via i documenti e poi l'utente Auth", async () => {
      await entra();
      mockDocs.set('seduta-1', { dayId: 'day1' });
      mockDocs.set('misura-1', { peso: 80 });
      mockDocs.set('protocollo-1', { name: 'Il mio' });

      await service.deleteAccount('giusta');

      expect(mockDocs.size).toBe(0);
      expect(stato.cancellati).toEqual(['uid-via@e.com']);
      expect(service.currentUser()).toBeNull();
    });

    it('con la password sbagliata non tocca niente', async () => {
      await entra();
      await expect(service.deleteAccount('sbagliata')).rejects.toMatchObject({ code: 'auth/wrong-password' });
      expect(mockDocs.get('uid-via@e.com')).toBeTruthy();
      expect(stato.cancellati).toEqual([]);
    });

    it("senza sessione non c'e' niente da chiudere", async () => {
      await expect(service.deleteAccount('giusta')).rejects.toThrow(/Sessione scaduta/);
    });

    it('svuota anche i promemoria, coi telefoni iscritti', async () => {
      await entra();
      const firestore: any = await import('firebase/firestore');
      const raccolte = vi.spyOn(firestore, 'collection');
      await service.deleteAccount('giusta');
      expect(raccolte.mock.calls.map((c: any[]) => c.slice(1).join('/'))).toEqual(
        ['sessions', 'runs', 'measurements', 'state', 'protocols', 'promemoria'].map(r => `users/uid-via@e.com/${r}`)
      );
    });
  });

  describe("uscire dall'account", () => {
    it('prima di uscire fa quello che gli si e\' chiesto, poi esce', async () => {
      const ordine: string[] = [];
      // Il gancio aspetta prima di finire: l'uscita deve aspettare lui.
      service.primaDiUscire(async () => { await new Promise(r => setTimeout(r, 20)); ordine.push('promemoria'); });
      const firebaseAuth: any = await import('firebase/auth');
      const esci = vi.spyOn(firebaseAuth, 'signOut').mockImplementation(async () => { ordine.push('uscita'); });
      await service.logout();
      expect(ordine).toEqual(['promemoria', 'uscita']);
      expect(service.currentUser()).toBeNull();
      esci.mockRestore();
    });

    it('un errore, o un\'attesa troppo lunga, non bloccano l\'uscita', async () => {
      vi.useFakeTimers();
      service.primaDiUscire(async () => { throw new Error('rete'); });
      service.primaDiUscire(() => new Promise<void>(() => {}));
      const uscita = service.logout();
      await vi.advanceTimersByTimeAsync(3000);
      await uscita;
      expect(stato.usciteEffettuate).toBe(1);
      vi.useRealTimers();
    });

    it('senza niente da fare esce subito', async () => {
      await service.logout();
      expect(stato.usciteEffettuate).toBe(1);
    });
  });

  describe('accesso con Google', () => {
    const GOOGLE = { providerId: 'google.com' };
    const utenteGoogle = (): UtenteFinto => ({
      uid: 'uid-google', email: 'anna@gmail.com', displayName: 'Anna G', providerData: [GOOGLE]
    });

    it('un account Google gia\' iscritto entra e riceve il suo profilo', async () => {
      stato.utenteGoogle = utenteGoogle();
      mockDocs.set('uid-google', { uid: 'uid-google', email: 'anna@gmail.com', displayName: 'Anna G' });

      const profilo = await service.loginWithGoogle();

      expect(profilo.uid).toBe('uid-google');
      expect(service.currentUser().uid).toBe('uid-google');
      expect(stato.usciteEffettuate).toBe(0);
    });

    /* Il primo accesso con Google crea l'utente su Auth ma non il profilo: e'
       lo stesso caso dell'iscrizione a meta', e la sessione deve restare
       aperta perche' serve a scrivere il profilo che manca. */
    it('un account Google nuovo segnala il profilo mancante e NON chiude la sessione', async () => {
      stato.utenteGoogle = utenteGoogle();

      await expect(service.loginWithGoogle()).rejects.toMatchObject({ code: PROFILE_MISSING });

      expect(stato.usciteEffettuate).toBe(0);
      expect(service.currentUser()).toBeNull();
      expect(service.hasPendingProfile()).toBe(true);
      expect(service.pendingIsGoogle()).toBe(true);
      expect(service.pendingDisplayName()).toBe('Anna G');
    });

    /* Il popup non ha un tempo massimo, ma la lettura del profilo dopo si': un
       Firestore che non risponde lasciava il tasto su "Un attimo..." per
       sempre, e l'unica uscita era ricaricare l'app. */
    // Timer finti e spie si rimettono a posto qui e non in un finally nel test:
    // se un test va in timeout il suo finally non gira mai, e i timer finti
    // resterebbero accesi per tutti quelli che seguono.
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('se il profilo non arriva, l\'accesso fallisce con TIMEOUT invece di restare appeso', async () => {
      vi.useFakeTimers();
      const firestore: any = await import('firebase/firestore');
      vi.spyOn(firestore, 'getDoc').mockImplementation(() => new Promise(() => {}));
      stato.utenteGoogle = utenteGoogle();

      const esito = service.loginWithGoogle().then(() => 'entrato', (e: any) => e.message);
      await vi.advanceTimersByTimeAsync(PROFILO_TIMEOUT_MS);

      await expect(esito).resolves.toBe('TIMEOUT');
    });

    it('a profilo arrivato non resta nessun timer in sospeso', async () => {
      vi.useFakeTimers();
      stato.utenteGoogle = utenteGoogle();
      mockDocs.set('uid-google', { uid: 'uid-google', email: 'anna@gmail.com', displayName: 'Anna G' });

      await service.loginWithGoogle();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('si finisce l\'iscrizione con il nome e l\'informativa, senza password', async () => {
      stato.utenteGoogle = utenteGoogle();
      await service.loginWithGoogle().catch(() => {});

      const profilo = await service.completeProfile('Anna');

      expect(profilo.email).toBe('anna@gmail.com');
      expect(profilo.displayName).toBe('Anna');
      expect(profilo.privacyVersion).toBe(PRIVACY_VERSION);
      expect(mockDocs.get('uid-google').uid).toBe('uid-google');
    });

    it('chi entra con la password non e\' un account Google', async () => {
      await service.login('orfano@e.com', 'pw1234').catch(() => {});
      expect(service.usesPassword()).toBe(true);
      expect(service.pendingIsGoogle()).toBe(false);
    });

    it('chiudere un account Google non chiede la password: conferma con Google', async () => {
      stato.utenteGoogle = utenteGoogle();
      mockDocs.set('uid-google', { uid: 'uid-google', email: 'anna@gmail.com', displayName: 'Anna G' });
      mockDocs.set('seduta-1', { dayId: 'day1' });
      await service.loginWithGoogle();

      await service.deleteAccount();

      expect(stato.riautenticazioniGoogle).toBe(1);
      expect(mockDocs.size).toBe(0);
      expect(stato.cancellati).toEqual(['uid-google']);
    });
  });

  /* Le regole pretendono data e versione su ogni profilo nuovo: se una delle
     strade che creano un profilo se ne dimenticasse, l'iscrizione fallirebbe
     in produzione con un permission-denied e basta. */
  describe("l'accettazione dell'informativa finisce sul profilo", () => {
    const haLAccettazione = (p: any) => {
      expect(typeof p.privacyAcceptedAt).toBe('string');
      expect(p.privacyAcceptedAt.length).toBeGreaterThan(0);
      expect(p.privacyVersion).toBe(PRIVACY_VERSION);
    };

    it('iscrivendosi', async () => {
      haLAccettazione(await service.register('Anna', 'anna@e.com', 'pw1234'));
    });

    it("finendo un'iscrizione interrotta", async () => {
      await service.login('orfano@e.com', 'pw1234').catch(() => {});
      haLAccettazione(await service.completeProfile('Anna'));
    });

    it('e finisce anche nel documento scritto, non solo nel valore di ritorno', async () => {
      await service.register('Anna', 'anna@e.com', 'pw1234');
      haLAccettazione(mockDocs.get('uid-anna@e.com'));
    });
  });
});
