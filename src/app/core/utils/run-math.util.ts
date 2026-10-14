/**
 * Conti della corsa. Stanno qui, senza dipendenze da Angular, perche' sono la
 * parte che va verificata a tavolino.
 *
 * L'unita' e' il MINUTO, in ingresso e in uscita: e' cosi' che il coach
 * assegna il lavoro ed e' cosi' che il cliente lo registra. Niente distanza e
 * niente passo — erano stime travestite da misure.
 */

import { Run } from '../../models/run.model';
import { mondayISO } from './date.util';

/**
 * Minuti digitati a mano. Accetta il numero secco (`40`) e la forma con l'ora
 * (`1:20`), perche' un'ora e venti e' piu' naturale scriverla cosi' che come
 * 80. Restituisce 0 se non si capisce, cosi' chi chiama decide cosa dire.
 */
export function parseMinutes(input: string): number {
  const raw = (input ?? '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  const parts = raw.split(':');
  if (parts.some(p => p === '' || !/^\d+$/.test(p))) return 0;
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return 0;
}

/** Minuti come si leggono: `40 min` sotto l'ora, `1h 20` sopra. */
export function formatMinutes(min: number): string {
  if (!isFinite(min) || min <= 0) return '0 min';
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m.toString().padStart(2, '0')}`;
}

/** Quanto e' stato corso in una settimana. */
export interface WeekTotals {
  minutes: number;
  runs: number;
}

/**
 * Somma le uscite che cadono nella settimana di calendario indicata.
 *
 * Il filtro e' sul lunedi' della data, non su un intervallo di giorni contati
 * all'indietro da oggi: cosi' i totali si azzerano la notte fra domenica e
 * lunedi', in un istante solo e uguale per tutti, invece di scivolare di
 * giorno in giorno.
 */
export function weekTotals(runs: readonly Run[], weekMondayISO: string): WeekTotals {
  let minutes = 0, count = 0;
  for (const r of runs) {
    if (!r?.date || mondayISO(r.date) !== weekMondayISO) continue;
    count++;
    minutes += r.durationMin > 0 ? r.durationMin : 0;
  }
  return { minutes, runs: count };
}

/** Percentuale di completamento di un obiettivo, limitata a 100: la barra non deve straripare. */
export function goalPct(done: number, target: number): number {
  if (!isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, (done / target) * 100));
}
