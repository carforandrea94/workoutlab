/** Tipo di uscita: e' il vocabolario che un coach usa gia' a voce. */
export type RunType = 'lento' | 'medio' | 'ripetute';

/** Come e' andata, dal punto di vista di chi corre. */
export type RunEffort = 'facile' | 'giusta' | 'dura';

/**
 * Un'uscita di corsa. Si registra il TEMPO e basta: e' cosi' che il coach
 * assegna il lavoro ("40 minuti sul tappeto") ed e' l'unico numero che il
 * cliente conosce con certezza appena sceso. La distanza, su un tappeto o a
 * sensazione, e' una stima — e il passo che se ne ricava eredita quella stima
 * senza dichiararla.
 */
export interface Run {
  /** ISO yyyy-mm-dd, giorno dell'uscita. */
  date: string;
  /** Minuti corsi. E' il dato della seduta. */
  durationMin: number;
  type: RunType;
  effort: RunEffort;
  note?: string;
}

/**
 * Uscita utilizzabile a partire dal documento cosi' com'e' su Firestore.
 *
 * Le uscite salvate prima tenevano il tempo in secondi (`durationSec`) e la
 * distanza in chilometri: i secondi si riportano a minuti senza perdere niente,
 * la distanza invece non viene piu' letta. Restare su Firestore non le fa
 * male — semplicemente non descrivono piu' la seduta.
 */
export function normalizeRun(raw: any): Run | null {
  if (!raw || typeof raw.date !== 'string' || !raw.date) return null;
  const min = typeof raw.durationMin === 'number' && raw.durationMin > 0
    ? Math.round(raw.durationMin)
    : (typeof raw.durationSec === 'number' && raw.durationSec > 0 ? Math.round(raw.durationSec / 60) : 0);
  return {
    date: raw.date,
    durationMin: min,
    type: raw.type === 'medio' || raw.type === 'ripetute' ? raw.type : 'lento',
    effort: raw.effort === 'facile' || raw.effort === 'dura' ? raw.effort : 'giusta',
    note: typeof raw.note === 'string' && raw.note ? raw.note : undefined
  };
}

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  lento: 'Lento',
  medio: 'Medio',
  ripetute: 'Ripetute'
};

export const RUN_EFFORT_LABELS: Record<RunEffort, string> = {
  facile: 'Facile',
  giusta: 'Giusta',
  dura: 'Dura'
};

/**
 * Obiettivo settimanale di corsa deciso dal coach. Vive nel protocollo, come
 * la scheda e la dieta: e' il coach a stabilirlo e il cliente lo trova gia'
 * impostato, senza doverlo copiare a mano.
 *
 * Entrambi i campi sono facoltativi nel senso che 0 significa "non impostato":
 * un coach puo' dare solo i minuti, solo il numero di uscite, o entrambi.
 */
export interface RunGoal {
  /**
   * Minuti da correre in una settimana. 0 = nessun obiettivo di tempo.
   *
   * L'obiettivo e' il TEMPO e non la distanza perche' e' cosi' che un coach
   * prescrive il lavoro aerobico ("40 minuti sul tappeto"): il minutaggio non
   * dipende da quanto sei veloce, i chilometri si'.
   */
  weeklyMinutes: number;
  /** Numero di uscite in una settimana. 0 = nessun obiettivo di frequenza. */
  weeklyRuns: number;
  /** Indicazione libera del coach ("una lunga la domenica", "ripetute il martedi'"). */
  note?: string;
}

export function emptyRunGoal(): RunGoal {
  return { weeklyMinutes: 0, weeklyRuns: 0, note: '' };
}

/**
 * Obiettivo utilizzabile a partire da quello che c'e' davvero sul documento.
 *
 * Serve perche' un protocollo puo' essere stato salvato quando l'obiettivo era
 * in chilometri (campo `weeklyKm`). I chilometri non si convertono in minuti
 * senza inventare un passo, e inventarlo vorrebbe dire assegnare al cliente un
 * carico che il coach non ha mai deciso: il vecchio valore non viene tradotto,
 * l'obiettivo di tempo riparte da zero e il coach lo reimposta. Il numero di
 * uscite, che non e' cambiato, si conserva.
 */
export function normalizeRunGoal(raw: Partial<RunGoal> | null | undefined): RunGoal {
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  return {
    weeklyMinutes: num(raw?.weeklyMinutes),
    weeklyRuns: num(raw?.weeklyRuns),
    note: typeof raw?.note === 'string' ? raw.note : ''
  };
}

/** true se il coach ha davvero impostato qualcosa: senza, la sezione non mostra obiettivi. */
export function hasRunGoal(goal: RunGoal | null | undefined): boolean {
  return !!goal && (goal.weeklyMinutes > 0 || goal.weeklyRuns > 0);
}
