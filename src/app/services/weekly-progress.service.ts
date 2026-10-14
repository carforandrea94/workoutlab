import { Injectable, signal } from '@angular/core';
import { WorkoutSessionsService } from './workout-sessions.service';
import { todayLocalISO, mondayISO } from '../core/utils/date.util';

/** Il minimo che serve per decidere se un giorno e' gia' stato fatto. */
interface SessionMark {
  dayId: string;
  date: string;
}

/**
 * Quali allenamenti sono gia' stati fatti nella settimana in corso.
 *
 * Vive in un servizio e non dentro la pagina perche' la pagina viene ricreata
 * piu' spesso di quanto sembri (ritorno sulla scheda, rinnovo del token
 * Firebase): una nuova istanza ripartirebbe senza spunte finche' la sua
 * lettura non risponde, e per sempre se quella lettura fallisce.
 *
 * Tiene le sedute GREZZE e ricava la spunta al momento della lettura, invece
 * di salvare un insieme gia' calcolato: cosi' al cambio di settimana le spunte
 * si azzerano da sole anche senza rileggere niente, che e' quello che serve a
 * una PWA lasciata aperta per giorni.
 *
 * La settimana e' quella di CALENDARIO, confrontata lunedi' contro lunedi'.
 * Prima si confrontava il NUMERO di settimana del protocollo, che pero' e'
 * limitato alla durata del programma: finito il protocollo il numero restava
 * fermo all'ultima settimana, e da li' in poi le sedute nuove cadevano sempre
 * in una settimana diversa da quella "corrente" — nessuna spunta compariva
 * piu', mentre quelle dell'ultima settimana del programma restavano accese per
 * sempre. Il lunedi' non ha un tetto: funziona anche fuori dal protocollo.
 */
@Injectable({ providedIn: 'root' })
export class WeeklyProgressService {

  /** Sedute salvate, cosi' come arrivano: e' un signal perche' l'app e'
   *  zoneless ed e' lui a garantire il ridisegno quando i dati arrivano. */
  private saved = signal<SessionMark[]>([]);
  private inFlight: Promise<void> | null = null;

  constructor(private sessions: WorkoutSessionsService) {}

  /**
   * Rilegge le sedute. Chiamate ravvicinate condividono la stessa lettura
   * invece di moltiplicarla. In caso di errore l'ultimo elenco noto resta:
   * meglio una spunta vecchia di qualche minuto che una lista che si svuota.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.sessions.listAll()
      .then(rows => {
        // Una seduta senza giorno o senza data non dice niente: si scarta qui,
        // cosi' chi legge piu' avanti non deve difendersi.
        const marks: SessionMark[] = [];
        for (const { session } of rows) {
          if (session?.dayId && session?.date) marks.push({ dayId: session.dayId, date: session.date });
        }
        this.saved.set(marks);
      })
      .catch(e => {
        console.error('Lettura delle sedute per le spunte settimanali fallita:', e);
      })
      .finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  /** true se il giorno ha almeno una seduta salvata nella settimana corrente. */
  isDone(dayId: string): boolean {
    const week = mondayISO(todayLocalISO());
    return this.saved().some(s => s.dayId === dayId && mondayISO(s.date) === week);
  }

  /** Tutti i giorni gia' fatti in questa settimana. */
  doneDayIds(): ReadonlySet<string> {
    const week = mondayISO(todayLocalISO());
    const done = new Set<string>();
    for (const s of this.saved()) {
      if (mondayISO(s.date) === week) done.add(s.dayId);
    }
    return done;
  }
}
