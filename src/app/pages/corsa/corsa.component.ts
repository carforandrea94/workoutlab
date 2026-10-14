import { Component, OnInit, computed, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { RunningStateService } from '../../services/running-state.service';
import { RUN_TYPE_LABELS, RUN_EFFORT_LABELS, RunEffort, hasRunGoal, Run } from '../../models/run.model';
import { goalPct } from '../../core/utils/run-math.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { buildWeekHistory, WeekGroup } from '../../core/utils/week-history.util';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { NavController, IonButton } from '@ionic/angular';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/**
 * Quante settimane si vedono senza chiederlo. Dodici sono tre mesi: oltre,
 * l'elenco tornerebbe lungo come quello che ha sostituito.
 */
const WEEKS_SHOWN = 12;

/**
 * La fatica di un'uscita, detta due volte: con il colore e con la MISURA del
 * pallino, che cresce col peso della giornata.
 *
 * Il colore da solo non basterebbe. I tre hanno contrasto di sovrabbondanza
 * sulla card — oltre 5:1 in entrambi i temi, contro i 3:1 che servono a un
 * segno non testuale — ma le loro luminosita' sono quasi identiche, quindi
 * chi confonde le tinte vedrebbe tre pallini uguali. Il diametro e' il
 * secondo canale, e si legge anche senza colori.
 */
const EFFORT_STYLE: Record<RunEffort, { color: string; size: number }> = {
  facile: { color: 'var(--state-success)', size: 5 },
  giusta: { color: 'var(--accent)', size: 8 },
  dura: { color: 'var(--effort-hard)', size: 11 }
};

@Component({
  selector: 'app-corsa',
  standalone: true,
  imports: [IonButton, ...IONIC_PAGE, ...IONIC_REFRESH, CommonModule, LucideAngularModule],
  templateUrl: './corsa.component.html'
})
export class CorsaComponent implements OnInit {

  readonly hasGoal = computed(() => hasRunGoal(this.state.goal()));

  /** Le settimane aperte, per lunedi'. Quella in corso e' sempre aperta e non
   *  passa di qui: non ha senso poterla chiudere. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  readonly showAll = signal(false);

  readonly history = computed(() =>
    buildWeekHistory(this.state.runs(), todayLocalISO(), this.showAll() ? 0 : WEEKS_SHOWN)
  );

  constructor(
    public state: RunningStateService,
    private nav: NavController
  ) {}

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
    return this.history().weeks.find(w => w.isCurrent)?.label ?? '';
  }

  // --- Le settimane ----------------------------------------------------------

  isOpen(w: WeekGroup): boolean {
    return w.isCurrent || this.opened().has(w.mondayISO);
  }

  toggle(w: WeekGroup): void {
    const next = new Set(this.opened());
    if (next.has(w.mondayISO)) next.delete(w.mondayISO); else next.add(w.mondayISO);
    this.opened.set(next);
  }

  /** Quanto della settimana e' stato coperto. Senza obiettivo la barra non
   *  compare: una percentuale su un bersaglio che non c'e' non vuol dire niente. */
  pct(w: WeekGroup): number {
    return goalPct(w.minutes, this.goalMinutes);
  }

  reached(w: WeekGroup): boolean {
    return this.goalMinutes > 0 && w.minutes >= this.goalMinutes;
  }

  runsLabel(w: WeekGroup): string {
    if (!w.runs.length) return 'nessuna uscita';
    return w.runs.length === 1 ? '1 uscita' : `${w.runs.length} uscite`;
  }

  /** "dom 27 · lento" — il giorno serve perche' dentro una settimana passata
   *  "domenica" da sola non dice piu' quale. */
  runLineLabel(run: Run): string {
    const d = new Date(run.date + 'T00:00:00');
    const giorno = isNaN(d.getTime())
      ? ''
      : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
    const tipo = RUN_TYPE_LABELS[run.type]?.toLowerCase() ?? '';
    return tipo ? `${giorno} · ${tipo}` : giorno;
  }

  effortColor(effort: RunEffort): string {
    return (EFFORT_STYLE[effort] ?? EFFORT_STYLE.giusta).color;
  }

  effortSize(effort: RunEffort): number {
    return (EFFORT_STYLE[effort] ?? EFFORT_STYLE.giusta).size;
  }

  effortLabel(effort: RunEffort): string {
    return RUN_EFFORT_LABELS[effort] ?? '';
  }

  // --- Azioni ----------------------------------------------------------------

  /**
   * Nuova uscita dentro una settimana. In quella in corso parte da oggi; in una
   * passata parte dalla sua domenica, cosi' il calendario si apre gia' nel
   * punto giusto invece di costringere a girarlo all'indietro.
   */
  addRun(w: WeekGroup): void {
    const date = w.isCurrent ? todayLocalISO() : w.sundayISO;
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { date } });
  }

  editRun(id: string): void {
    this.nav.navigateForward(['/corsa/nuova'], { queryParams: { id } });
  }
}
