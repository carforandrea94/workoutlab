import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonAvatar, IonItem, IonLabel, IonList, NavController } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [IonAvatar, IonItem, IonLabel, IonList, ...IONIC_PAGE, CommonModule, IconaComponent, FormaCardComponent],
  templateUrl: './account.component.html',
  // La riga del profilo: l'iniziale in un riquadro piu' grande delle icone
  // delle righe, come la riga dell'ID Apple in cima alle Impostazioni di iOS.
  styles: [`
    ion-avatar.account-avatar {
      --border-radius: var(--r-lg);
      width: 56px; height: 56px; margin-inline-end: 14px;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent-dim); color: var(--accent);
      font-weight: 800; font-size: var(--text-2xl);
    }
    .profilo ion-label h2 { font-weight: 700; font-size: var(--text-xl); }
  `]
})
export class AccountComponent {
  @ViewChild(FormaCardComponent) forma?: FormaCardComponent;
  private primoIngresso = true;

  constructor(public auth: AuthService, private nav: NavController) {}

  get initial(): string {
    return (this.auth.currentUser()?.displayName ?? '?').charAt(0).toUpperCase();
  }

  /**
   * La pagina resta viva fra una tab e l'altra, e sotto di lei si aprono le
   * misure: quelle registrate altrove (o appena salvate in Misure) si
   * rileggono al rientro.
   */
  ionViewWillEnter(): void {
    if (!this.primoIngresso) this.forma?.refresh();
    this.primoIngresso = false;
  }

  goToImpostazioni(): void {
    this.nav.navigateForward(['/account/impostazioni']);
  }
}
