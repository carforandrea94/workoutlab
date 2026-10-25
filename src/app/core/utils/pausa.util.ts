/**
 * Si riparte dopo una pausa.
 *
 * Dopo una settimana o piu' senza sedute il peso dell'ultima volta non e' piu'
 * il punto giusto da cui ripartire. Non tanto per la forza persa, che in due
 * settimane e' poca: per la mano da riprendere, e per i dolori del giorno dopo
 * che una ripresa a pieno carico si porta dietro. Allora i pesi suggeriti
 * scendono un poco, e si torna a salire dalla seduta dopo.
 *
 * Senza ricordare il buco: chi torna dopo una pausa va accolto, non contato. I
 * testi dicono "si riparte", mai quanti giorni sono passati.
 */

/** Da quanti giorni senza sedute i pesi ripartono piu' bassi. */
export const GIORNI_PAUSA = 7;
/** Da quanti, del doppio. */
export const GIORNI_PAUSA_LUNGA = 14;
export const SCONTO_PAUSA = 5;
export const SCONTO_PAUSA_LUNGA = 10;

/**
 * Insieme alla fatica per l'ordine (vedi fatica.util) lo sconto non va oltre:
 * chi riparte e oggi fa l'esercizio piu' tardi scende, ma non a un peso che non
 * riconosce piu'.
 */
export const MASSIMO_SCONTO = 15;

/** Il giorno come numero intero, senza fusi orari. Una data che non si legge da' NaN. */
function giorno(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, g) / 86_400_000);
}

/**
 * Di quanto (in percento) scendono i pesi suggeriti oggi, dalla data
 * dell'ultima seduta salvata (di qualunque giorno del programma). 0 se non ce
 * n'e' nessuna: chi comincia non riparte.
 */
export function scontoPausa(ultimaSeduta: string | null | undefined, oggi: string): number {
  if (!ultimaSeduta) return 0;
  // Con una data illeggibile i giorni sono NaN, e NaN non e' mai una pausa.
  const giorni = giorno(oggi) - giorno(ultimaSeduta);
  if (giorni >= GIORNI_PAUSA_LUNGA) return SCONTO_PAUSA_LUNGA;
  if (giorni >= GIORNI_PAUSA) return SCONTO_PAUSA;
  return 0;
}
