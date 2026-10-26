import { ApplicationRef, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { todayLocalISO } from './utils/date.util';

/** Un secondo dopo mezzanotte: il timer del browser puo' scattare un attimo prima. */
const MARGINE_MS = 1000;

/**
 * Il giorno di oggi, che cambia da solo a mezzanotte.
 *
 * L'app non ha zone.js: lo schermo si ridisegna solo dopo un tocco o un dato
 * nuovo, e Ionic tiene vive le pagine delle tab. A mezzanotte non succede
 * niente dei due, e la Scheda restava a "Domenica" con la settimana vecchia
 * finche' non la si toccava; le corse e la dieta peggio, perche' il giorno lo
 * avevano calcolato una volta sola.
 *
 * Qui il giorno e' un signal: chi lo legge si ricalcola quando cambia. E al
 * cambio si ridisegna tutta l'app, per le pagine che il giorno lo chiedono a
 * ogni lettura (todayLocalISO). Il cambio si guarda a mezzanotte e quando
 * l'app torna in primo piano: su iPhone una PWA in sottofondo e' ferma, e il
 * timer della mezzanotte scatta solo al risveglio.
 */
@Injectable({ providedIn: 'root' })
export class GiornoService {
  /** yyyy-mm-dd, in ora locale. */
  readonly oggi = signal(todayLocalISO());

  private readonly appRef = inject(ApplicationRef);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const controlla = () => this.controlla();
    const visibile = () => { if (document.visibilityState === 'visible') this.controlla(); };
    document.addEventListener('visibilitychange', visibile);
    window.addEventListener('focus', controlla);
    window.addEventListener('pageshow', controlla);
    this.programma();
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', visibile);
      window.removeEventListener('focus', controlla);
      window.removeEventListener('pageshow', controlla);
      if (this.timer) clearTimeout(this.timer);
    });
  }

  /** Se il giorno e' cambiato lo dice a tutti, e ridisegna. Si puo' chiamare quando si vuole. */
  controlla(): void {
    const adesso = todayLocalISO();
    if (adesso !== this.oggi()) {
      this.oggi.set(adesso);
      this.appRef.tick();
    }
    this.programma();
  }

  /** Il prossimo controllo, alla prossima mezzanotte. */
  private programma(): void {
    if (this.timer) clearTimeout(this.timer);
    const ora = new Date();
    const mezzanotte = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() + 1, 0, 0, 0, 0);
    this.timer = setTimeout(() => this.controlla(), mezzanotte.getTime() - ora.getTime() + MARGINE_MS);
  }
}
