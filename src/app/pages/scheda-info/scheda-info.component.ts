import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkoutStateService } from '../../services/workout-state.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IonButton } from '@ionic/angular';

@Component({
  selector: 'app-scheda-info',
  standalone: true,
  imports: [IonButton, ...IONIC_PAGE, ...IONIC_LINKS, CommonModule],
  templateUrl: './scheda-info.component.html'
})
export class SchedaInfoComponent implements OnInit {
  loadingHistory = true;
  totalWorkouts = 0;
  lastWorkoutDate = '';

  constructor(
    public state: WorkoutStateService,
    public workoutData: WorkoutDataService,
    private sessionsSvc: WorkoutSessionsService,
    private cdr: ChangeDetectorRef
  ) {}

  get weekPlan() { return this.workoutData.WEEK_PLAN; }

  /** Letta dal servizio a ogni giro: se cambia settimana mentre l'app e'
   *  aperta, la pagina si aggiorna invece di restare al giorno dell'apertura. */
  get currentWeek(): number {
    return this.state.currentWeek;
  }

  get hasWaveExercises(): boolean {
    return this.workoutData.days.some(d => d.ex.some(e => e.scheme === 'wave'));
  }

  ngOnInit(): void {
    this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    this.loadingHistory = true;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const all = await Promise.race([this.sessionsSvc.listAll(), timeout]);
      this.totalWorkouts = all.length;
      if (all.length > 0) {
        const date = new Date(all[0].session.date + 'T00:00:00');
        this.lastWorkoutDate = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    } catch (e) {
      console.error('Errore caricamento storico allenamenti:', e);
    } finally {
      this.loadingHistory = false;
      this.cdr.detectChanges();
    }
  }
}
