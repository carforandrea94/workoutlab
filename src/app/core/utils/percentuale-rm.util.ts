import { PerformedSet, numeroSevero, oneRepMaxOf } from './load-estimate.util';
import { BlockRow, SerieRow } from './extra-sets.util';

/**
 * La percentuale del massimale sulla card dell'esercizio, che segue le serie.
 *
 * Il massimale del foglio viene dall'ultima volta ed e' fermo: dice dov'eri.
 * Durante l'allenamento conta anche dove sei oggi. Il massimale di
 * riferimento e' il piu' alto fra quello dell'ultima volta e quello che le
 * serie gia' fatte oggi stimano (stessa formula, stesse serie attendibili):
 * una serie che lo supera lo alza, una piu' leggera non lo abbassa mai, perche'
 * un esercizio finito male non fa diventare piu' debole di com'eri.
 *
 * La percentuale e' quella del foglio: il peso diviso il massimale.
 */

/** Il massimale di oggi, e quando viene da oggi, la serie da cui nasce. */
export interface MassimaleDiOggi {
  value: number;
  /** La serie di oggi che ha superato quello dell'ultima volta; null: vale quello di prima. */
  daOggi: PerformedSet | null;
}

/** Ripetizioni intere e positive scritte nel campo, o null: "8+8" di un cluster non e' un numero. */
function ripetizioniScritte(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 ? n : null;
}

/** Il pezzo di una serie (o di un blocco) come coppia peso/ripetizioni, se e' un'osservazione vera. */
function coppia(p: Pick<BlockRow, 'load' | 'loadPlaceholder' | 'reps' | 'ripPlaceholder'>): PerformedSet | null {
  const load = numeroSevero(p.load || p.loadPlaceholder);
  const reps = ripetizioniScritte(p.reps || p.ripPlaceholder);
  return load !== null && reps !== null ? { load, reps } : null;
}

/**
 * Le serie fatte, come osservazioni per la stima: una per serie, e su un
 * cluster quella del primo blocco (il peso e' della serie e lo decide lui; i
 * blocchi dopo vengono dopo una pausa breve e non dicono la stessa cosa).
 */
export function serieFatteOggi(rows: readonly SerieRow[]): PerformedSet[] {
  const fatte: PerformedSet[] = [];
  for (const r of rows) {
    const pezzo = r.blocks?.length ? r.blocks.find(b => b.done) : r.done ? r : undefined;
    const c = pezzo ? coppia(pezzo) : null;
    if (c) fatte.push(c);
  }
  return fatte;
}

/**
 * Il massimale da cui leggere le percentuali: il piu' alto fra quello
 * dell'ultima volta e quello delle serie fatte oggi. null quando non c'e'
 * nessuno dei due.
 */
export function massimaleDiOggi(precedente: number | null | undefined, rows: readonly SerieRow[]): MassimaleDiOggi | null {
  const prima = precedente && precedente > 0 ? precedente : 0;
  const oggi = oneRepMaxOf(serieFatteOggi(rows));
  if (oggi && oggi.value > prima) return { value: oggi.value, daOggi: oggi.from };
  return prima > 0 ? { value: prima, daOggi: null } : null;
}

/** Il peso della serie come numero: quello scritto, o quello suggerito; su un cluster, del primo blocco. */
export function pesoDellaSerie(row: SerieRow): number | null {
  const dove = row.blocks?.length ? row.blocks[0] : row;
  return numeroSevero(dove.load || dove.loadPlaceholder);
}

/** Il peso come percentuale del massimale, all'unita'. null senza un peso vero o senza massimale. */
export function percentualeRm(kg: number | null, massimale: number | null | undefined): number | null {
  if (kg === null || !massimale || massimale <= 0) return null;
  return Math.round(kg / massimale * 100);
}

/**
 * La serie che la card racconta: quella aperta, o la prima ancora da fare, o
 * (finite tutte) l'ultima. Cosi' la percentuale segue chi si allena: spuntata
 * una serie passa alla successiva.
 */
export function rigaInFuoco(rows: readonly SerieRow[], aperta: number | null): number {
  if (!rows.length) return -1;
  if (aperta !== null && aperta >= 0 && aperta < rows.length) return aperta;
  const daFare = rows.findIndex(r => !r.done);
  return daFare >= 0 ? daFare : rows.length - 1;
}
