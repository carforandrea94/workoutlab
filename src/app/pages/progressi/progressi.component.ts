import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { BilancioSettimanaComponent } from '../../components/bilancio-settimana/bilancio-settimana.component';
import { IONIC_PAGE } from '../../core/ionic-page';

/**
 * Come sta andando: la settimana scorsa (letta rispetto all'obiettivo), il
 * corpo, il lavoro e il tonnellaggio. Stava in Account, in mezzo al profilo e
 * alle impostazioni: chi cercava i propri progressi doveva pensare a "Account"
 * e scorrere otto gruppi. Ora e' una tab a se', e da qui si aprono le misure.
 */
@Component({
  selector: 'app-progressi',
  standalone: true,
  imports: [...IONIC_PAGE, CommonModule, FormaCardComponent, BilancioSettimanaComponent],
  templateUrl: './progressi.component.html'
})
export class ProgressiComponent {
  @ViewChild(FormaCardComponent) forma?: FormaCardComponent;
  @ViewChild(BilancioSettimanaComponent) bilancio?: BilancioSettimanaComponent;
  private primoIngresso = true;

  /**
   * La pagina resta viva fra una tab e l'altra, e sotto di lei si aprono le
   * misure: quelle registrate altrove (o appena salvate in Misure), le sedute
   * e le uscite si rileggono al rientro.
   */
  ionViewWillEnter(): void {
    if (!this.primoIngresso) { this.forma?.refresh(); void this.bilancio?.refresh(); }
    this.primoIngresso = false;
  }
}
