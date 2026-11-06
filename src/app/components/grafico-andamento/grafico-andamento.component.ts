import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild
} from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular';
import {
  PuntoMisura, dataBreve, dataLunga, disegnaAndamento, numeroIt, uguale, variazioneIt
} from '../../core/utils/grafico-andamento.util';
import { LetturaPunti } from '../../core/utils/lettura-punti';

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
  /**
   * I valori del giorno, quando la linea e' la loro media (il peso, vedi
   * settimana.util): punti grigi sotto la linea, e nella testata quello del
   * giorno scelto. Con loro compare la legenda: le serie sono due.
   */
  readonly pesate = input<PuntoMisura[] | null>(null);

  /** Toccare, passarci sopra o usare le frecce sceglie una misurazione (vedi LetturaPunti); null: l'ultima, senza mirino. */
  readonly punto = new LetturaPunti(() => this.punti(), () => this.disegno().punti);

  readonly altezza = ALTEZZA_GRAFICO;
  readonly larghezza = signal(LARGHEZZA_INIZIALE);
  readonly sfumatura = `andamento-sfuma-${++progressivo}`;

  private readonly corpo = viewChild<ElementRef<HTMLElement>>('corpo');

  readonly disegno = computed(() =>
    disegnaAndamento(this.punti(), this.larghezza(), ALTEZZA_GRAFICO, this.traguardo()?.valore ?? null, this.pesate() ?? []));

  /** Il punto che la testata racconta: quello scelto, o l'ultimo. */
  private readonly indice = this.punto.indice;

  readonly mirino = computed(() => {
    const i = this.punto.scelto();
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
    return { valore: numeroIt(p[i].value), quando, confronto, pesata: this.pesataDel(p[i].date) };
  });

  /** Per lo screen reader: "21 ottobre 2026: 113,1 kg", e con le pesate ", pesata 113,4 kg". */
  readonly testoValore = computed(() => {
    const p = this.punti()[this.indice()];
    if (!p) return '';
    const pesata = this.pesataDel(p.date);
    return `${dataLunga(p.date)}: ${numeroIt(p.value)} ${this.unita()}` + (pesata ? `, pesata ${pesata} ${this.unita()}` : '');
  });

  /** La pesata di quel giorno, scritta; null senza pesate. */
  private pesataDel(date: string): string | null {
    const v = this.pesate()?.find(x => x.date === date)?.value;
    return v === undefined ? null : numeroIt(v);
  }

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
}
