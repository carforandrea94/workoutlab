import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild
} from '@angular/core';
import { PuntoMisura, disegnaAndamento } from '../../core/utils/grafico-andamento.util';
import { LetturaPunti } from '../../core/utils/lettura-punti';
import { testiPunto, testiStoria } from '../../core/utils/storia-massimale.util';

/** L'altezza del disegno, date comprese: in un foglio ci sta sotto il massimale senza spingere giu' i pesi. */
export const ALTEZZA_STORIA = 150;
/** Finche' non si misura il foglio (e nei test), si disegna a questa larghezza. */
const LARGHEZZA_INIZIALE = 300;

/**
 * Il massimale stimato nelle ultime sedute, sotto quello di oggi nel foglio
 * del carico (vedi storia-massimale.util). Il disegno e' quello di Andamento
 * (stesse tacche, punti in proporzione al tempo), piu' piccolo: qui si guarda
 * la direzione, il numero di oggi e' gia' in testa al foglio. Come il peso, si
 * legge un punto alla volta: col dito, col mouse o con le frecce la didascalia
 * racconta quella seduta. Per lo screen reader e' un cursore con la sua
 * descrizione (il disegno e' nascosto).
 */
@Component({
  selector: 'app-storia-massimale',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './storia-massimale.component.html',
  styles: [':host { display: block; }']
})
export class StoriaMassimaleComponent {
  /** Dalla seduta piu' vecchia. */
  readonly storia = input.required<PuntoMisura[]>();

  readonly larghezza = signal(LARGHEZZA_INIZIALE);
  readonly testi = computed(() => testiStoria(this.storia()));
  readonly disegno = computed(() => disegnaAndamento(this.storia(), this.larghezza(), ALTEZZA_STORIA));

  /** Toccare, passarci sopra o usare le frecce sceglie una seduta (vedi LetturaPunti); null: l'ultima, senza mirino. */
  readonly punto = new LetturaPunti(() => this.storia(), () => this.disegno().punti);
  readonly mirino = computed(() => {
    const i = this.punto.scelto();
    return i === null ? null : this.disegno().punti[i] ?? null;
  });
  /** La seduta scelta; null: la didascalia racconta tutte e il cursore dice l'ultima. */
  readonly lettura = computed(() => (this.punto.scelto() === null ? null : testiPunto(this.storia(), this.punto.indice())));
  readonly voce = computed(() => testiPunto(this.storia(), this.punto.indice())?.voce ?? '');

  private readonly corpo = viewChild<ElementRef<HTMLElement>>('corpo');

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
