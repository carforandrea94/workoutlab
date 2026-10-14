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

  /** Per ogni campo, l'ultimo valore registrato nello storico (per i placeholder in form). */
  async getLastValues(): Promise<Partial<Record<MeasurementKey, string>>> {
    const history = await this.loadHistory();
    const out: Partial<Record<MeasurementKey, string>> = {};
    for (const field of ALL_MEASURE_FIELDS) {
      for (const entry of history) {
        const v = entry[field.key];
        if (v) { out[field.key] = v; break; }
      }
    }
    return out;
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

  /**
   * Genera un grafico a linea SVG per l'andamento di un campo nel tempo.
   * points: array di {date, value} gia' ordinato dal piu' vecchio al piu' recente.
   */
  buildTrendSVG(points: { date: string; value: number }[]): string {
    const w = 340, h = 180;
    const padL = 40, padR = 14, padT = 18, padB = 26;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const values = points.map(p => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;

    const coords = points.map((p, i) => ({
      x: padL + (points.length === 1 ? innerW / 2 : innerW * (i / (points.length - 1))),
      y: padT + innerH - innerH * ((p.value - min) / range)
    }));

    const linePts = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPts = `${padL.toFixed(1)},${(padT + innerH).toFixed(1)} ${linePts} ${(padL + innerW).toFixed(1)},${(padT + innerH).toFixed(1)}`;

    const dots = coords.map((c, i) => {
      const isLast = i === coords.length - 1;
      return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isLast ? 4 : 2.5}" fill="${isLast ? 'var(--accent)' : 'var(--label-2)'}" stroke="var(--bg)" stroke-width="1.5"/>`;
    }).join('');

    const gridYs = [padT, padT + innerH / 2, padT + innerH];
    const gridLabels = [max, (max + min) / 2, min];
    const grid = gridYs.map((gy, i) => `
      <line x1="${padL}" y1="${gy.toFixed(1)}" x2="${padL + innerW}" y2="${gy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <text x="${(padL - 8).toFixed(1)}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="var(--label-3)">${this.formatAxisNum(gridLabels[i])}</text>
    `).join('');

    const firstDate = this.formatShortDate(points[0].date);
    const lastDate = this.formatShortDate(points[points.length - 1].date);
    const xLabels = `
      <text x="${padL}" y="${h - 6}" text-anchor="start" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="var(--label-3)">${firstDate}</text>
      <text x="${padL + innerW}" y="${h - 6}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="var(--label-3)">${lastDate}</text>
    `;

    return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <polygon points="${areaPts}" fill="url(#trendFill)"/>
      <polyline points="${linePts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>`;
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

  private formatAxisNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  private formatShortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}
