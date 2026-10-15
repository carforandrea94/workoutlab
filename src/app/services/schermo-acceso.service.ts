import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, InjectionToken, effect } from '@angular/core';
import { WorkoutSessionStateService } from './workout-session-state.service';

/** Quello che serve dell'API Screen Wake Lock: chiedere il blocco e poterlo rilasciare. */
export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(tipo: 'release', cb: () => void): void;
}
export interface WakeLockLike {
  request(tipo: 'screen'): Promise<WakeLockSentinelLike>;
}

/** L'API del browser, o null dove non c'e'. Un token solo per poterla sostituire nei test. */
export const WAKE_LOCK = new InjectionToken<WakeLockLike | null>('wake-lock', {
  providedIn: 'root',
  factory: () =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator
      ? (navigator as unknown as { wakeLock: WakeLockLike }).wakeLock
      : null
});

/**
 * Tiene lo schermo acceso mentre c'e' un allenamento in corso.
 *
 * Il recupero si legge "a un metro", col telefono appoggiato: se fra una serie e
 * l'altra lo schermo si spegne, il timer da 32 px serve a niente proprio quando
 * serve. Dopo una pausa (si e' fermi, non si sta guardando) o a fine sessione il
 * blocco si rilascia: tenere lo schermo acceso a vuoto costa batteria.
 *
 * Il browser rilascia il blocco da solo quando la pagina va in secondo piano, e
 * non lo si puo' richiedere da nascosti: si rifa' alla prima volta che torna
 * visibile. Dove l'API non esiste (o la nega, per batteria scarica) non succede
 * niente: lo schermo si comporta come sempre.
 */
@Injectable({ providedIn: 'root' })
export class SchermoAccesoService {
  private sentinella: WakeLockSentinelLike | null = null;
  private inCorso = false;
  private voluto = false;

  constructor(
    sessione: WorkoutSessionStateService,
    @Inject(WAKE_LOCK) private wakeLock: WakeLockLike | null,
    @Inject(DOCUMENT) private doc: Document
  ) {
    effect(() => {
      const s = sessione.activeSession();
      this.voluto = !!s && !s.pausedAt;
      void this.aggiorna();
    });
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') void this.aggiorna();
    });
  }

  private async aggiorna(): Promise<void> {
    if (!this.wakeLock) return;
    if (!this.voluto) { await this.rilascia(); return; }
    if (this.doc.visibilityState !== 'visible') return;
    if ((this.sentinella && !this.sentinella.released) || this.inCorso) return;

    this.inCorso = true;
    try {
      const s = await this.wakeLock.request('screen');
      // La sessione puo' essere finita mentre si aspettava la risposta.
      if (!this.voluto) { await s.release().catch(() => {}); return; }
      this.sentinella = s;
      s.addEventListener('release', () => { if (this.sentinella === s) this.sentinella = null; });
    } catch {
      // Negato (batteria scarica, impostazioni del sistema): si va avanti senza.
    } finally {
      this.inCorso = false;
    }
    // Lo stato voluto puo' essere cambiato mentre si aspettava.
    if (!this.voluto) await this.rilascia();
  }

  private async rilascia(): Promise<void> {
    const s = this.sentinella;
    this.sentinella = null;
    if (s && !s.released) await s.release().catch(() => {});
  }
}
