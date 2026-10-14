import { Injectable } from '@angular/core';
import { doc, getDoc, updateDoc, deleteField, runTransaction } from 'firebase/firestore';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { ZoneFixService } from '../core/utils/zone.util';
import { sanitizeForFirestore } from '../core/utils/sanitize.util';
import { ToastService } from './toast.service';

export interface WorkoutDraftRow {
  reps: string;
  load: string;
  done: boolean;
  /** Serie aggiunta a mano durante l'allenamento. Senza questo contrassegno,
   *  al ricaricamento non ci sarebbe modo di distinguerla dagli avanzi di un
   *  piano che da allora si e' accorciato. Manca nelle bozze di prima. */
  extra?: boolean;
}

export interface ActiveWorkoutSession {
  dayId: string;
  /** Etichetta del giorno all'avvio. Gli id sono posizionali (day0, day1...):
   *  se il coach riordina o sostituisce i giorni, lo stesso id punta a un altro
   *  allenamento. Confrontare l'etichetta e' cio' che smaschera il cambio. */
  dayLabel?: string;
  /** Istante di avvio in ISO. Il tempo trascorso si ricalcola da qui, mai accumulato. */
  startedAt: string;
  /** Istante in cui e' stata messa in pausa (ISO), assente se il cronometro corre. */
  pausedAt?: string | null;
  /** Millisecondi gia' passati in pausa: vanno sottratti dalla durata. */
  pausedMs?: number;
}

export type ThemeMode = 'dark' | 'light';

export interface AppState {
  workoutDrafts: Record<string, { rows: WorkoutDraftRow[] }[]>;
  restOverrides: Record<string, number>;
  measureDraft: Record<string, Record<string, string | null>> | null;
  shoppingChecked: Record<string, boolean>;
  shoppingCustomItems: { id: string; name: string; checked: boolean }[];
  workoutViewMode: 'list' | 'slider';
  dietViewMode: 'list' | 'slider';
  mealsCompletion: { date: string; done: Record<string, boolean> } | null;
  themeMode: ThemeMode | null;
  activeWorkoutSession: ActiveWorkoutSession | null;
  /**
   * La percentuale del massimale su cui si vuole lavorare, valida per tutto il
   * programma. null = spenta, ed e' il default: senza, ogni esercizio continua
   * a suggerire il peso dell'ultima volta e basta.
   */
  loadPercent: number | null;
}

/** Finestra di silenzio fra due segnalazioni di scrittura fallita. */
const WRITE_ERROR_QUIET_MS = 5000;

function emptyState(): AppState {
  return { workoutDrafts: {}, restOverrides: {}, measureDraft: null, shoppingChecked: {}, shoppingCustomItems: [], workoutViewMode: 'list', dietViewMode: 'list', mealsCompletion: null, themeMode: null, activeWorkoutSession: null, loadPercent: null };
}

/**
 * Un unico documento Firestore (users/{uid}/state/app) che raccoglie tutto lo
 * stato "effimero"/di sessione dell'utente: bozze di allenamento in corso,
 * override del tempo di recupero per esercizio, modalita' dieta ON/OFF e
 * bozza delle misure in corso. Un solo read copre tutto; gli aggiornamenti
 * usano dot-notation cosi' non serve riscrivere l'intero documento.
 */
@Injectable({ providedIn: 'root' })
export class AppStateService {
  private cache: AppState | null = null;

  /** Ultima segnalazione di scrittura fallita: evita una raffica di toast
   *  identici quando la rete cade e falliscono dieci scritture di fila. */
  private lastWriteErrorAt = 0;

  constructor(
    private fb: FirebaseService,
    private auth: AuthService,
    private zoneFix: ZoneFixService,
    private toast: ToastService
  ) {}

  /**
   * Le scritture di stato sono quasi tutte "fire and forget": nessuno aspetta
   * la Promise, quindi un errore sparirebbe in silenzio e l'utente crederebbe
   * salvato quello che non lo e'. Qui viene segnalato una volta sola, e poi
   * rilanciato per chi invece la Promise la sta aspettando davvero.
   */
  private reportWriteFailure(what: string, error: unknown): never {
    console.error(`Scrittura fallita (${what}):`, error);
    const now = Date.now();
    if (now - this.lastWriteErrorAt > WRITE_ERROR_QUIET_MS) {
      this.lastWriteErrorAt = now;
      this.toast.error('Modifica non salvata. Controlla la connessione.');
    }
    throw error;
  }

  private ref() {
    const uid = this.auth.currentUser()!.uid;
    return doc(this.fb.db, 'users', uid, 'state', 'app');
  }

  load(): Promise<AppState> {
    if (this.cache) return Promise.resolve(this.cache);
    return this.zoneFix.run((async () => {
      const snap = await getDoc(this.ref());
      this.cache = snap.exists() ? { ...emptyState(), ...(snap.data() as AppState) } : emptyState();
      return this.cache;
    })());
  }

  private async ensureDoc(): Promise<void> {
    // Transazione invece di getDoc+setDoc separati: se due chiamate concorrenti
    // (es. cambio vista + autosalvataggio bozza) trovano entrambe il doc
    // mancante, solo una delle due lo crea davvero; l'altra la vede gia'
    // esistente e non sovrascrive nulla.
    await runTransaction(this.fb.db, async (tx) => {
      const snap = await tx.get(this.ref());
      if (!snap.exists()) {
        tx.set(this.ref(), emptyState());
      }
    });
  }

  patch(partial: Partial<AppState>): Promise<void> {
    const clean = sanitizeForFirestore(partial);
    return this.zoneFix.run((async () => {
      try {
        await this.ensureDoc();
        await updateDoc(this.ref(), clean as any);
        this.cache = { ...(this.cache ?? emptyState()), ...clean };
      } catch (e) { this.reportWriteFailure('patch', e); }
    })());
  }

  /** Aggiorna un campo annidato tramite dot-notation (es. 'workoutDrafts.day0'). */
  patchField(path: string, value: unknown): Promise<void> {
    const cleanValue = sanitizeForFirestore(value);
    return this.zoneFix.run((async () => {
      try {
        await this.ensureDoc();
        await updateDoc(this.ref(), { [path]: cleanValue } as any);
        this.invalidateCache();
      } catch (e) { this.reportWriteFailure(path, e); }
    })());
  }

  /** Rimuove un campo annidato tramite dot-notation. */
  deleteFieldPath(path: string): Promise<void> {
    return this.zoneFix.run((async () => {
      try {
        await this.ensureDoc();
        await updateDoc(this.ref(), { [path]: deleteField() } as any);
        this.invalidateCache();
      } catch (e) { this.reportWriteFailure(`${path} (rimozione)`, e); }
    })());
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
