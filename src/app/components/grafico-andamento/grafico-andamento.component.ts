import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, linkedSignal, signal, viewChild
} from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular';
import {
  PuntoMisura, dataBreve, dataLunga, disegnaAndamento, numeroIt, puntoPiuVicino, uguale, variazioneIt
} from '../../core/utils/grafico-andamento.util';

/** L'altezza del disegno, date comprese. */
export const ALTEZZA_GRAFICO = 200;
/** Finche' non si misura la card (e nei test), si disegna a questa larghezza. */
const LARGHEZZA_INIZIALE = 320;

let progressivo = 0;

/**
 * Una misura nel tempo, in una ion-card: in testa il valore e da quando e'
 * cambiato, sotto la linea.
 *
 * Ionic non ha un componente grafico: la linea e' un SVG disegnato qui, alla
 * larghezza vera della card. Il contorno (card, testata, titolo) e' di Ionic.
 *
 * Si legge col dito, come Salute dell'iPhone: toccando o trascinando sul
 * grafico si sceglie la misurazione piu' vicina, e la testata mostra quella
 * (valore, giorno, variazione dalla prima). Col mouse basta passarci sopra;
 * da tastiera il grafico e' un cursore: frecce, Inizio e Fine, Esc torna
 * all'ultima. Per lo screen reader il grafico e' quel cursore (giorno e
 * valore di ogni misurazione); il disegno e' nascosto.
 */
@Component({
  selector: 'app-grafico-andamento',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grafico-andamento.component.html'
})
export class GraficoAndamentoComponent {
  /** Dal piu' vecchio al piu' recente. */
  readonly punti = input.required<PuntoMisura[]>();
  readonly nome = input.required<string>();
  readonly unita = input.required<string>();
  /** Il traguardo da raggiungere (vedi obiettivo.util): la linea tratteggiata, e in testa quanto manca. */
  readonly traguardo = input<{ valore: number; testo: string } | null>(null);

  /** La misurazione scelta col dito o da tastiera; null: l'ultima, senza mirino. Cambiando misura si riparte da null. */
  readonly scelto = linkedSignal<PuntoMisura[], number | null>({ source: this.punti, computation: () => null });

  readonly altezza = ALTEZZA_GRAFICO;
  readonly larghezza = signal(LARGHEZZA_INIZIALE);
  readonly sfumatura = `andamento-sfuma-${++progressivo}`;

  private readonly corpo = viewChild<ElementRef<HTMLElement>>('corpo');
  private premuto = false;

  readonly disegno = computed(() => disegnaAndamento(this.punti(), this.larghezza(), ALTEZZA_GRAFICO, this.traguardo()?.valore ?? null));

  /** Il punto che la testata racconta: quello scelto, o l'ultimo. */
  private readonly indice = computed(() => this.scelto() ?? this.punti().length - 1);

  readonly mirino = computed(() => {
    const i = this.scelto();
    return i === null ? null : this.disegno().punti[i] ?? null;
  });

  readonly lettura = computed(() => {
    const p = this.punti();
    const i = this.indice();
    if (!p.length || i < 0) return null;
    const conAnno = p[0].date.slice(0, 4) !== p[p.length - 1].date.slice(0, 4);
    const quando = dataBreve(p[i].date, conAnno);
    const diff = p[i].value - p[0].value;
    const dal = dataBreve(p[0].date, conAnno);
    const confronto = i === 0 ? 'prima misura'
      : uguale(diff) ? `uguale al ${dal}`
      : `${variazioneIt(diff)} ${this.unita()} dal ${dal}`;
    return { valore: numeroIt(p[i].value), quando, confronto };
  });

  /** Per lo screen reader: "21 ottobre 2026: 113,1 kg". */
  readonly testoValore = computed(() => {
    const p = this.punti()[this.indice()];
    return p ? `${dataLunga(p.date)}: ${numeroIt(p.value)} ${this.unita()}` : '';
  });

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.corpo()?.nativeElement;
      if (!el) return;
      const misura = () => { if (el.clientWidth > 0) this.larghezza.set(el.clientWidth); };
      misura();
      if (typeof ResizeObserver === 'undefined') return;
      const osserva = new ResizeObserver(misura);
      osserva.observe(el);
      destroy.onDestroy(() => osserva.disconnect());
    });
  }

  private scegliDa(ev: PointerEvent): void {
    const el = ev.currentTarget as HTMLElement;
    const x = ev.clientX - el.getBoundingClientRect().left;
    const i = puntoPiuVicino(this.disegno().punti, x);
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

  /** Col mouse si legge passando sopra: uscendo si torna all'ultima. Col dito la scelta resta dov'e'. */
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
