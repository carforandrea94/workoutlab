import { Run } from '../../models/run.model';
import { mondayISO } from './date.util';

/**
 * Lo storico della corsa raccolto per settimana.
 *
 * Prima era un'uscita per riga, dalla piu' recente e senza fine: dopo tre mesi
 * erano quaranta righe uguali, senza totali e senza un modo di vedere se si
 * stesse correndo di piu' o di meno. Una riga per settimana fa lo stesso
 * lavoro in un terzo dello spazio, e ogni riga dice una cosa che prima non
 * c'era — quanto hai corso in quella settimana.
 */

export interface WeekRun {
  id: string;
  run: Run;
}

export interface WeekGroup {
  /** Lunedi' della settimana, ISO: e' anche la sua chiave. */
  mondayISO: string;
  /** Domenica della stessa settimana: la data da cui parte una nuova uscita
   *  registrata dentro una settimana passata. */
  sundayISO: string;
  /** "22 – 28 set", oppure "29 set – 5 ott" quando la settimana cambia mese. */
  label: string;
  minutes: number;
  /** Le uscite della settimana, dalla piu' recente. */
  runs: WeekRun[];
  isCurrent: boolean;
}

export interface WeekHistory {
  weeks: WeekGroup[];
  /** Settimane rimaste fuori dal taglio: zero se si vede tutto. */
  hidden: number;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Somma (o sottrae) giorni a una data ISO restando in ISO. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * L'intervallo della settimana come si legge. Il mese si ripete solo quando
 * la settimana lo attraversa: "22 – 28 set" dice gia' tutto, "22 set – 28 set"
 * ripeterebbe una parola per niente.
 */
export function weekRangeLabel(monday: string): string {
  const a = new Date(monday + 'T00:00:00');
  const b = new Date(addDaysISO(monday, 6) + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '';
  const left = a.getMonth() === b.getMonth()
    ? `${a.getDate()}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/**
 * Le settimane, dalla piu' recente alla prima in cui c'e' un'uscita.
 *
 * Le settimane VUOTE in mezzo restano nell'elenco: una pausa di tre settimane
 * e' un'informazione, e saltarla farebbe sembrare che non ci si sia mai
 * fermati. Le settimane prima della primissima uscita invece no: quelle non
 * sono una pausa, sono il tempo in cui l'app non c'era.
 *
 * `maxWeeks` taglia le piu' vecchie: senza un tetto, dopo un anno il
 * raggruppamento avrebbe cinquantadue righe e il problema che risolve
 * tornerebbe con un'altra faccia.
 */
export function buildWeekHistory(
  rows: readonly WeekRun[],
  todayISO: string,
  maxWeeks: number
): WeekHistory {
  const current = mondayISO(todayISO);
  const byWeek = new Map<string, WeekRun[]>();

  for (const row of rows) {
    const date = row?.run?.date;
    if (!date) continue;
    const key = mondayISO(date);
    const list = byWeek.get(key);
    if (list) list.push(row); else byWeek.set(key, [row]);
  }

  const keys = [...byWeek.keys()].sort();
  const oldest = keys.length ? keys[0] : current;
  // Un'uscita datata nel futuro non deve restare invisibile: si parte dalla
  // piu' avanti fra lei e oggi.
  const newest = keys.length && keys[keys.length - 1] > current ? keys[keys.length - 1] : current;

  const all: string[] = [];
  for (let m = newest; m >= oldest; m = addDaysISO(m, -7)) all.push(m);

  const shown = maxWeeks > 0 ? all.slice(0, maxWeeks) : all;

  const weeks = shown.map(monday => {
    const runs = (byWeek.get(monday) ?? [])
      .slice()
      .sort((a, b) => b.run.date.localeCompare(a.run.date));
    return {
      mondayISO: monday,
      sundayISO: addDaysISO(monday, 6),
      label: weekRangeLabel(monday),
      minutes: runs.reduce((tot, r) => tot + (r.run.durationMin > 0 ? r.run.durationMin : 0), 0),
      runs,
      isCurrent: monday === current
    };
  });

  return { weeks, hidden: all.length - shown.length };
}
