import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { NomeIcona, STILE_ICONE, svgIcona } from '../../core/icone';

/**
 * Un'icona di Ionic nella variante della piattaforma (vedi core/icone.ts):
 * `<app-icona name="trash" [size]="14">` e' il cestino a contorno su iOS e
 * Safari, quello pieno di Material su Android e Chrome.
 *
 * Il nome e' tipato: un nome che non c'e' in ICONE non compila, invece di
 * disegnare il vuoto in silenzio. L'SVG arriva dal bundle (ionicons/icons),
 * non da un file da scaricare: le icone ci sono anche offline.
 *
 * Sempre nascosta allo screen reader: nell'app un'icona accompagna un testo o
 * sta in un tasto che ha il suo aria-label. `size` e' il lato in px (il colore
 * lo prende dal testo intorno, come le altre icone).
 */
@Component({
  selector: 'app-icona',
  standalone: true,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ion-icon [icon]="svg()" aria-hidden="true"></ion-icon>`,
  host: {
    'aria-hidden': 'true',
    '[attr.name]': 'name()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size()'
  }
})
export class IconaComponent {
  readonly name = input.required<NomeIcona>();
  readonly size = input(24);
  /** Su iOS la versione piena, dove c'e' (barra delle tab, play e pausa). */
  readonly piena = input(false);

  private readonly stile = inject(STILE_ICONE);
  readonly svg = computed(() => svgIcona(this.name(), this.stile, this.piena()));
}
