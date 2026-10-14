import { ClusterSpec } from '../../models/workout.model';
import { BlockRow, MAX_BLOCKS_PER_SET } from './extra-sets.util';

/**
 * Le serie a cluster: come si scrivono, come si aprono in blocchi e quando
 * una serie e' finita.
 *
 * Il cluster descrive UNA serie. "4x8+8" sono quattro serie fatte di due
 * blocchi da otto; il quattro e' il numero di serie e vive dove ha sempre
 * vissuto, nel campo dell'esercizio.
 */

/** Pausa di default dentro la serie, quando il coach non ne mette una. */
export const CLUSTER_DEFAULT_REST = 30;

/** Il minimo che ha senso scrivere: sotto, non e' una pausa, e' un respiro. */
export const CLUSTER_MIN_REST = 5;

export function newCluster(): ClusterSpec {
  return { blocks: [8, 8], restSec: CLUSTER_DEFAULT_REST, end: 'fixed' };
}

/**
 * Difesa in lettura: il protocollo arriva da Firestore e puo' essere stato
 * scritto da una versione precedente, o male. Quello che non si puo' leggere
 * non diventa un cluster rotto, diventa nessun cluster.
 */
export function normalizeCluster(raw: any): ClusterSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .map((n: any) => Math.floor(Number(n)))
    .filter((n: number) => isFinite(n) && n > 0)
    .slice(0, MAX_BLOCKS_PER_SET);
  if (!blocks.length) return null;

  const end: 'fixed' | 'open' = raw.end === 'open' ? 'open' : 'fixed';
  // A esaurimento il blocco e' uno solo: quanti se ne fanno lo dice la
  // palestra, e tenerne scritti altri direbbe il contrario.
  const finali = end === 'open' ? blocks.slice(0, 1) : blocks;
  // Un cluster di un blocco solo che finisce coi blocchi scritti e' una serie
  // normale con una parola in piu': non e' un cluster.
  if (end === 'fixed' && finali.length < 2) return null;

  const rest = Math.floor(Number(raw.restSec));
  return {
    blocks: finali,
    restSec: isFinite(rest) && rest >= CLUSTER_MIN_REST ? rest : CLUSTER_DEFAULT_REST,
    end
  };
}

/** La pausa come la scrive il coach: 30", 1'30". */
export function formatClusterRest(sec: number): string {
  if (sec < 60) return `${sec}"`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}'` : `${m}'${s}"`;
}

/**
 * Il cluster nella notazione del coach: "8+8" quando i blocchi sono scritti,
 * "5+30"" quando sono a esaurimento — la stessa cosa che ha in mano sul foglio.
 */
export function clusterLabel(spec: ClusterSpec): string {
  if (spec.end === 'open') return `${spec.blocks[0]}+${formatClusterRest(spec.restSec)}`;
  return spec.blocks.join('+');
}

/** Lo schema intero, serie comprese: "4x8+8". */
export function clusterScheme(spec: ClusterSpec, sets: number): string {
  return `${sets}x${clusterLabel(spec)}`;
}

/** I blocchi di una serie che comincia: vuoti, coi loro suggerimenti. */
export function buildBlocks(spec: ClusterSpec): BlockRow[] {
  return spec.blocks.map(n => ({
    reps: '', load: '', ripPlaceholder: String(n), loadPlaceholder: '', done: false
  }));
}

/**
 * Un blocco in piu'. Esiste solo a esaurimento: dove i blocchi sono scritti,
 * aggiungerne uno vorrebbe dire cambiare il piano del coach a sua insaputa.
 */
export function canAddBlock(spec: ClusterSpec, blocks: readonly BlockRow[]): boolean {
  return spec.end === 'open' && blocks.length < MAX_BLOCKS_PER_SET;
}

/**
 * Il blocco che si aggiunge a esaurimento. Il peso lo eredita dall'ultimo
 * fatto: e' quasi sempre lo stesso, e quando cala lo cali tu di un tocco.
 */
export function buildBlock(spec: ClusterSpec, blocks: readonly BlockRow[] = []): BlockRow {
  const last = blocks[blocks.length - 1];
  return {
    reps: '',
    load: '',
    ripPlaceholder: String(spec.blocks[0] ?? ''),
    loadPlaceholder: last ? (last.load || last.loadPlaceholder) : '',
    done: false
  };
}

/** L'indice del blocco su cui si sta lavorando, o -1 se sono tutti fatti. */
export function currentBlock(blocks: readonly BlockRow[]): number {
  return blocks.findIndex(b => !b.done);
}

/**
 * Una serie a cluster e' finita quando tutti i suoi blocchi lo sono. A
 * esaurimento non basta: li' la serie la chiude chi si allena, perche' un
 * altro blocco e' sempre possibile finche' non lo si dichiara.
 */
export function clusterSetDone(spec: ClusterSpec, blocks: readonly BlockRow[]): boolean {
  if (!blocks.length) return false;
  if (spec.end === 'open') return false;
  return blocks.every(b => b.done);
}

/**
 * Si puo' togliere un blocco solo dove i blocchi li aggiunge chi si allena.
 * Dove sono scritti dal coach, toglierne uno vorrebbe dire cambiargli il
 * piano di nascosto.
 */
export function canRemoveBlock(spec: ClusterSpec, blocks: readonly BlockRow[]): boolean {
  return spec.end === 'open' && blocks.some(b => b.done);
}

/**
 * Toglie l'ultimo blocco FATTO.
 *
 * Non l'ultimo in coda: a esaurimento quello e' il prossimo da fare, creato
 * per mostrare dove si sta andando, e toglierlo non toglierebbe niente di
 * quello che hai sbagliato a segnare.
 */
export function removeLastBlock(spec: ClusterSpec, blocks: readonly BlockRow[]): BlockRow[] {
  if (!canRemoveBlock(spec, blocks)) return blocks.slice();
  const out = blocks.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].done) { out.splice(i, 1); break; }
  }
  // Senza un blocco da fare la serie non avrebbe piu' dove continuare.
  if (!out.some(b => !b.done)) out.push(buildBlock(spec, out));
  return out;
}

/** Quello che hai fatto, scritto come lo scriveresti: "8+8", "5+5+3". */
export function blocksLabel(blocks: readonly BlockRow[]): string {
  const fatti = blocks.filter(b => b.done).map(b => b.reps || b.ripPlaceholder || '0');
  return fatti.join('+');
}

/**
 * Il carico della serie, scritto come si racconta: "62,5" se i blocchi sono
 * andati tutti allo stesso peso, "62,5-55" se e' calato.
 *
 * Non e' una media: in un cluster che scende, la media e' un numero che non
 * hai mai sollevato.
 */
export function blocksLoadLabel(blocks: readonly BlockRow[]): string {
  const pesi = blocks.filter(b => b.done).map(b => b.load || b.loadPlaceholder).filter(v => !!v);
  if (!pesi.length) return '';
  const primo = pesi[0];
  const ultimo = pesi[pesi.length - 1];
  return pesi.every(v => v === primo) ? primo : `${primo}-${ultimo}`;
}

/** Le ripetizioni previste in tutta la serie, per i suggerimenti di carico. */
export function plannedReps(spec: ClusterSpec): number {
  return spec.blocks.reduce((tot, n) => tot + n, 0);
}
