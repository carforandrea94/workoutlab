import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonItem, NavController } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [IonItem, ...IONIC_PAGE, CommonModule, IconaComponent, FormaCardComponent],
  templateUrl: './account.component.html',
  styles: [`
    .account-header { display: flex; align-items: center; gap: 14px; }
    .account-avatar {
      width: 56px; height: 56px; border-radius: var(--r-lg); flex-shrink: 0;
      background: var(--accent-dim); color: var(--accent);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', sans-serif; font-weight: 800; font-size: var(--text-2xl);
    }
    .account-header .info { flex: 1; min-width: 0; }
    .account-header .lbl {
      font-family: 'Inter', sans-serif; font-weight: 700; font-size: var(--text-lg);
      letter-spacing: -.005em; line-height: 1.25;
    }
    .account-header .meta {
      font-family: 'IBM Plex Mono', monospace; font-size: var(--text-xs);
      color: var(--label-2); margin-top: 3px;
    }
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

  goToMisure(): void {
    this.nav.navigateForward(['/account/misure']);
  }

  goToImpostazioni(): void {
    this.nav.navigateForward(['/account/impostazioni']);
  }
}
