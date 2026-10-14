import { Day, WeekPlan } from './workout.model';
import { Diet } from './diet.model';
import { RunGoal, emptyRunGoal } from './run.model';
import { todayLocalISO } from '../core/utils/date.util';

export type ProtocolStatus = 'draft' | 'active' | 'archived';
export type ProtocolSource = 'manual' | 'pdf';

export interface WorkoutProtocol {
  weekPlan: WeekPlan[];
  days: Day[];
  programStart: string; // ISO yyyy-mm-dd, inizio del programma per il calcolo automatico della settimana
}

export interface Protocol {
  id: string;
  /** L'utente a cui appartiene: il protocollo vive sotto users/{userId}/protocols. */
  userId: string;
  name: string;
  status: ProtocolStatus;
  source: ProtocolSource;
  workout: WorkoutProtocol;
  diet: Diet;
  /** Obiettivo di corsa settimanale. Facoltativo: i protocolli creati prima
   *  che la sezione Corsa esistesse non ce l'hanno, e non tutti corrono. Assente = sezione Corsa senza obiettivi, solo registro. */
  running?: RunGoal;
  infoNote: string;
  /** Ultima estrazione da extractDietNotes(dietaText): permette di ricaricare
   *  solo l'integrazione senza perdere le note gia' derivate dalla dieta. */
  dietNotesSource?: string;
  /** Ultimo testo del PDF integrazione (trim): permette di ricaricare solo
   *  la dieta senza perdere le note gia' derivate dall'integrazione. */
  supplementNotesSource?: string;
  createdAt: string;
  updatedAt: string;
}

export function emptyWorkoutProtocol(): WorkoutProtocol {
  return {
    weekPlan: Array.from({ length: 8 }, () => ({ sets: 4, reps: 10 })),
    days: [],
    programStart: todayLocalISO()
  };
}

export function emptyDiet(): Diet {
  return [];
}

export function emptyProtocol(userId: string): Omit<Protocol, 'id'> {
  const now = new Date().toISOString();
  return {
    userId,
    name: 'Nuovo protocollo',
    status: 'draft',
    source: 'manual',
    workout: emptyWorkoutProtocol(),
    diet: emptyDiet(),
    running: emptyRunGoal(),
    infoNote: '',
    createdAt: now,
    updatedAt: now
  };
}
