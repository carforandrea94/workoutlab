import { WorkoutSession } from '../../models/workout.model';

/**
 * Tonnellaggio: i chili davvero sollevati, carico per ripetizioni.
 *
 * Contano solo le serie SPUNTATE. Una serie prevista e non fatta non e'
 * volume, e sommarla direbbe che hai sollevato un peso che non hai toccato.
 *
 * Carichi e ripetizioni sono salvati come testo, cosi' come li digita chi si
 * allena: "80", "80,5", a volte con l'unita' attaccata. parseFloat da sola si
 * ferma al primo carattere non numerico e perde il decimale dopo la virgola.
 */
function num(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

/** I chili di una singola seduta. */
export function sessionTonnage(session: WorkoutSession | null | undefined): number {
  if (!session?.exercises) return 0;
  let kg = 0;
  for (const ex of session.exercises) {
    for (const set of ex.sets ?? []) {
      // Una serie a cluster va contata blocco per blocco: il suo `reps` e' il
      // riassunto ("8+8") e parseFloat ne leggerebbe 8, cioe' meta' del
      // lavoro. I blocchi hanno una spunta ciascuno, e un blocco non fatto
      // non e' volume nemmeno dentro una serie chiusa.
      if (set?.blocks?.length) {
        for (const b of set.blocks) {
          if (b?.done) kg += num(b.load) * num(b.reps);
        }
        continue;
      }
      if (!set?.done) continue;
      kg += num(set.load) * num(set.reps);
    }
  }
  return Math.round(kg);
}

export interface DayTonnage {
  dayId: string;
  label: string;
  /** null se quel giorno non e' mai stato allenato. */
  kg: number | null;
  /** Data della seduta da cui viene il numero, ISO. '' se non c'e'. */
  date: string;
}

export interface RotationTonnage {
  days: DayTonnage[];
  /** Somma dei giorni allenati. */
  totalKg: number;
  /** Quanti giorni del programma non hanno ancora una seduta. */
  missing: number;
}

/**
 * Il tonnellaggio di UN GIRO COMPLETO del programma: ogni giorno conta la sua
 * ultima seduta, e il totale e' la loro somma.
 *
 * E' diverso da un totale cumulativo, che cresce e basta e dopo un mese non
 * dice piu' niente. Questo si muove a ogni salvataggio — rifai il Giorno 1 e
 * cambia la sua riga — senza mai contare due volte lo stesso giorno, quindi
 * confrontare due giri e' confrontare due carichi di lavoro equivalenti.
 *
 * L'ordine e' quello del programma, non quello delle date: un giro si legge
 * come la scheda, dal Giorno 1 in poi.
 */
export function rotationTonnage(
  sessions: readonly { session: WorkoutSession }[],
  days: readonly { id: string; label: string }[]
): RotationTonnage {
  const latest = new Map<string, WorkoutSession>();
  for (const { session } of sessions) {
    if (!session?.dayId || !session?.date) continue;
    const prev = latest.get(session.dayId);
    if (!prev || session.date > prev.date) latest.set(session.dayId, session);
  }

  const out: DayTonnage[] = days.map(d => {
    const s = latest.get(d.id);
    return {
      dayId: d.id,
      label: d.label,
      kg: s ? sessionTonnage(s) : null,
      date: s?.date ?? ''
    };
  });

  return {
    days: out,
    totalKg: out.reduce((acc, d) => acc + (d.kg ?? 0), 0),
    missing: out.filter(d => d.kg === null).length
  };
}

/** I chili come li si scrive in italiano: 38.500, non 38500. */
export function formatKg(kg: number): string {
  return Math.round(kg).toLocaleString('it-IT');
}
