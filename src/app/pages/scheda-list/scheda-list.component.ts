import { Component, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService } from '../../services/app-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonButton } from '@ionic/angular';

@Component({
  selector: 'app-scheda-list',
  standalone: true,
  imports: [IonButton, ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, CommonModule, LucideAngularModule],
  templateUrl: './scheda-list.component.html'
})
export class SchedaListComponent implements OnInit {

  // Un signal: la pagina e' zoneless, e un campo cambiato da una promise non
  // avvisa nessuno - la lista restava senza "bozza" finche' qualcos'altro non
  // la ridisegnava.
  private draftDayIds = signal<ReadonlySet<string>>(new Set());

  constructor(
    public workoutData: WorkoutDataService,
    public state: WorkoutStateService,
    private nav: NavController,
    private appState: AppStateService,
    public weekly: WeeklyProgressService,
    private sessionState: WorkoutSessionStateService
  ) {
  }

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i dati possono essere cambiati altrove (salvataggi, eliminazioni). */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) this.refresh();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    // Le spunte vivono nel servizio: se la pagina viene ricreata (ritorno sulla
    // scheda, rinnovo del token) quelle gia' calcolate restano a schermo mentre
    // la rilettura e' in corso, invece di sparire e ricomparire.
    this.weekly.refresh();

    this.appState.load()
      .then(state => { this.draftDayIds.set(new Set(Object.keys(state.workoutDrafts ?? {}))); })
      // Le bozze sono contorno: se la lettura fallisce la lista resta usabile.
      .catch(e => console.error('Lettura delle bozze fallita:', e));
  }

  // Letti dal servizio a ogni giro e non copiati nel costruttore: Ionic tiene
  // viva questa pagina, e quando l'utente attiva un altro protocollo l'elenco
  // dei giorni cambia sotto di lei.
  get days() { return this.workoutData.days; }
  get weekPlan() { return this.workoutData.WEEK_PLAN; }
  get weeks(): number[] { return Array.from({ length: this.weekPlan.length }, (_, i) => i + 1); }

  /** Il nome che l'utente ha dato al protocollo attivo, se c'e'. */
  get titolo(): string {
    return this.workoutData.hasCustomProtocol ? (this.workoutData.protocolName || 'Scheda') : 'Scheda';
  }

  /** true se questo allenamento e' gia' stato fatto in questa settimana. */
  isDoneThisWeek(dayId: string): boolean {
    return this.weekly.isDone(dayId);
  }

  /** Letta dal servizio a ogni giro: se cambia settimana mentre l'app e'
   *  aperta, la pagina si aggiorna invece di restare al giorno dell'apertura. */
  get currentWeek(): number {
    return this.state.currentWeek;
  }

  goToDay(idx: number): void {
    this.nav.navigateForward(['/scheda/day', idx]);
  }

  getExCount(idx: number): number {
    return this.days[idx].ex.length;
  }

  /**
   * Quale allenamento tocca: il primo, nell'ordine del protocollo, che questa
   * settimana non e' ancora stato fatto (e nessuna sessione e' in corso: allora
   * il segno e' quello della sessione). La scheda non lega i giorni ai giorni
   * della settimana ("Giorno 2" non e' "martedi'"), quindi "oggi" non esiste:
   * esiste "il prossimo". Null quando sono tutti fatti.
   */
  get giornoProssimo(): number | null {
    // Con una sessione in corso il segno e' quello della sessione, non due.
    if (this.sessionState.activeSession()) return null;
    const i = this.days.findIndex(d => !this.weekly.isDone(d.id));
    return i >= 0 ? i : null;
  }

  /** La sessione in corso e' su questo giorno. */
  inCorso(dayId: string): boolean {
    return this.sessionState.isActiveForDay(dayId);
  }

  hasDraft(dayId: string): boolean {
    return this.draftDayIds().has(dayId);
  }

  getWaveInfo(): string {
    // La settimana ora e' calcolata da oggi e non piu' fotografata all'avvio:
    // se il piano avesse meno settimane del tetto, l'indice cadrebbe fuori.
    const wp = this.workoutData.WEEK_PLAN[this.currentWeek - 1];
    return wp ? `${wp.sets}×${wp.reps} reps` : '';
  }

  get todayWeekday(): string {
    const raw = new Date().toLocaleDateString('it-IT', { weekday: 'long' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
}
