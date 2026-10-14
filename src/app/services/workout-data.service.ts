import { Injectable } from '@angular/core';
import { Day, MuscleInfo, WeekPlan, Exercise } from '../models/workout.model';
import { WorkoutProtocol } from '../models/protocol.model';

@Injectable({ providedIn: 'root' })
export class WorkoutDataService {

  WEEK_PLAN: WeekPlan[] = [
    { sets: 4, reps: 10 },
    { sets: 4, reps: 10 },
    { sets: 4, reps: 8 },
    { sets: 4, reps: 8 },
    { sets: 5, reps: 6 },
    { sets: 5, reps: 6 },
    { sets: 4, reps: 10 },
    { sets: 4, reps: 10 }
  ];

  /**
   * Colori dei gruppi muscolari. Due sono cambiati con la palette "Scala":
   *
   * Spalle era #64D2FF, lo stesso ciano diventato accento dell'app: due
   * elementi con la stessa tinta e significati diversi sullo stesso schermo.
   * Spostato sul rosa, l'unica zona di ruota che il set non occupava.
   *
   * Gambe era #5E5CE6, troppo scuro per reggere l'inchiostro delle pastiglie
   * (3,64:1). Schiarito a parita' di tinta.
   *
   * Restano costanti fra i due temi: le pastiglie hanno un inchiostro fisso
   * (--ink-on-vivid) proprio perche' questi non cambiano.
   */
  readonly MUSCLES: Record<string, MuscleInfo> = {
    'Petto':     { color: '#FF9F0A', dim: 'rgba(255,159,10,0.16)' },
    'Spalle':    { color: '#F472B6', dim: 'rgba(244,114,182,0.16)' },
    'Tricipiti': { color: '#BF5AF2', dim: 'rgba(191,90,242,0.16)' },
    'Dorso':     { color: '#0A84FF', dim: 'rgba(10,132,255,0.16)' },
    'Bicipiti':  { color: '#30D158', dim: 'rgba(48,209,88,0.16)' },
    'Gambe':     { color: '#8B89F5', dim: 'rgba(139,137,245,0.16)' },
    'Core':      { color: '#FFD60A', dim: 'rgba(255,214,10,0.16)' }
  };

  DEFAULT_PROGRAM_START = '2026-07-05';
  hasCustomProtocol = false;
  infoNote = '';
  protocolName = '';

  days: Day[] = [];

  /** Applica il protocollo attivo dell'utente, caricato da Firestore. */
  applyProtocol(wp: WorkoutProtocol): void {
    this.days = wp.days;
    this.WEEK_PLAN = wp.weekPlan;
    this.DEFAULT_PROGRAM_START = wp.programStart;
    this.hasCustomProtocol = true;
  }

  /** Nessun protocollo attivo: la scheda torna vuota. */
  clear(): void {
    this.days = [];
    this.hasCustomProtocol = false;
    this.infoNote = '';
    this.protocolName = '';
  }

  getExSetsReps(ex: Exercise, week: number): { sets: number; reps: (number | string)[] } {
    if (ex.scheme === 'wave') {
      const plan = ex.weekPlan && ex.weekPlan.length > 0 ? ex.weekPlan : this.WEEK_PLAN;
      const wp = plan[Math.min(week, plan.length) - 1] ?? plan[0] ?? { sets: 3, reps: 10 };
      return {
        sets: wp.sets,
        reps: Array(wp.sets).fill(wp.reps)
      };
    } else {
      return {
        sets: ex.sets,
        reps: ex.reps ?? Array(ex.sets).fill('')
      };
    }
  }

}
