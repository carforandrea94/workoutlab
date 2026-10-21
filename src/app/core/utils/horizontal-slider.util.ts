/**
 * Trova l'indice della card visibile piu' vicina alla posizione di scroll
 * corrente, per uno slider orizzontale con scroll-snap (una card = un
 * figlio diretto del container). Usato per sincronizzare l'indicatore
 * (pallini/contatore) con lo scroll reale dell'utente.
 */
export function findClosestSlideIndex(container: HTMLElement): number {
  const children = Array.from(container.children) as HTMLElement[];
  let closest = 0;
  let minDist = Infinity;
  children.forEach((child, idx) => {
    const dist = Math.abs(child.offsetLeft - container.scrollLeft);
    if (dist < minDist) { minDist = dist; closest = idx; }
  });
  return closest;
}

/**
 * Scorre lo slider fino a portare la card all'indice dato nella vista (usato
 * dal tap su un pallino). Morbido quando lo chiede un tocco; di colpo quando
 * la pagina si apre gia' su quella card: uno scorrimento di lato mentre la
 * pagina entra da destra sarebbe un secondo movimento sopra il primo.
 */
export function scrollToSlide(container: HTMLElement | undefined, idx: number, morbido = true): void {
  const child = container?.children[idx] as HTMLElement | undefined;
  child?.scrollIntoView({ behavior: morbido ? 'smooth' : 'instant', inline: 'center', block: 'nearest' });
}

/** Oltre questo tempo uno scorrimento verso la meta si considera finito (o interrotto). */
export const META_SCADENZA_MS = 900;

/**
 * La card verso cui si sta andando dopo un tocco sul segmento in cima.
 *
 * Lo scorrimento morbido passa sopra le card in mezzo, e l'indice letto dallo
 * scroll le attraversava tutte: toccato "Cena", il segmento tornava su
 * "Colazione", passava da "Pranzo" e solo alla fine arrivava a "Cena". Finche'
 * lo slider va verso la meta le posizioni intermedie non contano; arrivato, o
 * se il dito lo riprende, o passato il tempo di uno scorrimento, si torna a
 * leggere lo scroll.
 */
export class MetaSlider {
  private meta: number | null = null;
  private fino = 0;

  constructor(private readonly ora: () => number = () => performance.now()) {}

  /** Si parte verso la card i. */
  vai(i: number): void {
    this.meta = i;
    this.fino = this.ora() + META_SCADENZA_MS;
  }

  /** Il dito riprende lo slider: conta di nuovo quello che si vede. */
  lascia(): void {
    this.meta = null;
  }

  /** L'indice letto dallo scroll, o null se e' una card di passaggio. */
  letto(i: number): number | null {
    if (this.meta === null) return i;
    if (i !== this.meta && this.ora() < this.fino) return null;
    this.meta = null;
    return i;
  }
}
