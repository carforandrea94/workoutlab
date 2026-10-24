/**
 * La fatica che viene dall'ordine degli esercizi.
 *
 * Il massimale di un esercizio si stima dalla sua ultima seduta dello stesso
 * giorno, fatta nella stessa posizione: se le croci vengono dopo la panca, il
 * loro massimale e' gia' quello "con la panca nelle braccia". Togliere ancora
 * qualcosa conterebbe la fatica due volte.
 *
 * Conta invece quando l'ordine cambia: se oggi prima di questo esercizio ci
 * sono piu' esercizi dello stesso gruppo di quanti ce n'erano quella volta
 * (lo si e' spostato con "Riordina", o il giorno e' cambiato), si arriva piu'
 * stanchi di come si era quando la stima e' nata. Allora i pesi suggeriti
 * scendono: il 5% per ogni esercizio in piu' davanti, fino al 10%. Non salgono
 * mai: un esercizio portato piu' avanti ha un massimale stimato da stanco,
 * cioe' prudente, e il peso dell'ultima volta resta comunque alla portata.
 */

/** Quanto scende il peso per ogni esercizio dello stesso gruppo in piu' davanti. */
export const PASSO_FATICA = 5;
/** Oltre non si scende: piu' in la' e' un altro allenamento, non una correzione. */
export const MASSIMO_FATICA = 10;

/** Quanti esercizi dello stesso gruppo vengono prima di quello in posizione `indice`. */
export function primaDelloStessoGruppo(gruppi: readonly (string | null | undefined)[], indice: number): number {
  const mio = gruppi[indice];
  if (!mio) return 0;
  let n = 0;
  for (let i = 0; i < indice && i < gruppi.length; i++) if (gruppi[i] === mio) n++;
  return n;
}

/**
 * Di quanto (in percento) scendono i pesi suggeriti: 0 se oggi davanti ci sono
 * tanti esercizi dello stesso gruppo quanti allora, o meno.
 */
export function scontoFatica(oggi: number, allora: number): number {
  const inPiu = oggi - allora;
  if (!isFinite(inPiu) || inPiu <= 0) return 0;
  return Math.min(MASSIMO_FATICA, inPiu * PASSO_FATICA);
}

/** Il peso scontato, al mezzo chilo come gli altri carichi suggeriti. */
export function conSconto(kg: number, percento: number): number {
  if (!percento) return kg;
  return Math.round(kg * (100 - percento) / 100 * 2) / 2;
}
