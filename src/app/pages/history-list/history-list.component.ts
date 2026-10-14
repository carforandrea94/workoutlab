import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { WorkoutSession } from '../../models/workout.model';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { IONIC_PAGE, IONIC_REFRESH, IONIC_SLIDING, completaRefresh } from '../../core/ionic-page';
import { NavController, IonSpinner } from '@ionic/angular';

interface SessionEntry {
  key: string;
  session: WorkoutSession;
  displayDate: string;
  completedSets: number;
  weekNumber: number;
}

interface WeekGroup {
  label: string;
  entries: SessionEntry[];
}

@Component({
  selector: 'app-history-list',
  standalone: true,
  imports: [IonSpinner, ...IONIC_PAGE, ...IONIC_REFRESH, ...IONIC_SLIDING, CommonModule, LucideAngularModule],
  templateUrl: './history-list.component.html'
})
export class HistoryListComponent implements OnInit {
  sessions: SessionEntry[] = [];
  weekGroups: WeekGroup[] = [];
  loading = true;
  errorMsg = '';

  constructor(
    private sessionsSvc: WorkoutSessionsService,
    private state: WorkoutStateService,
    private confirm: ConfirmDialogService,
    private nav: NavController,
    private cdr: ChangeDetectorRef,
    public sessionState: WorkoutSessionStateService
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.loadSessions(true));
  }

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i dati possono essere cambiati altrove (salvataggi, eliminazioni). */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.loadSessions();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    this.loadSessions();
  }

  /** `silenzioso`: il gesto "tira per aggiornare" rilegge senza far sparire l'elenco dietro lo spinner. */
  async loadSessions(silenzioso = false): Promise<void> {
    if (!silenzioso) this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const all = await Promise.race([this.sessionsSvc.listAll(), timeout]);
      this.sessions = all.map(({ id, session }) => {
        const date = new Date(session.date + 'T00:00:00');
        const displayDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const completedSets = session.exercises.reduce((acc, ex) =>
          acc + ex.sets.filter(s => s.done).length, 0);
        const weekNumber = this.state.weekNumberForDate(session.date, this.state.DEFAULT_PROGRAM_START);
        return { key: id, session, displayDate, completedSets, weekNumber };
      });
      this.weekGroups = this.groupByWeek(this.sessions);
    } catch (e: any) {
      console.error('Errore caricamento storico allenamenti:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento dello storico. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private groupByWeek(entries: SessionEntry[]): WeekGroup[] {
    const byWeek = new Map<number, SessionEntry[]>();
    const others: SessionEntry[] = [];

    for (const entry of entries) {
      if (entry.weekNumber < 1) {
        others.push(entry);
      } else {
        const list = byWeek.get(entry.weekNumber) ?? [];
        list.push(entry);
        byWeek.set(entry.weekNumber, list);
      }
    }

    const groups: WeekGroup[] = Array.from(byWeek.keys())
      .sort((a, b) => b - a)
      .map(week => ({ label: `Settimana ${week}`, entries: byWeek.get(week)! }));

    if (others.length > 0) {
      groups.push({ label: 'Altre sedute', entries: others });
    }

    return groups;
  }

  goToDetail(key: string): void {
    this.nav.navigateForward(['/scheda/storico', encodeURIComponent(key)]);
  }

  async deleteSession(key: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.confirm.confirm('Eliminare questa seduta dallo storico?');
    if (!confirmed) return;
    const ok = await this.sessionsSvc.delete(key);
    if (ok) {
      await this.loadSessions();
    } else {
      this.errorMsg = 'Errore durante l\'eliminazione. Riprova.';
      this.cdr.detectChanges();
    }
  }
}
