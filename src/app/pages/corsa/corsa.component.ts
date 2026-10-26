import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RunningStateService } from '../../services/running-state.service';
import { hasRunGoal } from '../../models/run.model';
import { goalPct } from '../../core/utils/run-math.util';
import { GiornoService } from '../../core/giorno.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { buildWeekHistory } from '../../core/utils/week-history.util';
import { IONIC_LINKS, IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { NavController, IonButton, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonProgressBar } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';
import { RigaCorsa } from './riga-corsa';

/**
 * La Corsa e' la settimana in corso: l'obiettivo, le corse fatte e "Registra
 * corsa". Le settimane passate stanno nello Storico, una pagina dentro la
 * tab (corsa-storico), che si apre dal tasto in alto a destra. Prima erano
 * tutte qui sotto, e la pagina era soprattutto storico.
 */
@Component({
  selector: 'app-corsa',
  standalone: true,
  imports: [
    IonButton, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonProgressBar,
    ...IONIC_PAGE, ...IONIC_REFRESH, ...IONIC_LINKS, CommonModule, IconaComponent
  ],
  templateUrl: './corsa.component.html'
})
export class CorsaComponent extends RigaCorsa implements OnInit {

  readonly hasGoal = computed(() => hasRunGoal(this.state.goal()));
  private readonly giorno = inject(GiornoService);

  /** La settimana in corso: qui serve solo lei (la piu' recente, se non ci sono corse datate nel futuro). */
  readonly corrente = computed(() =>
    buildWeekHistory(this.state.runs(), this.giorno.oggi(), 0).weeks.find(w => w.isCurrent) ?? null
  );

  constructor(
    public state: RunningStateService,
    private nav: NavController
  ) {
    super();
  }

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.state.refresh());
  }

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i dati possono essere cambiati altrove (salvataggi, eliminazioni). */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.state.refresh();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    // L'obiettivo arriva dal protocollo, gia' caricato da clientGuard prima che
    // questa route si attivi: qui restano solo le uscite. Vivono nel servizio e
    // non nella pagina, cosi' se la pagina viene ricreata (ritorno sulla
    // sezione, rinnovo del token) i totali restano a schermo durante la
    // rilettura invece di sparire e ricomparire.
    this.state.refresh();
  }

  // --- Obiettivo settimanale -------------------------------------------------

  get minutesPct(): number { return goalPct(this.minutesDone, this.goalMinutes); }
  get runsPct(): number { return goalPct(this.state.thisWeek().runs, this.state.goal()?.weeklyRuns ?? 0); }

  /** Minuti corsi questa settimana: e' il numero confrontato con l'obiettivo. */
  get minutesDone(): number { return this.state.thisWeek().minutes; }

  get goalMinutes(): number { return this.state.goal()?.weeklyMinutes ?? 0; }

  /** Intervallo della settimana in corso, es. "8 – 14 set". */
  get weekLabel(): string {
    return this.corrente()?.label ?? '';
  }

  /**
   * Accanto a "Questa settimana": l'intervallo e, senza un obiettivo che li
   * dica nelle sue righe, quante corse e quanti minuti.
   */
  get notaSettimana(): string {
    const w = this.corrente();
    if (!w || this.hasGoal()) return this.weekLabel;
    return `${w.label} · ${this.runsLabel(w)}` + (w.minutes ? ` · ${w.minutes} min` : '');
  }

  // --- Azioni ----------------------------------------------------------------

  /** "Registra corsa" nella settimana in corso: parte da oggi. */
  registraCorsa(): void {
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { date: todayLocalISO() } });
  }

  editRun(id: string): void {
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { id } });
  }
}
