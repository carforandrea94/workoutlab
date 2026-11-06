import { WritableSignal, computed, linkedSignal } from '@angular/core';
import { PuntoMisura, puntoPiuVicino } from './grafico-andamento.util';

/**
 * Come si legge un grafico a linea, uguale per tutti: col dito si tocca o si
 * trascina e si sceglie il punto piu' vicino; col mouse basta passarci sopra;
 * da tastiera il grafico e' un cursore (frecce, Inizio, Fine, Esc). Il peso e
 * il massimale si leggono allo stesso modo, e questa e' la parte che non
 * cambia: le scritte che la scelta fa comparire sono di ogni grafico.
 *
 * Non e' un componente: ognuno ne tiene una e le passa dove stanno i punti
 * (misure) e dove sono stati disegnati (le x dentro al riquadro).
 */
export class LetturaPunti {
  /** Il punto scelto; null: l'ultimo, senza mirino. Cambiando le misure si riparte da null. */
  readonly scelto: WritableSignal<number | null>;
  /** Il punto che le scritte raccontano: quello scelto, o l'ultimo. */
  readonly indice = computed(() => this.scelto() ?? this.punti().length - 1);
  private premuto = false;

  constructor(
    private readonly punti: () => readonly PuntoMisura[],
    private readonly posizioni: () => readonly { x: number }[]
  ) {
    this.scelto = linkedSignal<readonly PuntoMisura[], number | null>({ source: punti, computation: () => null });
  }

  private scegliDa(ev: PointerEvent): void {
    const el = ev.currentTarget as HTMLElement;
    const x = ev.clientX - el.getBoundingClientRect().left;
    const i = puntoPiuVicino([...this.posizioni()], x);
    if (i >= 0) this.scelto.set(i);
  }

  giu(ev: PointerEvent): void {
    if (this.punti().length < 2) return;
    this.premuto = true;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    this.scegliDa(ev);
  }

  muove(ev: PointerEvent): void {
    if (this.punti().length < 2) return;
    if (this.premuto || ev.pointerType === 'mouse') this.scegliDa(ev);
  }

  su(): void {
    this.premuto = false;
  }

  /** Col mouse si legge passando sopra: uscendo si torna all'ultimo. Col dito la scelta resta dov'e'. */
  esce(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse' && !this.premuto) this.scelto.set(null);
  }

  tasto(ev: KeyboardEvent): void {
    const n = this.punti().length;
    if (n < 2) return;
    const i = this.indice();
    const dove: Record<string, number | null> = {
      ArrowLeft: Math.max(0, i - 1), ArrowDown: Math.max(0, i - 1),
      ArrowRight: Math.min(n - 1, i + 1), ArrowUp: Math.min(n - 1, i + 1),
      Home: 0, End: n - 1, Escape: null
    };
    if (!(ev.key in dove) || (ev.key === 'Escape' && this.scelto() === null)) return;
    ev.preventDefault();
    this.scelto.set(dove[ev.key]);
  }
}
