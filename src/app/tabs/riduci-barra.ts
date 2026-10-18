/**
 * La barra delle tab che si fa piccola scorrendo, come su Instagram: si scorre
 * in giu' una pagina e la pillola si stringe un poco (restano tutte le icone,
 * si tocca come prima), si torna su e torna intera. In cima alla pagina e'
 * sempre intera.
 *
 * Qui c'e' solo la decisione, senza Angular ne' DOM: chi la usa le passa la
 * posizione di ogni pagina che scorre e sa cosa vuol dire "ridotta".
 */

/** Entro questi pixel dall'inizio della pagina la barra e' intera. */
export const CIMA_PX = 24;
/**
 * Quanto bisogna scorrere in una direzione prima che la barra cambi. Sotto
 * questa soglia sono il dito che trema o un rimbalzo, non un'intenzione: la
 * barra che si stringe e si allarga a ogni pixel sarebbe peggio di una ferma.
 */
export const SOGLIA_PX = 6;

export class RiduciBarra {
  /**
   * Da dove si misura lo scorrimento, pagina per pagina: le pagine delle tab
   * restano vive una accanto all'altra, e il punto di una non vale per l'altra.
   * Si sposta solo quando la barra decide: uno scorrimento lento, pochi pixel
   * per volta, si somma finche' non passa la soglia.
   */
  private readonly ancora = new WeakMap<object, number>();

  constructor(private readonly cambia: (ridotta: boolean) => void) {}

  /**
   * La pagina e' arrivata a scrollTop, e piu' in la' di max non si scorre.
   * Oltre i bordi (il rimbalzo di iOS, il pull-to-refresh) conta il bordo:
   * il ritorno dal rimbalzo non e' uno scorrimento verso l'alto.
   */
  scorri(pagina: object, scrollTop: number, max: number): void {
    const y = Math.min(Math.max(scrollTop, 0), Math.max(max, 0));
    if (y < CIMA_PX) {
      this.ancora.set(pagina, y);
      this.cambia(false);
      return;
    }
    const da = this.ancora.get(pagina);
    if (da === undefined) {
      this.ancora.set(pagina, y);
      return;
    }
    const dy = y - da;
    if (Math.abs(dy) <= SOGLIA_PX) return;
    this.ancora.set(pagina, y);
    this.cambia(dy > 0);
  }
}
