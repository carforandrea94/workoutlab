import { Injectable, InjectionToken, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { firstValueFrom, timeout } from 'rxjs';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { ZoneFixService } from '../core/utils/zone.util';
import { sanitizeForFirestore } from '../core/utils/sanitize.util';
import { mondayISO, todayLocalISO } from '../core/utils/date.util';
import { Promemoria, normalizzaPromemoria, prossimoPromemoria } from '../core/utils/promemoria.util';
import { WeeklyProgressService } from './weekly-progress.service';
import { WorkoutDataService } from './workout-data.service';
import { environment } from '../../environments/environment';

/** La chiave pubblica VAPID (vedi environment.ts): un token, perche' i test la possano scegliere. */
export const CHIAVE_PUSH = new InjectionToken<string>('CHIAVE_PUSH', { factory: () => environment.vapidPublicKey });

/**
 * Dove vive il promemoria: users/{uid}/promemoria/impostazioni. Separato dal
 * servizio perche' i test gli passino un archivio in memoria; le date
 * diventano Timestamp, e "aggiornato" l'ora del server, solo qui.
 */
export interface ArchivioPromemoria {
  leggi(uid: string): Promise<unknown | null>;
  /** Fonde i campi nel documento, creandolo se manca; le mappe annidate si fondono. */
  unisci(uid: string, campi: Record<string, unknown>): Promise<void>;
  /** Aggiorna campi di un documento che c'e' gia'; le chiavi col punto sono percorsi. */
  aggiorna(uid: string, campi: Record<string, unknown>): Promise<void>;
  togliTelefono(uid: string, chiave: string): Promise<void>;
}

export function archivioFirestore(db: Firestore, zoneFix: Pick<ZoneFixService, 'run'>): ArchivioPromemoria {
  const ref = (uid: string) => doc(db, 'users', uid, 'promemoria', 'impostazioni');
  const perFirestore = (campi: Record<string, unknown>) => {
    const out: Record<string, unknown> = { aggiornato: serverTimestamp() };
    for (const [k, v] of Object.entries(campi)) out[k] = v instanceof Date ? Timestamp.fromDate(v) : sanitizeForFirestore(v);
    return out;
  };
  return {
    leggi: async uid => {
      const snap = await zoneFix.run(getDoc(ref(uid)));
      return snap.exists() ? snap.data() : null;
    },
    unisci: (uid, campi) => zoneFix.run(setDoc(ref(uid), perFirestore(campi), { merge: true })),
    aggiorna: (uid, campi) => zoneFix.run(updateDoc(ref(uid), perFirestore(campi))),
    togliTelefono: (uid, chiave) => zoneFix.run(updateDoc(ref(uid), { [`iscrizioni.${chiave}`]: deleteField() }))
  };
}

export const ARCHIVIO_PROMEMORIA = new InjectionToken<ArchivioPromemoria>('ARCHIVIO_PROMEMORIA', {
  factory: () => archivioFirestore(inject(FirebaseService).db, inject(ZoneFixService))
});

/**
 * Cosa permette questo telefono:
 * - ok: si puo' attivare;
 * - installa: iPhone o iPad da Safari, le notifiche arrivano solo con l'app sulla schermata Home;
 * - non-supportato: il browser non ha le notifiche push;
 * - non-configurato: manca la chiave del server (vedi docs/promemoria.md).
 */
export type Supporto = 'ok' | 'installa' | 'non-supportato' | 'non-configurato';

export type EsitoAttivazione = 'ok' | 'negato' | 'errore';

/** Una chiave corta e sicura per Firestore, dall'indirizzo del telefono (due hash FNV-1a a 32 bit). */
export function chiaveTelefono(endpoint: string): string {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < endpoint.length; i++) {
    const c = endpoint.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return 't' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Il telefono, per quello che serve a capire cosa permette (vedi supporto). */
export interface Ambiente {
  push: boolean;
  apple: boolean;
  installata: boolean;
}

export const AMBIENTE = new InjectionToken<() => Ambiente>('AMBIENTE', {
  factory: () => () => {
    const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { standalone?: boolean } : null;
    return {
      push: !!nav && 'serviceWorker' in nav && typeof window !== 'undefined' && 'PushManager' in window,
      apple: !!nav && (/iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)),
      installata: !!nav && (nav.standalone === true
        || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches))
    };
  }
});

/**
 * I promemoria degli allenamenti, dal lato dell'app.
 *
 * L'orario sta in users/{uid}/promemoria/impostazioni; il server (functions/)
 * lo legge ogni cinque minuti e manda la notifica al service worker di
 * Angular. Accanto all'orario l'app scrive cosa sa della settimana (i giorni
 * del programma, quelli fatti, l'ultima seduta): il server la usa per dire
 * quale seduta tocca e per tacere se oggi ci si e' gia' allenati.
 *
 * I telefoni iscritti sono una mappa, una chiave per telefono: uscendo
 * dall'account si toglie il proprio, e a un altro utente sullo stesso telefono
 * non arrivano i promemoria di chi c'era prima.
 */
@Injectable({ providedIn: 'root' })
export class PromemoriaService {
  private readonly auth = inject(AuthService);
  private readonly swPush = inject(SwPush);
  private readonly weekly = inject(WeeklyProgressService);
  private readonly workoutData = inject(WorkoutDataService);
  private readonly chiave = inject(CHIAVE_PUSH);
  private readonly archivio = inject(ARCHIVIO_PROMEMORIA);
  private readonly ambiente = inject(AMBIENTE);

  /** L'ultimo promemoria letto o scritto, di quell'utente. */
  private cache: { uid: string; promemoria: Promemoria } | null = null;
  /** L'ultima fotografia della settimana scritta: uguale, non si riscrive. */
  private ultimaFoto = '';

  constructor() {
    // A ogni lettura delle sedute (la scheda, la fine di un allenamento) la
    // fotografia della settimana si aggiorna, se i promemoria sono accesi.
    this.weekly.dopoOgniLettura(() => void this.sincronizza());
    this.auth.primaDiUscire(() => this.togliQuestoTelefono());
  }

  supporto(): Supporto {
    if (!this.chiave) return 'non-configurato';
    const a = this.ambiente();
    if (a.push && this.swPush.isEnabled) return 'ok';
    return a.apple && !a.installata ? 'installa' : 'non-supportato';
  }

  /** Il permesso delle notifiche su questo telefono. */
  permesso(): NotificationPermission | 'non-supportato' {
    return typeof Notification === 'undefined' ? 'non-supportato' : Notification.permission;
  }

  async carica(): Promise<Promemoria> {
    const uid = this.uid();
    if (this.cache?.uid === uid) return this.cache.promemoria;
    const promemoria = normalizzaPromemoria(await this.archivio.leggi(uid));
    this.cache = { uid, promemoria };
    return promemoria;
  }

  /**
   * Accende i promemoria su questo telefono: chiede il permesso e iscrive il
   * service worker. Va chiamata dal tocco dell'utente, senza attese prima: su
   * iPhone il permesso si chiede solo in risposta a un gesto.
   */
  async attiva(p: Promemoria): Promise<EsitoAttivazione> {
    let iscrizione: PushSubscription;
    try {
      iscrizione = await this.swPush.requestSubscription({ serverPublicKey: this.chiave });
    } catch (e) {
      // Permesso negato (adesso o in passato): lo dice il browser.
      if (this.permesso() === 'denied') return 'negato';
      console.error('Iscrizione alle notifiche fallita:', e);
      return 'errore';
    }
    try {
      await this.scrivi({ ...p, attivo: true }, iscrizione);
      return 'ok';
    } catch (e) {
      console.error('Salvataggio dei promemoria fallito:', e);
      return 'errore';
    }
  }

  /** Spegne i promemoria: il server smette di guardarli. I telefoni restano iscritti, per riaccenderli senza chiedere di nuovo. */
  async spegni(p: Promemoria): Promise<void> {
    await this.scrivi({ ...p, attivo: false });
  }

  /** Giorni e ora nuovi: si ricalcola il prossimo promemoria. */
  async cambia(p: Promemoria): Promise<void> {
    await this.scrivi(p);
  }

  /**
   * La fotografia della settimana per il server, se i promemoria sono accesi
   * e se e' cambiata. Ne approfitta per rimettere l'iscrizione del telefono,
   * che il browser puo' aver rinnovato. Se qualcosa non va, tace: e' un di piu'.
   */
  async sincronizza(): Promise<void> {
    try {
      if (!this.auth.currentUser()) return;
      const p = await this.carica();
      if (!p.attivo) return;
      const foto = this.fotografia();
      const iscrizione = await this.iscrizioneAttuale();
      const firma = JSON.stringify([foto, iscrizione?.endpoint ?? null]);
      if (firma === this.ultimaFoto) return;
      const campi: Record<string, unknown> = { ...foto };
      if (iscrizione) campi[`iscrizioni.${chiaveTelefono(iscrizione.endpoint)}`] = iscrizione.toJSON();
      await this.archivio.aggiorna(this.uid(), campi);
      this.ultimaFoto = firma;
    } catch (e) {
      console.error('Aggiornamento dei promemoria fallito:', e);
    }
  }

  /** Prima di uscire dall'account: questo telefono non riceve piu' i suoi promemoria. */
  private async togliQuestoTelefono(): Promise<void> {
    const utente = this.auth.currentUser();
    this.cache = null;
    this.ultimaFoto = '';
    if (!utente) return;
    const iscrizione = await this.iscrizioneAttuale();
    if (!iscrizione) return;
    // Il documento puo' non esserci: allora non c'e' niente da togliere.
    await this.archivio.togliTelefono(utente.uid, chiaveTelefono(iscrizione.endpoint)).catch(() => {});
  }

  private async scrivi(p: Promemoria, iscrizione?: PushSubscription): Promise<void> {
    const uid = this.uid();
    const prossimo = p.attivo ? prossimoPromemoria(p, new Date()) : null;
    const campi: Record<string, unknown> = {
      attivo: p.attivo, giorni: p.giorni, ora: p.ora,
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
      prossimo: prossimo ? prossimo.invio : null,
      ...this.fotografia()
    };
    // Si fonde: gli altri telefoni della mappa restano.
    if (iscrizione) campi['iscrizioni'] = { [chiaveTelefono(iscrizione.endpoint)]: iscrizione.toJSON() };
    await this.archivio.unisci(uid, campi);
    this.cache = { uid, promemoria: { attivo: p.attivo, giorni: [...p.giorni], ora: p.ora } };
    this.ultimaFoto = '';
  }

  /** Cosa sa l'app della settimana: i giorni del programma, quelli fatti, l'ultima seduta. */
  private fotografia() {
    return {
      programma: this.workoutData.days.map(d => ({ id: d.id, label: d.label })),
      fatti: { settimana: mondayISO(todayLocalISO()), ids: [...this.weekly.doneDayIds()].sort() },
      ultimaSeduta: this.weekly.ultimaSeduta()
    };
  }

  /** L'iscrizione di questo telefono, se c'e'. Il service worker puo' non rispondere: si aspetta poco. */
  private async iscrizioneAttuale(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    try {
      return await firstValueFrom(this.swPush.subscription.pipe(timeout(3000)));
    } catch {
      return null;
    }
  }

  private uid(): string {
    const utente = this.auth.currentUser();
    if (!utente) throw new Error('Nessun utente collegato');
    return utente.uid;
  }
}
