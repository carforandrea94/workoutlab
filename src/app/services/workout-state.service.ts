import { Injectable, signal, effect } from '@angular/core';
import { AppStateService } from './app-state.service';
import { AuthService } from '../core/services/auth.service';
import { isIosSafariNotStandalone } from '../core/utils/platform.util';
import { todayLocalISO, mondayOf } from '../core/utils/date.util';

export interface RestTimerState {
  show: boolean;
  remaining: number;
  finished: boolean;
  fillPct: number;
  /** Nome dell'esercizio da cui e' partito il recupero, come lo si legge nella
   *  scheda: la fascia in fondo lo mostra, cosi' a meta' allenamento si sa da
   *  cosa si sta recuperando senza tornare a cercarlo. */
  exName: string | null;
  /** Giorno da cui e' partito il recupero. La fascia si vede solo dentro
   *  l'allenamento in corso: un timer di un altro giorno resterebbe acceso
   *  senza essere disegnato da nessuna parte, e senza modo di fermarlo. */
  dayId: string | null;
}

export type WorkoutViewMode = 'list' | 'slider';
export type SaveWorkoutStatus = 'idle' | 'saving' | 'saved' | 'err';

const REST_DURATION = 90;
const VIEW_MODE_CACHE_KEY = 'schedaViewMode';

@Injectable({ providedIn: 'root' })
export class WorkoutStateService {

  DEFAULT_PROGRAM_START = '2026-07-05';
  /** Numero di settimane del protocollo: e' il tetto della settimana corrente. */
  private programWeeks = 8;

  /**
   * Settimana di protocollo di OGGI, ricalcolata a ogni lettura.
   *
   * Prima era un campo, calcolato all'avvio del servizio e all'arrivo del
   * protocollo: se l'app restava aperta a cavallo del cambio settimana — cosa
   * normale in una PWA, che spesso viene solo sospesa e ripresa — il numero
   * restava fermo a quello del giorno in cui era stata aperta. Da li' due
   * effetti visibili: l'indicatore della settimana non avanzava e le spunte
   * degli allenamenti, che confrontano la data delle sedute con questo numero,
   * non si azzeravano.
   */
  get currentWeek(): number {
    return this.computeAutoWeek(this.DEFAULT_PROGRAM_START, this.programWeeks);
  }

  restTimer = signal<RestTimerState>({
    show: false, remaining: REST_DURATION, finished: false, fillPct: 100, exName: null, dayId: null
  });

  /**
   * Vista lista/slider della scheda giornaliera: inizializzata dalla cache
   * locale per evitare un flash alla vista di default prima che l'account
   * (Firestore) risponda, poi allineata al valore salvato sull'account.
   */
  viewMode = signal<WorkoutViewMode>(
    localStorage.getItem(VIEW_MODE_CACHE_KEY) === 'slider' ? 'slider' : 'list'
  );

  /**
   * Stato del salvataggio allenamento, mostrato dalla card di chiusura
   * sessione nella pagina allenamento.
   */
  saveStatus = signal<SaveWorkoutStatus>('idle');

  private ticker: ReturnType<typeof setInterval> | null = null;
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;
  private restEndAt = 0;
  private restDuration = REST_DURATION;
  private restFinishedHandled = false;
  private restExName: string | null = null;
  private restDayId: string | null = null;

  constructor(private appState: AppStateService, private auth: AuthService) {

    // Aspetta che l'autenticazione sia risolta prima di leggere l'account:
    // altrimenti currentUser() e' ancora null (crash) all'avvio dell'app.
    effect(() => {
      if (!this.auth.authReady() || !this.auth.currentUser()) return;
      this.appState.load().then(state => {
        if (state.workoutViewMode && state.workoutViewMode !== this.viewMode()) {
          this.viewMode.set(state.workoutViewMode);
          localStorage.setItem(VIEW_MODE_CACHE_KEY, state.workoutViewMode);
        }
      }).catch(e => console.error('Lettura dello stato utente fallita:', e));
    });

    // iOS sospende l'esecuzione JS quando l'app va in background: il
    // setInterval del timer di recupero puo' restare fermo per minuti. Il
    // conto alla rovescia e' calcolato da un timestamp reale (non da tick
    // contati), cosi' al rientro in app lo stato e' subito corretto; questo
    // listener forza il ricalcolo immediato invece di aspettare il prossimo
    // tick, cosi' vibrazione/banner scattano appena riapri l'app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ticker) this.restTick();
    });
  }

  setViewMode(mode: WorkoutViewMode): void {
    if (this.viewMode() === mode) return;
    this.viewMode.set(mode);
    localStorage.setItem(VIEW_MODE_CACHE_KEY, mode);
    this.appState.patchField('workoutViewMode', mode).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  /** Registra inizio e durata del protocollo attivo: la settimana corrente si
   *  ricalcola da li' a ogni lettura di `currentWeek`. */
  recomputeWeek(programStart: string, maxWeeks = 8): void {
    this.DEFAULT_PROGRAM_START = programStart;
    this.programWeeks = maxWeeks;
  }

  /**
   * Numero di settimana del protocollo per una data qualsiasi (non solo oggi),
   * senza clamp: un risultato <= 0 indica una data precedente all'inizio del
   * programma, un risultato oltre maxWeeks e' legittimo. Usato per raggruppare
   * lo storico e per decidere quali allenamenti risultano fatti "questa
   * settimana".
   *
   * La settimana e' quella del CALENDARIO, da lunedi' a domenica: si contano i
   * lunedi', non i giorni passati dall'inizio. Prima si contavano blocchi di
   * sette giorni a partire dalla data di inizio del protocollo, che pero' non
   * cade per forza di lunedi': con un inizio di domenica le settimane correvano
   * da domenica a sabato, il numero scattava a meta' settimana e le spunte si
   * azzeravano in un giorno qualsiasi.
   */
  weekNumberForDate(dateISO: string, programStart: string): number {
    const days = (mondayOf(dateISO).getTime() - mondayOf(programStart).getTime()) / 86400000;
    return Math.round(days / 7) + 1;
  }

  private computeAutoWeek(startISO: string, maxWeeks = 8): number {
    const week = this.weekNumberForDate(todayLocalISO(), startISO);
    return Math.min(Math.max(week, 1), maxWeeks);
  }

  startRestTimer(durationSeconds?: number, exName: string | null = null, dayId: string | null = null): void {
    this.stopRestTimer();
    this.requestNotificationPermission();
    this.restExName = exName;
    this.restDayId = dayId;
    this.restDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : REST_DURATION;
    this.restEndAt = Date.now() + this.restDuration * 1000;
    this.restFinishedHandled = false;

    this.restTick();
    this.ticker = setInterval(() => this.restTick(), 1000);
  }

  private restTick(): void {
    const remaining = Math.max(0, Math.ceil((this.restEndAt - Date.now()) / 1000));
    const fillPct = Math.max((remaining / this.restDuration) * 100, 0);
    this.restTimer.set({
      show: true, remaining, finished: remaining <= 0, fillPct,
      exName: this.restExName, dayId: this.restDayId
    });

    if (remaining <= 0 && !this.restFinishedHandled) {
      this.restFinishedHandled = true;
      if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      this.notifyRestFinished();
      this.closeTimeout = setTimeout(() => this.stopRestTimer(), 4000);
    }
  }

  /** Richiede il permesso di notifica alla prima partenza del timer di recupero; e' un no-op se gia' concesso/negato. */
  private requestNotificationPermission(): void {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    // Su iOS da scheda Safari (non installata in Home Screen) il permesso non
    // verrebbe comunque mai concesso davvero: evita di chiederlo a vuoto.
    if (isIosSafariNotStandalone()) return;
    Notification.requestPermission().catch(() => { /* l'utente puo' sempre negare/ignorare il prompt */ });
  }

  /**
   * Notifica di sistema a fine recupero, utile quando l'utente ha messo l'app
   * in background (schermo bloccato, altra app in primo piano): se l'app e'
   * gia' visibile basta il banner interno, non serve raddoppiare l'avviso.
   */
  private notifyRestFinished(): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    const title = 'Recupero finito!';
    const options: NotificationOptions = {
      body: 'Torna al tuo allenamento 💪',
      icon: '/icons/icon-192x192.png',
      tag: 'rest-timer'
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, options))
        .catch(() => new Notification(title, options));
    } else {
      new Notification(title, options);
    }
  }

  stopRestTimer(): void {
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
    this.restFinishedHandled = false;
    this.restExName = null;
    this.restDayId = null;
    this.restTimer.set({
      show: false, remaining: REST_DURATION, finished: false, fillPct: 100, exName: null, dayId: null
    });
  }

  formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
