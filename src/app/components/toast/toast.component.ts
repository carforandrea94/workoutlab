import { Component, effect, signal, untracked } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { IconaComponent } from '../icona/icona.component';

/** Lo spazio fra l'avviso e la barra su cui si appoggia: lo stesso di "Recupero finito" sopra "Fatta". */
export const STACCO_AVVISO_PX = 10;

/**
 * Gli avvisi dell'app ("Peso salvato", "Errore durante il salvataggio") sono
 * fatti come "Recupero finito" nell'allenamento: una pillola di vetro bassa,
 * la spunta verde (la x rossa per un errore) e la scritta nel colore del
 * testo, appoggiata sopra la barra in fondo. Compare e se ne va dissolvendosi,
 * con le stesse curve. Prima era un ion-toast pieno, del colore d'accento,
 * largo quanto lo schermo, che saliva dal fondo.
 *
 * Lo screen reader lo sente da due regioni sempre presenti (una cortese per
 * i salvataggi, una d'allarme per gli errori): una regione che nasce insieme
 * al messaggio non sempre viene letta. La pillola e' solo da vedere, e non
 * prende i tocchi: in due secondi e mezzo se ne va da sola.
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [IconaComponent],
  templateUrl: './toast.component.html'
})
export class ToastComponent {
  /**
   * Quanto l'avviso sta sopra il fondo dello schermo, deciso quando compare:
   * subito dopo un salvataggio la pagina cambia e le barre scorrono, e
   * l'avviso non deve seguirle. null: nessuna barra, sta in fondo (CSS).
   */
  readonly basso = signal<number | null>(null);

  constructor(public toast: ToastService) {
    effect(() => {
      const t = this.toast.toast();
      untracked(() => this.basso.set(t ? this.distanzaDalFondo() : null));
    });
  }

  /**
   * La barra che sta in fondo in questo momento: la fascia del recupero se
   * c'e', altrimenti le tab, altrimenti la barra del comando della pagina
   * (Salva, Registra peso...). Senza quest'ultima, salvata una misura
   * l'avviso copriva "Registra" in Misure, dove si torna.
   */
  anchor(): HTMLElement | undefined {
    const restbar = document.querySelector<HTMLElement>('.restbar');
    if (restbar) return restbar;
    const tabbar = document.querySelector<HTMLElement>('ion-tab-bar.tabbar');
    // Nelle pagine interne la barra e' scivolata via: l'avviso non la prende come ancora.
    if (tabbar && !tabbar.classList.contains('tabbar-nascosta') && tabbar.offsetParent !== null) return tabbar;
    // Le barre del comando stanno tutte nello stesso posto: vale quella della
    // pagina in vista (l'ultima), se la tastiera non l'ha mandata via.
    const comandi = document.querySelectorAll<HTMLElement>(
      '.ion-page:not(.ion-page-hidden) ion-footer.barra-azione:not(.con-tastiera) .barra-pillola');
    return comandi.length ? comandi[comandi.length - 1] : undefined;
  }

  /** Dal fondo dello schermo al bordo alto della barra, piu' lo stacco. */
  distanzaDalFondo(): number | null {
    const barra = this.anchor();
    if (!barra) return null;
    return Math.max(0, Math.round(window.innerHeight - barra.getBoundingClientRect().top + STACCO_AVVISO_PX));
  }
}
