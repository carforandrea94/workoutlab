import { Exercise, WeekPlan } from '../../models/workout.model';
import { GRUPPI_MUSCOLARI } from './muscolo.util';

/**
 * Serie e ripetizioni di un esercizio, senza dire due volte la stessa cosa.
 *
 * Il numero di serie e' gia' la lunghezza dell'elenco delle ripetizioni: un
 * campo "Serie" e uno "Ripetizioni" separati erano due modi di scrivere un'unica
 * informazione, tenuti allineati a mano. Qui il caso comune (tutte le serie con
 * le stesse ripetizioni) e' un numero solo, e le ripetizioni diverse per serie
 * (12-10-8) sono l'eccezione che si apre quando serve.
 */

export const SERIE_PREDEFINITE = 3;
export const RIPETIZIONI_PREDEFINITE = 10;
/** Un tetto ragionevole: oltre non e' una scheda, e' un refuso. */
export const SERIE_MAX = 20;
export const RIPETIZIONI_MAX = 100;

const testo = (v: unknown) => String(v ?? '').trim();

/** Tutte le serie hanno le stesse ripetizioni (o non ce n'e' ancora nessuna): una cosa sola da dire. */
export function ripetizioniUguali(reps: readonly (number | string)[] | undefined): boolean {
  if (!reps?.length) return true;
  const primo = testo(reps[0]);
  return reps.every(r => testo(r) === primo);
}

/** Le ripetizioni della prima serie: quelle di tutte, quando sono uguali. */
export function ripetizioniComuni(reps: readonly (number | string)[] | undefined): string {
  return testo(reps?.[0]);
}

/** Il numero di serie come lo si puo' scrivere: da 1 al tetto, e un valore illeggibile vale 1. */
function serieValide(valore: unknown): number {
  const n = Math.floor(Number(valore));
  return isFinite(n) ? Math.min(SERIE_MAX, Math.max(1, n)) : 1;
}

/**
 * Cambia il numero di serie tenendo le ripetizioni coerenti: uguali restano
 * uguali per tutte, diverse tengono quelle che ci sono e copiano l'ultima nelle
 * nuove.
 */
export function impostaSerie(ex: Exercise, valore: unknown): void {
  const n = serieValide(valore);
  const vecchie = ex.reps ?? [];
  const uguali = ripetizioniUguali(vecchie);
  const comune = ripetizioniComuni(vecchie);
  ex.sets = n;
  ex.reps = Array.from({ length: n }, (_, i) =>
    uguali ? comune : (i < vecchie.length ? vecchie[i] : vecchie[vecchie.length - 1] ?? ''));
}

/** Le stesse ripetizioni per tutte le serie. */
export function impostaRipetizioniUguali(ex: Exercise, valore: number | string): void {
  ex.reps = Array.from({ length: serieValide(ex.sets), }, () => valore);
}

/**
 * Un passo avanti o indietro sulle ripetizioni. Con un valore che non e' un
 * intero (un intervallo come "8-10") non c'e' un passo da fare: null, e il
 * campo resta com'e'.
 */
export function passoRipetizioni(corrente: number | string | undefined, delta: number): string | null {
  const t = testo(corrente);
  if (t === '') return String(Math.min(RIPETIZIONI_MAX, Math.max(1, RIPETIZIONI_PREDEFINITE + delta)));
  if (!/^\d+$/.test(t)) return null;
  return String(Math.min(RIPETIZIONI_MAX, Math.max(1, Number(t) + delta)));
}

/**
 * L'esercizio che si aggiunge, gia' mezzo scritto: ha le serie, le ripetizioni
 * e il gruppo muscolare di quello che lo precede nel giorno, perche' in un
 * giorno gli esercizi si assomigliano. Il nome e la nota restano vuoti.
 */
export function nuovoEsercizio(precedente?: Exercise): Exercise {
  const ex: Exercise = {
    name: '',
    scheme: 'plain',
    sets: SERIE_PREDEFINITE,
    muscle: precedente?.muscle || GRUPPI_MUSCOLARI[0],
    reps: Array.from({ length: SERIE_PREDEFINITE }, () => String(RIPETIZIONI_PREDEFINITE))
  };
  if (!precedente) return ex;
  if (precedente.scheme === 'wave') {
    ex.scheme = 'wave';
    ex.weekPlan = (precedente.weekPlan ?? []).map(w => ({ ...w }));
  }
  // Un cluster non si porta dietro: e' l'eccezione, non quello che viene dopo.
  if (!precedente.cluster) {
    const reps = (precedente.reps ?? []).filter(r => testo(r) !== '');
    if (precedente.sets >= 1 && reps.length) {
      ex.sets = precedente.sets;
      ex.reps = Array.from({ length: precedente.sets }, (_, i) => reps[Math.min(i, reps.length - 1)]);
    }
  }
  return ex;
}

/**
 * Le settimane di un esercizio a onda: quelle del programma, se ci sono, e solo
 * se no un'onda di partenza. Cosi' chi passa a "Wave" non ritrova una
 * progressione inventata li' per li' accanto a quella che il programma ha gia'.
 */
export function settimaneDaProgramma(programma: readonly WeekPlan[] | undefined): WeekPlan[] {
  return programma?.length
    ? programma.map(w => ({ ...w }))
    : Array.from({ length: 8 }, () => ({ sets: 4, reps: 10 }));
}

/** La riga dell'esercizio nell'elenco: "3×12" se le serie sono uguali, "3×12-10-8" se no. */
export function riepilogoSerie(ex: Exercise): string {
  const reps = ex.reps ?? [];
  if (ripetizioniUguali(reps)) return `${ex.sets}×${ripetizioniComuni(reps) || '?'}`;
  return `${ex.sets}×${reps.map(testo).join('-')}`;
}
