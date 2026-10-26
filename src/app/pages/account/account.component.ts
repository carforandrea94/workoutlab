import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { BilancioSettimanaComponent } from '../../components/bilancio-settimana/bilancio-settimana.component';
import { AuthService } from '../../core/services/auth.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonAvatar, IonItem, IonLabel, IonList, NavController } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';
import { AppStateService } from '../../services/app-state.service';
import { Obiettivo, normalizzaObiettivo, rigaObiettivo } from '../../core/utils/obiettivo.util';
import { Promemoria, rigaPromemoria } from '../../core/utils/promemoria.util';
import { PromemoriaService } from '../../services/promemoria.service';
import { todayLocalISO } from '../../core/utils/date.util';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [IonAvatar, IonItem, IonLabel, IonList, ...IONIC_PAGE, CommonModule, IconaComponent, FormaCardComponent, BilancioSettimanaComponent],
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
  @ViewChild(BilancioSettimanaComponent) bilancio?: BilancioSettimanaComponent;
  private primoIngresso = true;

  /** Dove l'utente vuole arrivare, letto dallo stato dell'account. */
  private readonly obiettivo = signal<Obiettivo | null>(null);
  /** Giorni e ora dei promemoria; null finche' non si sono letti. */
  private readonly promemoria = signal<Promemoria | null>(null);

  constructor(
    public auth: AuthService, private nav: NavController, private appState: AppStateService,
    private promemoriaService: PromemoriaService
  ) {}

  ngOnInit(): void {
    this.leggiObiettivo();
    this.leggiPromemoria();
  }

  /** La riga sotto "Promemoria": i giorni e l'ora, o "Spenti". */
  rigaPromemoria(): string {
    return rigaPromemoria(this.promemoria());
  }

  /** Come l'obiettivo, un di piu': se la lettura non va, la riga dice "Spenti". */
  private leggiPromemoria(): void {
    this.promemoriaService.carica()
      .then(p => this.promemoria.set(p))
      .catch(e => console.error('Lettura dei promemoria fallita:', e));
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
    if (!this.primoIngresso) { this.forma?.refresh(); this.leggiObiettivo(); this.leggiPromemoria(); void this.bilancio?.refresh(); }
    this.primoIngresso = false;
  }

  goToObiettivo(): void {
    this.nav.navigateForward(['/account/obiettivo']);
  }

  goToPromemoria(): void {
    this.nav.navigateForward(['/account/promemoria']);
  }

  goToImpostazioni(): void {
    this.nav.navigateForward(['/account/impostazioni']);
  }
}
