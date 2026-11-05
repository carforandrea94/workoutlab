import { Day, WeekPlan } from '../../models/workout.model';
import { SERIE_MAX } from './esercizio.util';

/**
 * La progressione settimanale: serie e ripetizioni di ogni settimana di un
 * programma a onda ("wave").
 *
 * Il programma ha la sua, scritta una volta sola (workout.weekPlan): e' quella
 * che la Scheda mostra in alto ("Settimana 3 di 8 · 4x8 rip.") e quella che
 * seguono gli esercizi a onda. Un esercizio ne ha una sua solo se se ne
 * distingue: una copia identica a quella del programma e' la stessa
 * informazione scritta due volte, e il giorno che il coach cambia il programma
 * l'esercizio resterebbe indietro.
 */

export const SETTIMANE_MIN = 1;
export const SETTIMANE_MAX = 52;

const SERIE_DI_PARTENZA = 4;
const RIPETIZIONI_DI_PARTENZA = 10;

const testo = (v: unknown) => String(v ?? '').trim();

/** Una settimana come si legge: "4×10", "3×6-8". */
function settimana(w: WeekPlan): string {
  return `${testo(w.sets)}×${testo(w.reps)}`;
}

/** Dicono la stessa cosa: 4 e "4" sono lo stesso numero, e gli spazi non contano. */
export function stessaProgressione(a: readonly WeekPlan[] | undefined, b: readonly WeekPlan[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((w, i) => testo(w.sets) === testo(b[i].sets) && testo(w.reps) === testo(b[i].reps));
}

/** "8 settimane · 4×10" se sono tutte uguali, "8 settimane · 4×10 → 3×8" se cambiano. */
export function riepilogoProgressione(plan: readonly WeekPlan[] | undefined): string {
  const n = plan?.length ?? 0;
  if (!plan || n === 0) return 'Nessuna settimana';
  const quante = n === 1 ? '1 settimana' : `${n} settimane`;
  const prima = settimana(plan[0]);
  if (plan.every(w => settimana(w) === prima)) return `${quante} · ${prima}`;
  return `${quante} · ${prima} → ${settimana(plan[n - 1])}`;
}

/** La settimana in piu' a fine elenco: come l'ultima, che e' quasi sempre quello che si vuole. */
export function settimanaInPiu(plan: readonly WeekPlan[] | undefined): WeekPlan {
  const ultima = plan?.[plan.length - 1];
  return ultima ? { sets: ultima.sets, reps: ultima.reps } : { sets: SERIE_DI_PARTENZA, reps: RIPETIZIONI_DI_PARTENZA };
}

/**
 * Valori che si possono salvare: le serie sono un intero da 1 al tetto, le
 * ripetizioni un numero o un testo come "6-8" (se ne manca una, quella della
 * settimana prima), e le settimane non sono piu' di un anno.
 */
export function ripulisciProgressione(plan: readonly WeekPlan[] | undefined): WeekPlan[] {
  const fuori: WeekPlan[] = [];
  for (const w of (plan ?? []).slice(0, SETTIMANE_MAX)) {
    // Vuoto non e' zero: Number('') e Number(null) valgono 0, ma un campo lasciato in bianco
    // vuol dire "come la settimana prima".
    const grezze = testo(w?.sets);
    const sets = grezze === '' ? NaN : Math.floor(Number(grezze));
    const rip = testo(w?.reps);
    fuori.push({
      sets: isFinite(sets) ? Math.min(SERIE_MAX, Math.max(1, sets)) : (fuori[fuori.length - 1]?.sets ?? SERIE_DI_PARTENZA),
      // Un numero resta un numero, come arriva dall'import; "6-8" resta un testo.
      reps: rip === '' ? (fuori[fuori.length - 1]?.reps ?? RIPETIZIONI_DI_PARTENZA) : /^\d+$/.test(rip) ? Number(rip) : rip
    });
  }
  return fuori;
}

/**
 * Toglie, da ogni esercizio a onda, la progressione che e' una copia di quella
 * del programma: da li' in poi l'esercizio la segue. Quelle diverse restano.
 * Torna quante ne ha tolte.
 */
export function senzaCopieDelProgramma(days: readonly Day[], programma: readonly WeekPlan[] | undefined): number {
  let tolte = 0;
  for (const d of days) {
    for (const ex of d.ex) {
      if (ex.scheme !== 'wave' || !ex.weekPlan) continue;
      if (ex.weekPlan.length === 0 || stessaProgressione(ex.weekPlan, programma)) {
        delete ex.weekPlan;
        tolte++;
      }
    }
  }
  return tolte;
}
