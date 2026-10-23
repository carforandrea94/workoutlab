import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsseRagnatela, CAMBIO_MS, NASCITA_MS, RagnatelaComponent, raggioDi } from './ragnatela.component';

const asse = (n: number, v: number): AsseRagnatela =>
  ({ n, nome: `Esercizio ${n}`, v, andamento: v > 0 ? 'su' : v < 0 ? 'giu' : 'pari', testo: '' });

@Component({
  standalone: true,
  imports: [RagnatelaComponent],
  template: `<app-ragnatela [assi]="assi()"></app-ragnatela>`
})
class Prova {
  readonly assi = signal<AsseRagnatela[]>([asse(1, 0.3), asse(2, 0.1), asse(3, -0.1)]);
}

/**
 * La forma di oggi nasce dal tratteggio della volta scorsa e arriva dove si e'
 * arrivati; fra Forza e Volume si trasforma. Il tempo qui lo si porta a mano.
 */
describe('RagnatelaComponent — la forma di oggi si muove', () => {
  let ora = 1000;
  // I fotogrammi chiesti e non ancora disegnati. Anche Angular ne chiede (e ne
  // annulla) per i suoi aggiornamenti: si annulla solo quello indicato.
  let coda = new Map<number, FrameRequestCallback>();
  let prossimo = 0;
  let ridotto = false;

  beforeEach(() => {
    ora = 1000;
    coda = new Map();
    ridotto = false;
    vi.spyOn(performance, 'now').mockImplementation(() => ora);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { coda.set(++prossimo, fn); return prossimo; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { coda.delete(id); });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: ridotto && q.includes('reduce') }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function monta() {
    const fixture = TestBed.createComponent(Prova);
    fixture.detectChanges();
    const punti = () => fixture.nativeElement.querySelector('polygon.rag-oggi').getAttribute('points') as string;
    const tratteggio = () => fixture.nativeElement.querySelector('polygon.rag-prima').getAttribute('points') as string;
    /** Porta il tempo a `t` ms dalla partenza e disegna il fotogramma. */
    const a = (t: number) => {
      ora = 1000 + t;
      const giro = [...coda.values()]; coda = new Map();
      giro.forEach(fn => fn(ora));
      fixture.detectChanges();
    };
    // Raggio del primo vertice (in cima): la sua distanza dal centro.
    const primo = () => { const [, y] = punti().split(' ')[0].split(',').map(Number); return 148 - y; };
    return { fixture, punti, tratteggio, a, primo };
  }

  it('parte dal tratteggio della volta scorsa', () => {
    const { punti, tratteggio } = monta();
    expect(punti()).toBe(tratteggio());
  });

  it('si allarga decelerando e alla fine e\' al suo posto', () => {
    const { a, primo } = monta();
    a(NASCITA_MS * 0.25);
    const quarto = primo();
    a(NASCITA_MS * 0.5);
    const meta = primo();
    // Parte decisa: nel primo quarto fa piu' strada che nel secondo.
    expect(quarto - raggioDi(0)).toBeGreaterThan(meta - quarto);
    expect(meta).toBeLessThan(raggioDi(0.3));
    a(NASCITA_MS);
    expect(primo()).toBeCloseTo(raggioDi(0.3), 0);
  });

  it('fra Forza e Volume si trasforma da una forma all\'altra, piu\' in fretta', () => {
    const { fixture, a, primo } = monta();
    a(NASCITA_MS);
    fixture.componentInstance.assi.set([asse(1, -0.2), asse(2, 0.1), asse(3, -0.1)]);
    fixture.detectChanges();
    // Riparte da dov'era, non dal tratteggio.
    expect(primo()).toBeCloseTo(raggioDi(0.3), 0);
    a(NASCITA_MS + CAMBIO_MS / 2);
    expect(primo()).toBeLessThan(raggioDi(0.3));
    expect(primo()).toBeGreaterThan(raggioDi(-0.2));
    a(NASCITA_MS + CAMBIO_MS);
    expect(primo()).toBeCloseTo(raggioDi(-0.2), 0);
  });

  it('cambiando idea a meta\' riparte da dove si trova, senza salti', () => {
    const { fixture, a, primo } = monta();
    a(NASCITA_MS / 4);
    const qui = primo();
    fixture.componentInstance.assi.set([asse(1, 0.1), asse(2, 0.1), asse(3, -0.1)]);
    fixture.detectChanges();
    expect(primo()).toBeCloseTo(qui, 0);
  });

  it('con "riduci movimento" e\' gia\' al suo posto', () => {
    ridotto = true;
    const { primo } = monta();
    expect(primo()).toBeCloseTo(raggioDi(0.3), 0);
  });

  it('lasciata la pagina il fotogramma che aspettava viene annullato', () => {
    const { fixture, a } = monta();
    a(NASCITA_MS / 4);
    const inCoda = new Set(coda.keys());
    fixture.destroy();
    expect([...inCoda].some(id => !coda.has(id))).toBe(true);
  });
});
