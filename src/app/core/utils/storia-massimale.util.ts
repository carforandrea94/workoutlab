import { PerformedSet, oneRepMaxOf } from './load-estimate.util';
import { PuntoMisura, dataBreve, dataLunga, numeroIt, uguale, variazioneIt } from './grafico-andamento.util';

/**
 * Il massimale stimato nel tempo, nel foglio del carico.
 *
 * Il foglio diceva il massimale di oggi e quanto era cambiato dalla volta
 * prima: una differenza fra due sedute, che una serie storta basta a girare.
 * Le ultime sedute in fila dicono se si sta salendo davvero. Ogni punto e' il
 * massimale di una seduta, stimato come quello in testa al foglio (dalla serie
 * migliore di quella volta).
 */

/** Quante sedute si guardano: abbastanza per una tendenza, poche per stare in un foglio. */
export const SEDUTE_STORIA = 10;
/** Sotto questi punti una linea non dice niente che la riga del foglio non dica gia'. */
export const PUNTI_STORIA = 3;

/** Le ultime sedute con un massimale stimato, dalla piu' vecchia. Le sedute arrivano dalla piu' vecchia. */
export function storiaDelMassimale(sedute: readonly { data: string; sets: PerformedSet[] }[]): PuntoMisura[] {
  const punti: PuntoMisura[] = [];
  for (const s of sedute) {
    const stima = oneRepMaxOf(s.sets);
    if (stima && /^\d{4}-\d{2}-\d{2}$/.test(s.data)) punti.push({ date: s.data, value: stima.value });
  }
  return punti.slice(-SEDUTE_STORIA);
}

export interface TestiStoria {
  /** "Nelle ultime 10 sedute". */
  quante: string;
  /** "+5,4 kg dal 24 ago", o "uguale al 24 ago". */
  cambio: string;
  /** Per lo screen reader, al posto del disegno. */
  descrizione: string;
}

/** Le scritte intorno alla linea; null se i punti non bastano per disegnarla. */
export function testiStoria(storia: readonly PuntoMisura[]): TestiStoria | null {
  if (storia.length < PUNTI_STORIA) return null;
  const primo = storia[0];
  const ultimo = storia[storia.length - 1];
  const conAnno = primo.date.slice(0, 4) !== ultimo.date.slice(0, 4);
  const dal = dataBreve(primo.date, conAnno);
  const diff = ultimo.value - primo.value;
  return {
    quante: `Nelle ultime ${storia.length} sedute`,
    cambio: uguale(diff) ? `uguale al ${dal}` : `${variazioneIt(diff)} kg dal ${dal}`,
    descrizione: `Massimale stimato nelle ultime ${storia.length} sedute: `
      + `da ${numeroIt(primo.value)} kg il ${dataLunga(primo.date)} a ${numeroIt(ultimo.value)} kg il ${dataLunga(ultimo.date)}`
  };
}
