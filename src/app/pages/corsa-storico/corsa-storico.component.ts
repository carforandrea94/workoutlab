import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RunningStateService } from '../../services/running-state.service';
import { goalPct } from '../../core/utils/run-math.util';
import { GiornoService } from '../../core/giorno.service';
import { buildWeekHistory, WeekGroup } from '../../core/utils/week-history.util';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import {
  NavController, IonAccordion, IonAccordionGroup, IonButton, IonItem, IonLabel, IonList, IonNote, IonProgressBar
} from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';
import { RigaCorsa } from '../corsa/riga-corsa';

/**
 * Quante settimane si vedono senza chiederlo. Dodici sono tre mesi: oltre,
 * l'elenco tornerebbe lungo come quello che ha sostituito.
 */
const WEEKS_SHOWN = 12;

/**
 * Lo storico della corsa, una pagina dentro la tab: una riga per SETTIMANA
 * invece di una per uscita. Prima era un elenco piatto che cresceva per
 * sempre: dopo tre mesi erano quaranta righe uguali, senza totali e senza un
 * modo di vedere se si stesse correndo di piu' o di meno. E' una fisarmonica
 * raggruppata di Ionic, con le sole settimane passate: si aprono toccandole,
 * anche piu' d'una. La settimana in corso sta nella Corsa.
 */
@Component({
  selector: 'app-corsa-storico',
  standalone: true,
  imports: [
    IonAccordion, IonAccordionGroup, IonButton, IonItem, IonLabel, IonList, IonNote, IonProgressBar,
    ...IONIC_PAGE, ...IONIC_REFRESH, CommonModule, IconaComponent
  ],
  templateUrl: './corsa-storico.component.html'
})
export class CorsaStoricoComponent extends RigaCorsa implements OnInit {

  /** Le settimane aperte, per lunedi'. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  readonly showAll = signal(false);
  private readonly giorno = inject(GiornoService);

  /** Una settimana in piu' di quelle mostrate: quella in corso, che qui non c'e'. */
  readonly history = computed(() =>
    buildWeekHistory(this.state.runs(), this.giorno.oggi(), this.showAll() ? 0 : WEEKS_SHOWN + 1)
  );

  /** Le settimane passate, dalla piu' recente. */
  readonly passate = computed(() => this.history().weeks.filter(w => !w.isCurrent));

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

  /** Tornando qui da una corsa modificata, i totali vanno riletti. */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.state.refresh();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    // Arrivando dalla Corsa le uscite ci sono gia' (vivono nel servizio); da
    // un link diretto no.
    if (!this.state.loaded()) void this.state.refresh();
  }

  get goalMinutes(): number { return this.state.goal()?.weeklyMinutes ?? 0; }

  /** Le settimane aperte, per la fisarmonica. */
  aperte(): string[] {
    return this.passate().filter(w => this.opened().has(w.mondayISO)).map(w => w.mondayISO);
  }

  /** La fisarmonica dice quali settimane sono aperte dopo un tocco. */
  settimaneCambiate(ev: Event): void {
    const v = (ev as CustomEvent<{ value?: string | string[] | null }>).detail?.value;
    this.opened.set(new Set(Array.isArray(v) ? v : v ? [v] : []));
  }

  /** Quanto della settimana e' stato coperto. Senza obiettivo la barra non
   *  compare: una percentuale su un bersaglio che non c'e' non vuol dire niente. */
  pct(w: WeekGroup): number {
    return goalPct(w.minutes, this.goalMinutes);
  }

  reached(w: WeekGroup): boolean {
    return this.goalMinutes > 0 && w.minutes >= this.goalMinutes;
  }

  /**
   * Nuova corsa dentro una settimana passata: parte dalla sua domenica, cosi'
   * il calendario si apre gia' nel punto giusto invece di costringere a
   * girarlo all'indietro.
   */
  addRun(w: WeekGroup): void {
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { date: w.sundayISO } });
  }

  editRun(id: string): void {
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { id } });
  }
}
