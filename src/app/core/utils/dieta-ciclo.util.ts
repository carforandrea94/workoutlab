import { giorniTra } from './date.util';

/**
 * Come si seguono i piani della dieta.
 *
 * - ON/OFF: i piani sono alternative (Giorno ON, Giorno OFF, Rifeed...) e il
 *   giorno lo sceglie chi mangia, di solito in base all'allenamento. L'app non
 *   ne indica nessuno.
 * - Ciclica: i piani sono una sequenza (Giorno 1, Giorno 2, Giorno 3...) che
 *   va col calendario dal primo giorno del ciclo: ogni giorno il piano dopo, e
 *   dopo l'ultimo si riparte dal primo, che si segnino i pasti o no.
 *
 * Il tipo e il primo giorno si scelgono nel builder. Un protocollo senza tipo
 * (tutti quelli creati prima) e' ON/OFF, cioe' come prima.
 */
export type TipoDieta = 'onoff' | 'ciclica';

export interface CicloDieta {
  tipo: TipoDieta;
  /** yyyy-mm-dd, il giorno del primo piano; solo per la ciclica. */
  inizio: string | null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Il tipo letto dal protocollo: quello che non si capisce e' ON/OFF. */
export function normalizzaCiclo(tipo: unknown, inizio: unknown): CicloDieta {
  if (tipo !== 'ciclica') return { tipo: 'onoff', inizio: null };
  return { tipo: 'ciclica', inizio: typeof inizio === 'string' && DATA.test(inizio) ? inizio : null };
}

/** Dove si e' nel ciclo oggi. */
export type PosizioneCiclo =
  /** Il piano di oggi (0 = il primo) e quello di domani. */
  | { stato: 'oggi'; indice: number; domani: number }
  /** Il ciclo comincia piu' avanti: fino ad allora nessun piano e' "di oggi". */
  | { stato: 'non-iniziato'; inizio: string };

/**
 * Il piano di oggi in una dieta ciclica di `quanti` piani. Null per ON/OFF,
 * senza piani o senza un primo giorno valido: li' l'app non ne indica nessuno.
 */
export function posizioneNelCiclo(ciclo: CicloDieta, quanti: number, oggi: string): PosizioneCiclo | null {
  if (ciclo.tipo !== 'ciclica' || !ciclo.inizio || quanti < 1 || !DATA.test(oggi)) return null;
  const giorni = giorniTra(ciclo.inizio, oggi);
  if (giorni < 0) return { stato: 'non-iniziato', inizio: ciclo.inizio };
  const indice = giorni % quanti;
  return { stato: 'oggi', indice, domani: (indice + 1) % quanti };
}
