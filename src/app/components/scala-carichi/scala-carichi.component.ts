import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PuntoScala, disegnaScala } from '../../core/utils/scala-carichi.util';

/**
 * I pesi del foglio del massimale su una riga dall'80 al 100%: un punto per
 * peso, l'etichetta con i chili sopra o sotto, in fondo il massimale. Serve a
 * vedere l'ordine e la distanza fra i pesi, che a leggerli in elenco sono
 * numeri senza un rapporto fra loro. E' una scorciatoia per l'occhio: chi non
 * vede trova gli stessi numeri, con le percentuali, nelle righe sotto.
 */
@Component({
  selector: 'app-scala-carichi',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scala(); as s) {
      <div class="scala-carichi" aria-hidden="true">
        <div class="scala-pista">
          <div class="scala-riempi" [style.left.%]="s.da" [style.width.%]="s.a - s.da"></div>
          @for (p of s.punti; track p.chiave) {
            <span class="scala-punto" [class.scelto]="p.scelto" [style.left.%]="p.x"></span>
            <span class="scala-kg" [class.sotto]="p.sotto" [class.scelto]="p.scelto" [style.left.%]="p.x">{{ p.testo }}</span>
          }
          <span class="scala-massimale"></span>
          <span class="scala-kg scala-kg-massimale">{{ massimaleTesto() }}</span>
        </div>
        <div class="scala-assi"><span>{{ s.inizio }}%</span><span>100% del massimale</span></div>
      </div>
    }
  `
})
export class ScalaCarichiComponent {
  readonly punti = input.required<readonly PuntoScala[]>();
  /** Il massimale in chili, scritto in fondo alla riga. */
  readonly massimale = input<number | null>(null);

  readonly scala = computed(() => disegnaScala(this.punti()));
  readonly massimaleTesto = computed(() => {
    const m = this.massimale();
    return m === null ? '' : m.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  });
}
