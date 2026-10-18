import { Directive, ElementRef, inject } from '@angular/core';
import { STILE_ICONE, iconeIonic } from './icone';

/**
 * Le icone che i componenti di Ionic disegnano da se' (la freccia di dettaglio
 * delle righe, le frecce del select, la lente e la X della ricerca) nella
 * variante della piattaforma, come quelle dell'app (core/icone.ts). L'app e'
 * in modalita' iOS dappertutto, e senza questa direttiva Ionic le farebbe iOS
 * anche su Android. La freccia indietro la decide la configurazione di Ionic
 * (app.config.ts).
 *
 * Sta in IONIC_PAGE, quindi vale in ogni pagina senza scrivere niente nei
 * template; un'icona messa a mano nel template vince, perche' il binding
 * arriva dopo.
 */
@Directive({
  selector: 'ion-item, ion-select, ion-searchbar',
  standalone: true
})
export class IconeIonicDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement & Record<string, unknown>>>(ElementRef).nativeElement;
    const icone = iconeIonic(inject(STILE_ICONE));
    switch (el.tagName) {
      case 'ION-ITEM':
        el['detailIcon'] = icone.dettaglio;
        break;
      case 'ION-SELECT':
        el['toggleIcon'] = icone.select;
        break;
      case 'ION-SEARCHBAR':
        el['searchIcon'] = icone.cerca;
        el['clearIcon'] = icone.svuota;
        break;
    }
  }
}
