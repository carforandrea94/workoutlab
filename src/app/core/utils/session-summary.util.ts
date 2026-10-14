import { WorkoutSession } from '../../models/workout.model';
import { sessionTonnage } from './tonnage.util';

/**
 * Il resoconto di un allenamento appena chiuso, e il confronto con l'ultima
 * volta che si era fatto LO STESSO giorno.
 *
 * Il confronto e' con lo stesso giorno e non con la seduta precedente in
 * assoluto: un Giorno 1 di petto e un Giorno 2 di gambe non hanno niente da
 * dirsi, e metterli a paragone produrrebbe numeri veri e insensati.
 */

export type RecordKind = 'carico' | 'ripetizioni';

export interface SessionRecord {
  exercise: string;
  kind: RecordKind;
  /** Il meglio di oggi, gia' scritto: "82,5 kg × 10" oppure "12 rip.". */
  now: string;
  /** Lo stesso, la volta scorsa. */
  before: string;
}

export interface SessionSummary {
  durationSec: number;
  setsDone: number;
  setsTotal: number;
  volumeKg: number;
  /** Differenza di volume con la stessa giornata precedente. null se non ce n'e' una. */
  volumeDeltaKg: number | null;
  /** Data ISO della giornata con cui ci si confronta. '' se non c'e'. */
  previousDate: string;
  records: SessionRecord[];
}

/** I valori sono testo digitato, con la virgola italiana. */
function num(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

interface Best {
  load: number;
  reps: number;
  /** true se in quell'esercizio non e' mai stato scritto un carico: a corpo
   *  libero il record sta nelle ripetizioni, non nei chili. */
  bodyweight: boolean;
}

/**
 * Il meglio fatto in un esercizio: il carico piu' alto, e a quel carico le
 * ripetizioni piu' alte.
 *
 * Contano solo le serie SPUNTATE: una serie compilata e non fatta non e' un
 * risultato, e prenderla per buona regalerebbe record mai successi.
 */
/**
 * Quello che si confronta: una serie normale, oppure un singolo BLOCCO di una
 * serie a cluster.
 *
 * Il blocco e non la serie, perche' un blocco da 8 a 62,5 kg sta accanto a
 * una serie da 8 a 62,5 kg, mentre la somma dei blocchi ("16 ripetizioni")
 * non e' mai stata sollevata tutta insieme e regalerebbe un record ogni volta
 * che il coach scrive un cluster.
 */
function doneUnits(ex: { sets?: WorkoutSession['exercises'][number]['sets'] }): { load: number; reps: number }[] {
  const out: { load: number; reps: number }[] = [];
  for (const s of ex.sets ?? []) {
    if (s?.blocks?.length) {
      for (const b of s.blocks) {
        if (b?.done) out.push({ load: num(b.load), reps: num(b.reps) });
      }
      continue;
    }
    if (s?.done) out.push({ load: num(s.load), reps: num(s.reps) });
  }
  return out;
}

function bestOf(session: WorkoutSession | null, exercise: string): Best | null {
  const ex = session?.exercises?.find(e => e.name === exercise);
  if (!ex?.sets?.length) return null;
  const done = doneUnits(ex);
  if (!done.length) return null;

  let load = 0;
  let reps = 0;
  let anyLoad = false;
  let anyReps = false;

  for (const s of done) {
    const l = s.load;
    const r = s.reps;
    if (l > 0) anyLoad = true;
    if (r > 0) anyReps = true;
    if (l > load) { load = l; reps = r; }
    else if (l === load && r > reps) { reps = r; }
  }

  if (!anyLoad && !anyReps) return null;
  return { load, reps, bodyweight: !anyLoad };
}

function label(b: Best): string {
  if (b.bodyweight) return `${fmt(b.reps)} rip.`;
  return b.reps > 0 ? `${fmt(b.load)} kg × ${fmt(b.reps)}` : `${fmt(b.load)} kg`;
}

/**
 * I record battuti rispetto alla stessa giornata precedente.
 *
 * La prima volta che si fa un esercizio non c'e' record: non si batte niente,
 * si comincia. Chiamare "record" un esordio svuoterebbe la parola al secondo
 * allenamento, quando ogni riga sarebbe un primato.
 */
function findRecords(current: WorkoutSession, previous: WorkoutSession | null): SessionRecord[] {
  const out: SessionRecord[] = [];
  if (!previous) return out;

  for (const ex of current.exercises ?? []) {
    const now = bestOf(current, ex.name);
    const before = bestOf(previous, ex.name);
    if (!now || !before) continue;

    // A corpo libero da una parte e con i pesi dall'altra non sono la stessa
    // misura: confrontarle direbbe che un numero e' cresciuto quando e'
    // semplicemente cambiato cosa si conta.
    if (now.bodyweight !== before.bodyweight) continue;

    if (!now.bodyweight && now.load > before.load) {
      out.push({ exercise: ex.name, kind: 'carico', now: label(now), before: label(before) });
    } else if (now.load === before.load && now.reps > before.reps) {
      out.push({ exercise: ex.name, kind: 'ripetizioni', now: label(now), before: label(before) });
    }
  }
  return out;
}

export function buildSessionSummary(
  current: WorkoutSession,
  previous: WorkoutSession | null
): SessionSummary {
  const rows = (current.exercises ?? []).flatMap(e => e.sets ?? []);
  const volumeKg = sessionTonnage(current);
  const prevVolume = previous ? sessionTonnage(previous) : null;

  return {
    durationSec: current.durationSec ?? 0,
    setsDone: rows.filter(s => s?.done).length,
    setsTotal: rows.length,
    volumeKg,
    // Un volume precedente a zero non e' un confronto: e' una giornata in cui
    // nessun carico era stato scritto, e il delta direbbe "+tutto".
    volumeDeltaKg: prevVolume && prevVolume > 0 ? volumeKg - prevVolume : null,
    previousDate: prevVolume && prevVolume > 0 ? (previous?.date ?? '') : '',
    records: findRecords(current, previous)
  };
}
