import { WorkoutSession } from '../../models/workout.model';
import { sessionTonnage } from './tonnage.util';
import { numeroSevero, oneRepMaxOf } from './load-estimate.util';

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

/**
 * Sotto il 2,5% in piu' o in meno e' la stessa giornata: mezzo chilo su un
 * massimale di venti, una ripetizione su quaranta. Chiamarlo progresso o calo
 * vorrebbe dire leggere il rumore di un disco appoggiato storto.
 */
export const STESSA_GIORNATA = 0.025;

export type Andamento = 'su' | 'pari' | 'giu';

/** Una misura di un esercizio, oggi e la volta scorsa, nella stessa unita'. */
export interface Misura {
  oggi: number;
  /** null quando la volta scorsa non c'era niente da mettere accanto. */
  prima: number | null;
  unita: 'kg' | 'rip';
}

/** Un esercizio di oggi accanto alla volta scorsa: una riga del resoconto, un raggio della ragnatela. */
export interface ConfrontoEsercizio {
  nome: string;
  /** La serie migliore di oggi, gia' scritta: "50 kg × 5", "12 rip.". */
  oggi: string;
  /** La stessa, la volta scorsa. null se allora l'esercizio non c'era. */
  prima: string | null;
  /**
   * La forza: il massimale stimato dalla serie che ne esprime di piu'. Oltre
   * le ripetizioni da cui si stima (o a corpo libero) un massimale non c'e', e
   * la forza sono le ripetizioni della serie piu' lunga. null quando le serie
   * non sono numeri ("8 per lato").
   */
  forza: Misura | null;
  /** Il lavoro: carico per ripetizioni delle serie fatte. null a corpo libero. */
  volume: Misura | null;
  /** E' fra i record battuti (vedi findRecords). */
  record: boolean;
}

export interface SessionSummary {
  /** Data ISO della seduta. */
  date: string;
  durationSec: number;
  setsDone: number;
  setsTotal: number;
  volumeKg: number;
  /** Differenza di volume con la stessa giornata precedente. null se non ce n'e' una. */
  volumeDeltaKg: number | null;
  /** Data ISO della giornata con cui ci si confronta. '' se non c'e'. */
  previousDate: string;
  records: SessionRecord[];
  /** Gli esercizi fatti, nell'ordine della seduta, ognuno accanto alla volta scorsa. */
  esercizi: ConfrontoEsercizio[];
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
function doneUnits(
  ex: { sets?: WorkoutSession['exercises'][number]['sets'] },
  leggi: (raw: string | null | undefined) => number = num
): { load: number; reps: number }[] {
  const out: { load: number; reps: number }[] = [];
  for (const s of ex.sets ?? []) {
    if (s?.blocks?.length) {
      for (const b of s.blocks) {
        if (b?.done) out.push({ load: leggi(b.load), reps: leggi(b.reps) });
      }
      continue;
    }
    if (s?.done) out.push({ load: leggi(s.load), reps: leggi(s.reps) });
  }
  return out;
}

/** Per le formule passa solo cio' che e' tutto un numero: "62,5-55" non e' un carico. */
const severo = (raw: string | null | undefined) => numeroSevero(raw) ?? 0;

/**
 * Le serie da cui si misura la forza. Di una serie a cluster conta il PRIMO
 * blocco, come per il massimale della scheda: e' l'unico fatto a muscolo
 * fresco; dopo una pausa di venti secondi gli altri blocchi direbbero meno
 * del vero, o di piu' se il carico sale.
 */
function unitaDiForza(ex: { sets?: WorkoutSession['exercises'][number]['sets'] }): { load: number; reps: number }[] {
  const out: { load: number; reps: number }[] = [];
  for (const s of ex.sets ?? []) {
    if (s?.blocks?.length) {
      const primo = s.blocks[0];
      if (primo?.done) out.push({ load: severo(primo.load), reps: severo(primo.reps) });
      continue;
    }
    if (s?.done) out.push({ load: severo(s.load), reps: severo(s.reps) });
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

type Unita = { load: number; reps: number }[];

const massimale = (u: Unita) => oneRepMaxOf(u.filter(x => x.load > 0 && x.reps > 0))?.value ?? 0;
const ripetizioni = (u: Unita) => u.reduce((m, x) => Math.max(m, x.reps), 0);
const lavoro = (u: Unita) => u.reduce((t, x) => t + x.load * x.reps, 0);

/**
 * La forza di oggi e di allora, nella stessa unita'. Le ripetizioni si
 * confrontano solo se nemmeno allora c'era un massimale: 15 ripetizioni con 20
 * kg non sono "piu' forte" di 10 con 30, sono un'altra serie.
 */
function forzaDi(oggi: Unita, prima: Unita | null): Misura | null {
  const kgOggi = massimale(oggi);
  const kgPrima = prima ? massimale(prima) : 0;
  if (kgOggi > 0) return { oggi: kgOggi, prima: kgPrima > 0 ? kgPrima : null, unita: 'kg' };
  const ripOggi = ripetizioni(oggi);
  if (ripOggi <= 0) return null;
  const ripPrima = prima && kgPrima === 0 ? ripetizioni(prima) : 0;
  return { oggi: ripOggi, prima: ripPrima > 0 ? ripPrima : null, unita: 'rip' };
}

function volumeDi(oggi: Unita, prima: Unita | null): Misura | null {
  const kgOggi = Math.round(lavoro(oggi));
  if (kgOggi <= 0) return null;
  const kgPrima = prima ? Math.round(lavoro(prima)) : 0;
  return { oggi: kgOggi, prima: kgPrima > 0 ? kgPrima : null, unita: 'kg' };
}

/** Di quanto e' cambiata una misura, come frazione (+0,13 = +13%). null se non c'e' confronto. */
export function variazione(m: Misura | null | undefined): number | null {
  if (!m || m.prima === null || m.prima <= 0) return null;
  return m.oggi / m.prima - 1;
}

/** Meglio, uguale o peggio della volta scorsa; null se non c'e' confronto. */
export function andamento(m: Misura | null | undefined): Andamento | null {
  const esatta = variazione(m);
  if (esatta === null) return null;
  // Al centesimo di punto: 97,5 / 100 - 1 in virgola mobile e' -0,0250000000000001.
  const v = Math.round(esatta * 1e4) / 1e4;
  return v > STESSA_GIORNATA ? 'su' : v < -STESSA_GIORNATA ? 'giu' : 'pari';
}

function confronti(current: WorkoutSession, previous: WorkoutSession | null, records: SessionRecord[]): ConfrontoEsercizio[] {
  const out: ConfrontoEsercizio[] = [];
  for (const ex of current.exercises ?? []) {
    const migliore = bestOf(current, ex.name);
    if (!migliore) continue;
    const exPrima = previous?.exercises?.find(e => e.name === ex.name);
    const primaMigliore = bestOf(previous, ex.name);
    // La forza passa dalle formule e vuole numeri veri; il volume si conta
    // come il totale della seduta (sessionTonnage), cosi' le righe tornano.
    const comeUnita = (u: Unita) => (u.length ? u : null);
    out.push({
      nome: ex.name,
      oggi: label(migliore),
      prima: primaMigliore ? label(primaMigliore) : null,
      forza: forzaDi(unitaDiForza(ex), exPrima ? comeUnita(unitaDiForza(exPrima)) : null),
      volume: volumeDi(doneUnits(ex), exPrima ? comeUnita(doneUnits(exPrima)) : null),
      record: records.some(r => r.exercise === ex.name)
    });
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

  const records = findRecords(current, previous);

  return {
    date: current.date ?? '',
    durationSec: current.durationSec ?? 0,
    setsDone: rows.filter(s => s?.done).length,
    setsTotal: rows.length,
    volumeKg,
    // Un volume precedente a zero non e' un confronto: e' una giornata in cui
    // nessun carico era stato scritto, e il delta direbbe "+tutto".
    volumeDeltaKg: prevVolume && prevVolume > 0 ? volumeKg - prevVolume : null,
    previousDate: prevVolume && prevVolume > 0 ? (previous?.date ?? '') : '',
    records,
    esercizi: confronti(current, previous, records)
  };
}
