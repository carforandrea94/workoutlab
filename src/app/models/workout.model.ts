export interface MuscleInfo {
  color: string;
  dim: string;
}

/**
 * Serie a cluster: UNA serie spezzata in blocchi con una pausa breve dentro.
 *
 * Il numero davanti alla x resta il numero di SERIE ("4x8+8" = quattro serie
 * fatte cosi'), quindi il cluster descrive com'e' fatta una serie sola.
 *
 * Due forme, e la differenza non e' cosmetica:
 * - `fixed`: i blocchi sono scritti. "8+8" e' 8 ripetizioni, pausa, altre 8.
 * - `open`: a esaurimento. "5+30\"" e' un blocco da 5 con 30" di pausa,
 *   ripetuto finche' ne escono. Quanti siano lo decide la palestra, non il
 *   foglio: il piano non puo' saperlo e non deve fingere di saperlo.
 */
export interface ClusterSpec {
  /** Ripetizioni di ogni blocco. In `open` ce n'e' uno solo, che si ripete. */
  blocks: number[];
  /** Pausa dentro la serie, in secondi. E' un minimo, non un massimo. */
  restSec: number;
  end: 'fixed' | 'open';
}

export interface Exercise {
  name: string;
  scheme: 'wave' | 'plain';
  sets: number;
  muscle: string;
  text?: string;
  reps?: (number | string)[];
  note?: string;
  /** Solo per scheme 'wave': progressione settimanale specifica di questo esercizio. */
  weekPlan?: WeekPlan[];
  /** Assente sulle serie normali: ogni serie e' un blocco solo. */
  cluster?: ClusterSpec;
}

export interface Day {
  id: string;
  label: string;
  rec: string;
  ex: Exercise[];
}

export interface WeekPlan {
  sets: number;
  reps: number;
}

export interface ExerciseState {
  loads: (string | null)[];
  reps: (string | null)[];
  done: boolean[];
}

/** Un blocco di una serie a cluster, come e' stato davvero fatto. */
export interface PerformedBlock {
  load: string | null;
  reps: string | null;
  done: boolean;
}

export interface PerformedSetRecord {
  load: string | null;
  reps: string | null;
  done: boolean;
  /**
   * Solo sulle serie a cluster: i blocchi, uno per uno. `reps` resta il
   * riassunto leggibile ("8+8"), ma chi conta i chili o cerca un record deve
   * guardare qui: parseFloat("8+8") darebbe 8, cioe' meta' del lavoro fatto.
   */
  blocks?: PerformedBlock[];
}

export interface WorkoutSession {
  dayId: string;
  dayLabel: string;
  date: string;
  exercises: {
    name: string;
    sets: PerformedSetRecord[];
  }[];
  /** Durata della sessione in secondi. Assente nelle sedute salvate prima di
   *  questa feature: dove manca, la durata semplicemente non viene mostrata. */
  durationSec?: number;
}

/**
 * Seduta utilizzabile a partire dal documento cosi' com'e' su Firestore.
 *
 * Serve perche' un documento puo' essere incompleto — una scrittura
 * interrotta, un campo aggiunto dopo, un documento finito li' per sbaglio — e
 * chi legge non deve difendersi da ogni singolo campo. Prima non era cosi': un
 * solo documento senza `exercises` faceva esplodere la reduce che conta le
 * serie, e con lei l'INTERO storico, che mostrava "Errore nel caricamento"
 * come se non ci fosse piu' niente.
 *
 * Senza data la seduta non si puo' collocare in nessuna settimana e non si
 * puo' nemmeno mostrare: quella si scarta. Tutto il resto si ricostruisce
 * vuoto, cosi' la seduta compare comunque nell'elenco e la si puo' aprire o
 * cancellare.
 */
export function normalizeSession(raw: any): WorkoutSession | null {
  if (!raw || typeof raw.date !== 'string' || !raw.date) return null;

  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  const exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).map((ex: any) => ({
    name: typeof ex?.name === 'string' ? ex.name : '',
    sets: (Array.isArray(ex?.sets) ? ex.sets : []).map((set: any) => {
      const out: PerformedSetRecord = {
        load: text(set?.load),
        reps: text(set?.reps),
        done: !!set?.done
      };
      // I blocchi ci sono solo sulle serie a cluster, e solo da quando i
      // cluster esistono: una seduta di prima non ne ha, e va letta uguale.
      if (Array.isArray(set?.blocks) && set.blocks.length) {
        out.blocks = set.blocks.map((b: any) => ({
          load: text(b?.load), reps: text(b?.reps), done: !!b?.done
        }));
      }
      return out;
    })
  }));

  const session: WorkoutSession = {
    dayId: typeof raw.dayId === 'string' ? raw.dayId : '',
    dayLabel: typeof raw.dayLabel === 'string' ? raw.dayLabel : '',
    date: raw.date,
    exercises
  };
  // Le sedute salvate prima del cronometro non hanno la durata: il campo resta
  // assente invece di diventare uno zero che sembrerebbe una seduta lampo.
  if (typeof raw.durationSec === 'number' && raw.durationSec > 0) session.durationSec = raw.durationSec;
  return session;
}

import { RmRow } from '../core/utils/load-estimate.util';

/**
 * Il peso che corrisponde alla percentuale scelta per tutto il programma.
 *
 * `reps` sono le ripetizioni che a quella percentuale escono davvero, secondo
 * la stessa formula: una percentuale fissa e le ripetizioni scritte dal coach
 * possono contraddirsi, e questo numero e' l'unico modo per accorgersene.
 */
export interface ProgramLoad {
  percent: number;
  load: number;
  reps: number;
}

export interface ExInsight {
  lastText: string;
  /** Il massimale stimato dall'ultima sessione, gia' scritto per chi legge. */
  oneRmText: string | null;
  /** Il carico per ogni numero di ripetizioni, da 1 a 15. */
  rmRows: RmRow[] | null;
  /** Il peso alla percentuale scelta per il programma. null se la percentuale
   *  e' spenta, o se di questo esercizio non c'e' un massimale stimato. */
  programLoad: ProgramLoad | null;
}
