import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkoutStateService } from '../../services/workout-state.service';

const BAR_COUNT = 72;
const BAR_MIN_PX = 3;
const BAR_MAX_PX = 14;

/**
 * Sagoma dell'onda, in pixel di altezza per ogni tacchetta.
 *
 * E' la somma di tre sinusoidi con frequenze non multiple fra loro: le creste
 * risultano irregolari, come in un tracciato registrato, invece di ripetersi
 * identiche. Viene calcolata una volta sola all'avvio dell'app perche' l'onda
 * e' ferma: durante il recupero non cambia mai forma, cambia solo quante
 * tacchette restano accese. Niente animazione continua, quindi nessun costo
 * di batteria e nessun caso speciale per chi ha ridotto le animazioni.
 */
const WAVE_BARS: number[] = Array.from({ length: BAR_COUNT }, (_, i) => {
  const x = i / (BAR_COUNT - 1);
  const v = Math.sin(x * 22) * 0.55 + Math.sin(x * 7.3 + 1.1) * 0.30 + Math.sin(x * 41 + 2.7) * 0.15;
  return BAR_MIN_PX + Math.abs(v) * (BAR_MAX_PX - BAR_MIN_PX);
});

/**
 * Il recupero, in fondo allo schermo, al posto della barra di navigazione.
 *
 * Prende la sagoma e la posizione della tabbar che sostituisce: durante
 * l'allenamento quello spazio non serve a spostarsi — si sta fermi a
 * recuperare — e serve invece a sapere quanto manca senza cercare la card
 * giusta. Chi deve uscire usa la freccia della navbar.
 *
 * La fascia resta ferma anche quando nessun recupero e' in corso: se andasse
 * e venisse a ogni serie, il fondo dello schermo cambierebbe identita' venti
 * volte per allenamento.
 */
@Component({
  selector: 'app-rest-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tabfade"></div>
    <div class="restbar" [class.running]="running" [class.finished]="timer.finished">
      <div class="restbar-row">
        <span class="restbar-label">{{ label }}</span>
        <span class="restbar-time" *ngIf="running">
          {{ timer.finished ? '✓' : svc.formatTime(timer.remaining) }}
        </span>
        <button class="restbar-x tap44" *ngIf="running" (click)="stop()"
                aria-label="Ferma il recupero">✕</button>
      </div>
      <div class="restbar-bars">
        <div class="restbar-track">
          <span *ngFor="let h of bars" [style.height.px]="h"></span>
        </div>
        <div class="restbar-track lit" *ngIf="running" [style.clip-path]="fillClip">
          <span *ngFor="let h of bars" [style.height.px]="h"></span>
        </div>
      </div>
    </div>
  `,
  styles: [`:host { display: contents; }`]
})
export class RestBarComponent {
  bars = WAVE_BARS;

  constructor(public svc: WorkoutStateService) {}

  get timer() {
    return this.svc.restTimer();
  }

  get running(): boolean {
    return this.timer.show;
  }

  get label(): string {
    if (!this.running) return 'Nessun recupero in corso';
    if (this.timer.finished) return 'Recupero finito — vai!';
    return this.timer.exName ? `Recupero — ${this.timer.exName}` : 'Recupero';
  }

  /**
   * Taglio dello strato acceso: la parte gia' consumata viene ritagliata da
   * destra. Il timer batte una volta al secondo, ma la transizione CSS di 1s
   * lineare su `clip-path` copre esattamente l'intervallo fra due battiti, per
   * cui il bordo scorre di continuo invece di saltare da una tacchetta
   * all'altra — senza far ridisegnare nulla a JS.
   */
  get fillClip(): string {
    return `inset(0 ${(100 - this.timer.fillPct).toFixed(2)}% 0 0)`;
  }

  stop(): void {
    this.svc.stopRestTimer();
  }
}
