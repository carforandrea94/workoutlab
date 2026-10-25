import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService } from '../../services/app-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonAvatar, IonBadge, IonButton, IonLabel, IonListHeader, IonNote, IonProgressBar } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';
import { Costanza, costanza } from '../../core/utils/costanza.util';
import { GiornoService } from '../../core/giorno.service';

@Component({
  selector: 'app-scheda-list',
  standalone: true,
  imports: [
    IonButton, IonAvatar, IonBadge, IonLabel, IonListHeader, IonNote, IonProgressBar,
    ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, CommonModule, IconaComponent
  ],
  templateUrl: './scheda-list.component.html'
})
export class SchedaListComponent implements OnInit {

  // Un signal: la pagina e' zoneless, e un campo cambiato da una promise non
  // avvisa nessuno - la lista restava senza "bozza" finche' qualcos'altro non
  // la ridisegnava.
  private draftDayIds = signal<ReadonlySet<string>>(new Set());
  /** Il giorno di oggi: a mezzanotte cambia, e la pagina con lui (vedi GiornoService). */
  private readonly giorno = inject(GiornoService);

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

  // ---- Le settimane di fila ----
  //
  // Sotto la settimana del programma, la costanza: quante settimane di fila con
  // la scheda completa (vedi costanza.util). Si dice cosa manca per la prossima,
  // mai cosa si e' perso: una settimana che non si puo' piu' completare non
  // conta i giorni che restano, e una fila spezzata riparte senza commenti.

  /** Letta a ogni giro: le sedute arrivano dal servizio, e la settimana cambia da sola il lunedi'. */
  get costanza(): Costanza | null {
    return costanza(this.weekly.sedute(), this.days.length, this.giorno.oggi());
  }

  titoloCostanza(c: Costanza): string {
    if (c.fila === 0) return 'Questa settimana';
    return c.fila === 1 ? '1 settimana completa' : `${c.fila} settimane di fila`;
  }

  fraseCostanza(c: Costanza): string {
    if (c.mancano === 0) return c.fila > 1 ? 'Scheda completa anche questa settimana.' : 'Scheda completa questa settimana.';
    const fatti = `${c.fatti} di ${c.previsti} allenamenti`;
    // Non c'e' piu' tempo per completarla: si dice dove si e', senza conti.
    if (c.mancano > c.giorniRimasti) return `${fatti} questa settimana.`;
    return `${fatti}: ancora ${c.mancano} entro domenica` + (c.fila > 0 ? `, per arrivare a ${c.fila + 1}.` : '.');
  }

  perLunedi(_: number, s: { lunedi: string }): string {
    return s.lunedi;
  }

  /** Per lo screen reader i pallini sono una frase sola. */
  etichettaSettimane(c: Costanza): string {
    const complete = c.settimane.filter(s => s.completa).length;
    const n = c.settimane.length;
    return `Ultime ${n} settimane: ${complete === 1 ? '1 completa' : `${complete} complete`}`;
  }

  /** Quanto del programma e' passato, per la barra: la settimana in corso conta. */
  get avanzamento(): number {
    const n = this.weekPlan.length;
    return n > 0 ? Math.min(1, Math.max(0, this.currentWeek / n)) : 0;
  }

  /** Sotto la settimana: lo schema di oggi e, se c'e', il metodo ("4×10 rip. · Wave loading"). */
  get sottotitoloSettimana(): string {
    return [this.getWaveInfo(), this.metodo].filter(Boolean).join(' · ');
  }

  getWaveInfo(): string {
    // La settimana ora e' calcolata da oggi e non piu' fotografata all'avvio:
    // se il piano avesse meno settimane del tetto, l'indice cadrebbe fuori.
    const wp = this.workoutData.WEEK_PLAN[this.currentWeek - 1];
    return wp ? `${wp.sets}×${wp.reps} rip.` : '';
  }

  /**
   * Il metodo di progressione, se c'e': la riga sotto la settimana diceva sempre
   * "WAVE LOADING", anche con un protocollo a serie fisse. Ora lo dice solo chi
   * ha almeno un esercizio a onda.
   */
  get metodo(): string | null {
    return this.days.some(d => d.ex.some(e => e.scheme === 'wave')) ? 'Wave loading' : null;
  }

  get todayWeekday(): string {
    const raw = new Date(this.giorno.oggi() + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
}
