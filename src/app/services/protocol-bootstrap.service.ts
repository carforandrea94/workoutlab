import { Injectable } from '@angular/core';
import { AuthService } from '../core/services/auth.service';
import { ProtocolService } from './protocol.service';
import { WorkoutDataService } from './workout-data.service';
import { DietDataService } from './diet-data.service';
import { WorkoutStateService } from './workout-state.service';
import { RunningStateService } from './running-state.service';

@Injectable({ providedIn: 'root' })
export class ProtocolBootstrapService {
  private loaded = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private auth: AuthService,
    private protocolSvc: ProtocolService,
    private workoutData: WorkoutDataService,
    private dietData: DietDataService,
    private workoutState: WorkoutStateService,
    private runningState: RunningStateService
  ) {
    // Il protocollo lo modifica l'utente stesso: quando cambia quello attivo
    // (o ne viene attivato un altro) Scheda, Dieta e Corsa devono seguirlo.
    this.protocolSvc.changed$.subscribe(() => { void this.reload(); });
  }

  /** Idempotente: la prima volta carica il protocollo attivo e lo applica, poi non rifa' nulla. */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.reload();
  }

  /**
   * Rilegge il protocollo attivo e lo applica. Se non ce n'e' nessuno, svuota
   * quello in memoria: un protocollo eliminato o disattivato non deve restare
   * a schermo. Chiamate ravvicinate condividono la stessa lettura.
   */
  reload(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.load().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private clear(): void {
    this.workoutData.clear();
    this.dietData.applyDiet([]);
    this.runningState.applyGoal(null);
  }

  private async load(): Promise<void> {
    const user = this.auth.currentUser();
    // Senza utente non c'e' niente da caricare, e soprattutto non si segna
    // "caricato": quando l'utente arrivera' il protocollo va letto davvero.
    if (!user) return;

    try {
      const active = await this.protocolSvc.getActive();
      if (active) {
        this.workoutData.applyProtocol(active.workout);
        this.workoutData.infoNote = active.infoNote ?? '';
        this.workoutData.protocolName = active.name ?? '';
        this.dietData.applyDiet(active.diet);
        this.workoutState.recomputeWeek(active.workout.programStart, active.workout.weekPlan.length);
        this.runningState.applyGoal(active.running);
      } else {
        this.clear();
      }
    } catch (e) {
      console.error('Errore caricamento protocollo attivo:', e);
      // In caso di errore resta quello che c'era: l'app resta comunque utilizzabile.
    } finally {
      this.loaded = true;
    }
  }
}
