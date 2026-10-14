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

/** Scorre lo slider fino a portare la card all'indice dato nella vista (usato dal tap su un pallino). */
export function scrollToSlide(container: HTMLElement | undefined, idx: number): void {
  const child = container?.children[idx] as HTMLElement | undefined;
  child?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
