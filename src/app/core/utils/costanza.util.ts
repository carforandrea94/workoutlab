import { mondayISO } from './date.util';
import { addDaysISO } from './week-history.util';

/**
 * Le settimane di fila con la scheda completa.
 *
 * Si contano le settimane e non i giorni: un giorno saltato non rompe niente,
 * basta recuperarlo entro domenica. E' la differenza fra una serie che si
 * spezza al primo imprevisto (e chi la vede spezzata spesso lascia) e una che
 * regge la vita vera: l'abitudine si forma anche saltando un giorno, non
 * saltandone tanti.
 *
 * Una settimana e' completa quando ogni giorno del programma e' stato fatto
 * almeno una volta (lo stesso giorno due volte conta una). Quella in corso
 * entra nel conto solo quando e' completa: fino a domenica e' ancora aperta, e
 * non spezza niente.
 *
 * Le sedute dicono solo il giorno ("d1"), non il programma, e un programma
 * nuovo riparte da "d1": senza un limite le sue prime settimane sembrerebbero
 * gia' fatte, con le settimane del programma vecchio. Col `programma` si conta
 * dal lunedi' della settimana d'inizio e le caselle sono le settimane del
 * programma, anche quelle che devono ancora venire.
 */

export interface SettimanaCostanza {
  /** Il lunedi', yyyy-mm-dd. */
  lunedi: string;
  /** I giorni del programma fatti, ognuno una volta. */
  fatti: number;
  completa: boolean;
  /** E' la settimana di oggi. */
  inCorso: boolean;
  /** Deve ancora cominciare (solo con un programma: la casella c'e' gia'). */
  futura: boolean;
}

/** Il programma attuale: da quando e per quante settimane. */
export interface ProgrammaCostanza {
  /** Un giorno qualsiasi della prima settimana, yyyy-mm-dd. */
  inizio: string;
  settimane: number;
}

export interface Costanza {
  /** Le settimane complete una dopo l'altra fino a oggi. */
  fila: number;
  /**
   * Le ultime settimane, dalla piu' vecchia: l'ultima e' quella in corso. Non
   * prima della settimana della prima seduta.
   */
  settimane: SettimanaCostanza[];
  /** I giorni del programma in una settimana. */
  previsti: number;
  /** Fatti questa settimana. */
  fatti: number;
  /** Quanti ne mancano per completare questa settimana (0: completa). */
  mancano: number;
  /** I giorni che restano da oggi a domenica, oggi compreso. */
  giorniRimasti: number;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Quante settimane si mostrano. */
export const SETTIMANE_IN_VISTA = 8;

/** Quante caselle al massimo con un programma: piu' di cosi' non stanno accanto al titolo. */
export const SETTIMANE_PROGRAMMA_IN_VISTA = 12;

/**
 * La costanza a oggi, dalle sedute salvate (giorno e data) e dal numero di
 * giorni del programma. Con un programma senza giorni non c'e' niente da
 * completare: null.
 */
export function costanza(
  sedute: readonly { dayId: string; date: string }[],
  previsti: number,
  oggi: string,
  quante = SETTIMANE_IN_VISTA,
  programma?: ProgrammaCostanza
): Costanza | null {
  if (!(previsti > 0) || !DATA.test(oggi)) return null;
  const da = programma && DATA.test(programma.inizio) && programma.settimane >= 1 ? mondayISO(programma.inizio) : '';
  const perSettimana = new Map<string, Set<string>>();
  for (const s of sedute) {
    if (!s?.dayId || !DATA.test(s?.date ?? '')) continue;
    const lunedi = mondayISO(s.date);
    if (lunedi < da) continue;
    let giorni = perSettimana.get(lunedi);
    if (!giorni) perSettimana.set(lunedi, giorni = new Set());
    giorni.add(s.dayId);
  }
  const fattiIn = (lunedi: string) => perSettimana.get(lunedi)?.size ?? 0;
  const completa = (lunedi: string) => fattiIn(lunedi) >= previsti;

  const questo = mondayISO(oggi);
  let fila = 0;
  // La settimana in corso conta solo se e' gia' completa; le altre, all'indietro,
  // finche' sono complete.
  let lunedi = completa(questo) ? questo : addDaysISO(questo, -7);
  while (completa(lunedi)) {
    fila++;
    lunedi = addDaysISO(lunedi, -7);
  }

  const settimane: SettimanaCostanza[] = [];
  const casella = (l: string): SettimanaCostanza =>
    ({ lunedi: l, fatti: fattiIn(l), completa: completa(l), inCorso: l === questo, futura: l > questo });
  if (da) {
    // Le caselle sono le settimane del programma, tutte: chi comincia ne vede
    // una in corso e le altre ancora da venire. Se sono piu' di `quante` si
    // tiene la finestra che contiene questa settimana, con due caselle davanti.
    const n = Math.floor(programma!.settimane);
    const tutte = Array.from({ length: n }, (_, k) => addDaysISO(da, 7 * k));
    const ora = tutte.indexOf(questo);
    const posizione = ora >= 0 ? ora : questo < da ? 0 : n - 1;
    const inizio = n > quante ? Math.max(0, Math.min(posizione - (quante - 3), n - quante)) : 0;
    for (const l of tutte.slice(inizio, inizio + quante)) settimane.push(casella(l));
  } else {
    // Le settimane prima della prima seduta non sono settimane mancate: chi si e'
    // iscritto da tre settimane non ne vede cinque vuote.
    let prima = questo;
    for (const l of perSettimana.keys()) if (l < prima) prima = l;
    for (let k = quante - 1; k >= 0; k--) {
      const l = addDaysISO(questo, -7 * k);
      if (l < prima) continue;
      settimane.push(casella(l));
    }
  }

  const fatti = fattiIn(questo);
  const [a, m, g] = oggi.split('-').map(Number);
  // getUTCDay: 0 la domenica. Da lunedi' (7 giorni) a domenica (1).
  const giorno = new Date(Date.UTC(a, m - 1, g)).getUTCDay();
  return {
    fila,
    settimane,
    previsti,
    fatti,
    mancano: Math.max(0, previsti - fatti),
    giorniRimasti: giorno === 0 ? 1 : 8 - giorno
  };
}
