import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { RestBarComponent } from './rest-bar.component';
import { WorkoutStateService } from '../../services/workout-state.service';

/**
 * La fascia del recupero si guarda di sbieco, in piedi, con il telefono sulla
 * panca: il conto e' il numero piu' grande dello schermo, a fine tempo diventa
 * "Vai" e resta finche' non si fa altro.
 */
describe('RestBarComponent', () => {
  const stato = (parti: Partial<{ show: boolean; remaining: number; finished: boolean; fillPct: number; exName: string | null }> = {}) =>
    ({ show: false, remaining: 90, finished: false, fillPct: 100, exName: null, dayId: null, ...parti });

  function monta(iniziale = stato(), prossima: any = null) {
    const restTimer = signal(iniziale);
    const prossimaSerie = signal<any>(prossima);
    const stop = vi.fn();
    TestBed.configureTestingModule({
      imports: [RestBarComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutStateService, useValue: {
          restTimer, prossimaSerie, stopRestTimer: stop,
          formatTime: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        } }
      ]
    });
    const fixture = TestBed.createComponent(RestBarComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    return { fixture, root, q, restTimer, prossimaSerie, stop };
  }

  describe('senza recupero in corso', () => {
    it('ha una riga sola, che lo dice, e niente conto ne\' X', () => {
      const { q } = monta();
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Nessun recupero in corso');
      expect(q('.restbar-time')).toBeNull();
      expect(q('.restbar-x')).toBeNull();
      expect(q('.restbar-ex')).toBeNull();
    });
  });

  describe('a riposo, con una serie che viene dopo', () => {
    const serie = (parti: object = {}) =>
      ({ esercizio: 'Panca piana con bilanciere', numero: 2, totale: 3, reps: 10, carico: 55, cluster: false, ...parti });

    it('dice qual e\' la prossima serie, coi valori, invece di "nessun recupero"', () => {
      const { q } = monta(stato(), serie());
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Prossima serie');
      expect(q('.restbar-ex')!.textContent!.trim()).toBe('Serie 2 di 3 · 10 × 55 kg · Panca piana con bilanciere');
      expect(q('.restbar-time')).toBeNull();
      expect(q('.restbar-x')).toBeNull();
    });

    it('i numeri vengono prima del nome: e\' il nome che l\'ellissi puo\' tagliare', () => {
      const { q } = monta(stato(), serie({ esercizio: 'X'.repeat(80) }));
      const testo = q('.restbar-ex')!.textContent!.trim();
      expect(testo.startsWith('Serie 2 di 3 · 10 × 55 kg · ')).toBe(true);
    });

    it('i decimali si scrivono con la virgola, come nel resto dell\'app', () => {
      const { q } = monta(stato(), serie({ carico: 52.5, reps: 8 }));
      expect(q('.restbar-ex')!.textContent).toContain('8 × 52,5 kg');
    });

    it('a corpo libero (niente carico) dice solo le ripetizioni', () => {
      const { q } = monta(stato(), serie({ carico: null }));
      expect(q('.restbar-ex')!.textContent).toContain('Serie 2 di 3 · 10 rip. ·');
    });

    it('anche un carico a zero vale come corpo libero', () => {
      const { q } = monta(stato(), serie({ carico: 0 }));
      expect(q('.restbar-ex')!.textContent).toContain('10 rip.');
      expect(q('.restbar-ex')!.textContent).not.toContain('kg');
    });

    it('una serie a cluster non dice numeri: ogni blocco ha i suoi', () => {
      const { q } = monta(stato(), serie({ cluster: true }));
      expect(q('.restbar-ex')!.textContent!.trim()).toBe('Serie 2 di 3 · Panca piana con bilanciere');
    });

    it('senza valori previsti dice solo quale serie', () => {
      const { q } = monta(stato(), serie({ reps: null, carico: null }));
      expect(q('.restbar-ex')!.textContent!.trim()).toBe('Serie 2 di 3 · Panca piana con bilanciere');
    });

    it('segue la serie quando cambia, senza riaprire la pagina', () => {
      const { fixture, q, prossimaSerie } = monta(stato(), serie());
      prossimaSerie.set(serie({ numero: 3, carico: 57.5 }));
      fixture.detectChanges();
      expect(q('.restbar-ex')!.textContent).toContain('Serie 3 di 3 · 10 × 57,5 kg');

      prossimaSerie.set(null);
      fixture.detectChanges();
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Nessun recupero in corso');
      expect(q('.restbar-ex')).toBeNull();
    });

    it('con la prossima serie la fascia ha la sua classe (l\'etichetta non e\' piu\' la sola riga)', () => {
      expect(monta(stato(), serie()).q('.restbar')!.classList.contains('con-prossima')).toBe(true);
    });

    it('senza, la classe non c\'e\'', () => {
      expect(monta().q('.restbar')!.classList.contains('con-prossima')).toBe(false);
    });

    it('durante il recupero vince il recupero: la prossima serie non lo copre', () => {
      const { q } = monta(stato({ show: true, remaining: 72, exName: 'Panca piana' }), serie());
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Recupero');
      expect(q('.restbar-ex')!.textContent!.trim()).toBe('Panca piana');
    });
  });

  describe('durante il recupero', () => {
    const corso = stato({ show: true, remaining: 72, fillPct: 60, exName: 'Panca piana con bilanciere' });

    it('il conto e\' il numero grande, con minuti e secondi', () => {
      const { q } = monta(corso);
      expect(q('.restbar-time')!.textContent!.trim()).toBe('1:12');
      expect(q('.restbar-time')!.getAttribute('role')).toBe('timer');
    });

    it('accanto al conto dice che e\' recupero e da quale esercizio', () => {
      const { q } = monta(corso);
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Recupero');
      expect(q('.restbar-ex')!.textContent!.trim()).toBe('Panca piana con bilanciere');
    });

    it('la X ferma il recupero ed e\' un pulsante con il suo nome', () => {
      const { q, stop } = monta(corso);
      const x = q('.restbar-x')!;
      expect(x.tagName).toBe('BUTTON');
      expect(x.getAttribute('aria-label')).toBe('Ferma il recupero');
      expect(x.classList.contains('tap44')).toBe(true); // bersaglio da 44 attorno a un cerchio da 32

      x.click();

      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('l\'onda ha lo strato acceso ritagliato su quanto manca', () => {
      const { q } = monta(corso);
      expect(q('.restbar-track.lit')!.style.clipPath).toContain('inset(0 40.00% 0 0)');
    });

    it('il conto che scende si aggiorna senza ricreare la fascia', () => {
      const { q, restTimer, fixture } = monta(corso);
      restTimer.set(stato({ show: true, remaining: 71, fillPct: 59, exName: 'Panca piana con bilanciere' }));
      fixture.detectChanges();
      expect(q('.restbar-time')!.textContent!.trim()).toBe('1:11');
    });
  });

  describe('a recupero finito', () => {
    const finito = stato({ show: true, remaining: 0, finished: true, fillPct: 0, exName: 'Panca piana con bilanciere' });

    it('il conto diventa "Vai" e la fascia lo marca come finito', () => {
      const { q } = monta(finito);
      expect(q('.restbar-time')!.textContent!.trim()).toBe('Vai');
      expect(q('.restbar')!.classList.contains('finished')).toBe(true);
      expect(q('.restbar-label')!.textContent!.trim()).toBe('Recupero finito');
    });

    it('resta tutto: la X c\'e\' ancora per toglierlo, e l\'onda e\' tutta verde (niente strato acceso)', () => {
      const { q } = monta(finito);
      expect(q('.restbar-x')).toBeTruthy();
      expect(q('.restbar-track.lit')).toBeTruthy(); // nel DOM, ma nascosto da CSS a recupero finito
    });

    it('lo annuncia ai lettori di schermo, una volta, senza leggere il conto ogni secondo', () => {
      const { q } = monta(finito);
      const annuncio = q('.sr-only')!;
      expect(annuncio.getAttribute('aria-live')).toBe('polite');
      expect(annuncio.textContent).toContain('Recupero finito');
    });

    it('mentre il conto scende non annuncia niente', () => {
      const { q } = monta(stato({ show: true, remaining: 30, fillPct: 30, exName: 'Croci' }));
      expect(q('.sr-only')!.textContent!.trim()).toBe('');
    });
  });
});
