import { Injectable, signal, computed } from '@angular/core';
import { RunsService } from './runs.service';
import { Run, RunGoal, normalizeRunGoal } from '../models/run.model';
import { weekTotals, WeekTotals } from '../core/utils/run-math.util';
import { todayLocalISO, mondayISO } from '../core/utils/date.util';

/**
 * Stato della sezione Corsa: le uscite registrate e l'obiettivo settimanale
 * deciso dal coach.
 *
 * Come WeeklyProgressService, tiene le uscite GREZZE e ricava i totali al
 * momento della lettura invece di salvarli gia' sommati: cosi' allo scatto
 * della settimana i conti si azzerano da soli, anche in una PWA lasciata
 * aperta per giorni senza mai rileggere Firestore.
 */
@Injectable({ providedIn: 'root' })
export class RunningStateService {

  /** Uscite salvate, cosi' come arrivano. E' un signal perche' l'app e'
   *  zoneless: e' lui a garantire il ridisegno quando i dati arrivano. */
  readonly runs = signal<{ id: string; run: Run }[]>([]);

  /** Obiettivo dal protocollo attivo. null = il coach non ne ha impostato uno. */
  readonly goal = signal<RunGoal | null>(null);

  readonly loaded = signal(false);

  /** Lunedi' della settimana in corso: cambia da solo al passare dei giorni. */
  readonly weekStart = computed(() => mondayISO(todayLocalISO()));

  readonly thisWeek = computed<WeekTotals>(() =>
    weekTotals(this.runs().map(r => r.run), this.weekStart())
  );

  /** Le uscite di questa settimana, dalla piu' recente: e' l'elenco mostrato sotto l'obiettivo. */
  readonly thisWeekRuns = computed(() => {
    const start = this.weekStart();
    return this.runs().filter(r => r.run?.date && mondayISO(r.run.date) === start);
  });

  private inFlight: Promise<void> | null = null;

  constructor(private runsSvc: RunsService) {}

  applyGoal(goal: Partial<RunGoal> | null | undefined): void {
    // Normalizzato qui, una volta sola: il resto dell'app non deve sapere che
    // esistono protocolli salvati con l'obiettivo in chilometri.
    this.goal.set(goal ? normalizeRunGoal(goal) : null);
  }

  /**
   * Rilegge le uscite. Chiamate ravvicinate condividono la stessa lettura
   * invece di moltiplicarla. In caso di errore l'ultimo elenco noto resta:
   * meglio dei totali vecchi di qualche minuto che una pagina che si svuota.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runsSvc.listAll()
      .then(rows => {
        this.runs.set(rows);
        this.loaded.set(true);
      })
      .catch(e => {
        console.error('Lettura delle uscite di corsa fallita:', e);
      })
      .finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
