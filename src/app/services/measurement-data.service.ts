import { Injectable } from '@angular/core';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, writeBatch } from 'firebase/firestore';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { AppStateService } from './app-state.service';
import {
  MeasurementEntry,
  MeasurementKey,
  normalizeMeasurement,
  MeasureCategory,
  CATEGORY_FIELDS,
  ALL_MEASURE_FIELDS
} from '../models/measurement.model';
import { ZoneFixService } from '../core/utils/zone.util';
import { todayLocalISO } from '../core/utils/date.util';

/** L'ultimo valore di ogni campo, e il giorno in cui e' stato registrato. */
export type UltimiValori = Partial<Record<MeasurementKey, { value: string; date: string }>>;

/**
 * Per ogni campo, il valore piu' recente che ha uno storico e la sua data.
 * `history` e' dal piu' recente: la prima voce che ha il campo vince. Non tutte
 * le voci hanno tutti i campi (si misura il peso un giorno, le pliche un altro),
 * quindi l'ultimo valore di un campo puo' essere piu' vecchio dell'ultima voce.
 */
export function ultimiValori(history: MeasurementEntry[]): UltimiValori {
  const out: UltimiValori = {};
  for (const field of ALL_MEASURE_FIELDS) {
    for (const entry of history) {
      const v = entry[field.key];
      if (v) { out[field.key] = { value: v, date: entry.date }; break; }
    }
  }
  return out;
}

/**
 * Dati misure su Firestore:
 * - storico: users/{uid}/measurements/{isoDate}
 * - bozza in corso: campo measureDraft.{categoria} del doc users/{uid}/state/app
 */
@Injectable({ providedIn: 'root' })
export class MeasurementDataService {

  constructor(
    private fb: FirebaseService,
    private auth: AuthService,
    private appState: AppStateService,
    private zoneFix: ZoneFixService
  ) {}

  private col() {
    const uid = this.auth.currentUser()!.uid;
    return collection(this.fb.db, 'users', uid, 'measurements');
  }

  async loadDraft(category: MeasureCategory): Promise<Record<string, string | null> | null> {
    const state = await this.appState.load();
    return state.measureDraft?.[category] ?? null;
  }

  async saveDraft(category: MeasureCategory, values: Record<string, string | null>): Promise<void> {
    await this.appState.patchField(`measureDraft.${category}`, values);
  }

  async clearDraft(category: MeasureCategory): Promise<void> {
    await this.appState.deleteFieldPath(`measureDraft.${category}`);
  }

  /** Tutte le voci storiche, ordinate dalla piu' recente. */
  loadHistory(): Promise<MeasurementEntry[]> {
    return this.zoneFix.run((async () => {
      const snap = await getDocs(this.col());
      return snap.docs
        // I documenti scritti con lo schema precedente si leggono comunque:
        // i siti che esistono in entrambi vengono riportati sui nomi nuovi.
        .map(d => normalizeMeasurement(d.data()))
        .sort((a, b) => b.date.localeCompare(a.date));
    })());
  }

  deleteEntry(date: string): Promise<boolean> {
    return this.zoneFix.run((async () => {
      try {
        await deleteDoc(doc(this.col(), date));
        return true;
      } catch {
        return false;
      }
    })());
  }

  /** Per ogni campo, l'ultimo valore registrato nello storico. */
  async getLastValues(): Promise<Partial<Record<MeasurementKey, string>>> {
    const out: Partial<Record<MeasurementKey, string>> = {};
    for (const [k, u] of Object.entries(ultimiValori(await this.loadHistory()))) {
      out[k as MeasurementKey] = u!.value;
    }
    return out;
  }

  /** Come getLastValues, con il giorno: il form dice "ultimo 82 kg · 3 ott" invece di un segnaposto che sembra un valore. */
  async getLastValuesWithDate(): Promise<UltimiValori> {
    return ultimiValori(await this.loadHistory());
  }

  /** L'ultima voce storica precedente a una certa data (per calcolare le variazioni). */
  async getPreviousEntry(beforeDate?: string): Promise<MeasurementEntry | null> {
    const history = await this.loadHistory();
    if (!beforeDate) return history[0] ?? null;
    return history.find(e => e.date < beforeDate) ?? null;
  }

  /** I soli campi di una categoria per una data specifica (per precompilare il form di modifica). */
  async getCategoryValues(category: MeasureCategory, date: string): Promise<Record<string, string | null>> {
    const history = await this.loadHistory();
    const entry = history.find(e => e.date === date);
    const out: Record<string, string | null> = {};
    for (const f of CATEGORY_FIELDS[category]) {
      out[f.key] = entry?.[f.key] ?? null;
    }
    return out;
  }

  /** Unisce i campi di una categoria nella voce storico di oggi (la crea se non esiste). */
  saveCategoryToday(category: MeasureCategory, values: Record<string, string | null>): Promise<boolean> {
    return this.zoneFix.run((async () => {
      try {
        const date = todayLocalISO();
        await setDoc(doc(this.col(), date), { date, ...values }, { merge: true });
        return true;
      } catch {
        return false;
      }
    })());
  }

  /**
   * Salva i campi di una categoria per una data che puo' essere diversa da
   * quella originale della voce (modifica dallo storico con cambio data).
   * - Stessa data: aggiorna solo i campi di questa categoria in quella voce.
   * - Data diversa: se la voce di destinazione ha gia' valori non nulli per
   *   questa categoria, l'operazione viene bloccata ('collision') per non
   *   sovrascrivere dati esistenti. Altrimenti scrive i campi nella voce di
   *   destinazione (merge) e li rimuove da quella di origine, eliminando
   *   quest'ultima se resta priva di valori in ogni categoria.
   */
  moveCategoryEntry(
    category: MeasureCategory,
    oldDate: string,
    newDate: string,
    values: Record<string, string | null>
  ): Promise<'ok' | 'collision' | 'error'> {
    return this.zoneFix.run((async () => {
      try {
        if (oldDate === newDate) {
          await setDoc(doc(this.col(), newDate), { date: newDate, ...values }, { merge: true });
          return 'ok';
        }

        const targetSnap = await getDoc(doc(this.col(), newDate));
        if (targetSnap.exists()) {
          const targetData = targetSnap.data() as MeasurementEntry;
          const hasCollision = CATEGORY_FIELDS[category].some(f => !!targetData[f.key]);
          if (hasCollision) return 'collision';
        }

        const batch = writeBatch(this.fb.db);
        batch.set(doc(this.col(), newDate), { date: newDate, ...values }, { merge: true });

        const oldSnap = await getDoc(doc(this.col(), oldDate));
        if (oldSnap.exists()) {
          const oldData = oldSnap.data() as MeasurementEntry;
          const cleared: Partial<Record<MeasurementKey, null>> = {};
          CATEGORY_FIELDS[category].forEach(f => { cleared[f.key] = null; });
          const remaining = { ...oldData, ...cleared };
          const stillHasValues = ALL_MEASURE_FIELDS.some(f => !!remaining[f.key]);
          if (stillHasValues) {
            batch.update(doc(this.col(), oldDate), cleared as any);
          } else {
            batch.delete(doc(this.col(), oldDate));
          }
        }

        await batch.commit();
        return 'ok';
      } catch (e) {
        console.error('Errore spostamento misurazione:', e);
        return 'error';
      }
    })());
  }

  /** I valori sono digitati/salvati con la virgola italiana (es. "109,5"): parseFloat da sola tronca al primo carattere non numerico e perde il decimale. */
  parseMeasureValue(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const n = parseFloat(raw.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /** Formatta un numero calcolato (differenza, primo/ultimo valore) con la virgola italiana, coerente con come i valori grezzi sono gia' mostrati altrove. */
  formatMeasureNumber(n: number): string {
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  }
}
