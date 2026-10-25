import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonAvatar, IonItem, IonLabel, IonList, NavController } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';
import { AppStateService } from '../../services/app-state.service';
import { Obiettivo, normalizzaObiettivo, rigaObiettivo } from '../../core/utils/obiettivo.util';
import { todayLocalISO } from '../../core/utils/date.util';

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
export class AccountComponent implements OnInit {
  @ViewChild(FormaCardComponent) forma?: FormaCardComponent;
  private primoIngresso = true;

  /** Dove l'utente vuole arrivare, letto dallo stato dell'account. */
  private readonly obiettivo = signal<Obiettivo | null>(null);

  constructor(public auth: AuthService, private nav: NavController, private appState: AppStateService) {}

  ngOnInit(): void {
    this.leggiObiettivo();
  }

  /** La riga sotto "Il mio obiettivo": l'obiettivo col traguardo, o l'invito a sceglierlo. */
  rigaObiettivo(): string {
    return rigaObiettivo(this.obiettivo(), todayLocalISO());
  }

  /** L'obiettivo e' un di piu' della pagina: se la lettura non va, resta l'invito. */
  private leggiObiettivo(): void {
    this.appState.load()
      .then(s => this.obiettivo.set(normalizzaObiettivo(s.obiettivo)))
      .catch(e => console.error('Lettura dell\'obiettivo fallita:', e));
  }

  get initial(): string {
    return (this.auth.currentUser()?.displayName ?? '?').charAt(0).toUpperCase();
  }

  /**
   * La pagina resta viva fra una tab e l'altra, e sotto di lei si aprono le
   * misure: quelle registrate altrove (o appena salvate in Misure) si
   * rileggono al rientro.
   */
  ionViewWillEnter(): void {
    // E l'obiettivo, che si sceglie in una pagina sotto questa.
    if (!this.primoIngresso) { this.forma?.refresh(); this.leggiObiettivo(); }
    this.primoIngresso = false;
  }

  goToObiettivo(): void {
    this.nav.navigateForward(['/account/obiettivo']);
  }

  goToImpostazioni(): void {
    this.nav.navigateForward(['/account/impostazioni']);
  }
}
