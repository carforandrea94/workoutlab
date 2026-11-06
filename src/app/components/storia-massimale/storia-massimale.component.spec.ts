import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PuntoMisura } from '../../core/utils/grafico-andamento.util';
import { ALTEZZA_STORIA, StoriaMassimaleComponent } from './storia-massimale.component';

@Component({
  standalone: true,
  imports: [StoriaMassimaleComponent],
  template: `<app-storia-massimale [storia]="storia()"></app-storia-massimale>`
})
class Prova {
  readonly storia = signal<PuntoMisura[]>([]);
}

/** La linea del massimale nel foglio del carico: una didascalia, il disegno, una descrizione per chi non lo vede. */
describe('StoriaMassimaleComponent', () => {
  const STORIA: PuntoMisura[] = [
    { date: '2026-08-24', value: 24.5 }, { date: '2026-09-07', value: 25.5 }, { date: '2026-09-21', value: 26.8 },
    { date: '2026-10-05', value: 28.3 }, { date: '2026-10-26', value: 29.9 }
  ];

  function monta(storia: PuntoMisura[] = STORIA) {
    const fixture = TestBed.createComponent(Prova);
    fixture.componentInstance.storia.set(storia);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const pulito = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { fixture, root, pulito };
  }

  it('in testa quante sedute e quanto e\' cambiato', () => {
    const { root, pulito } = monta();
    const cap = root.querySelectorAll('.storia-cap span');
    expect(Array.from(cap).map(pulito)).toEqual(['Nelle ultime 5 sedute', '+5,4 kg dal 24 ago']);
  });

  it('e\' un cursore con la sua descrizione, come Andamento; il disegno e\' nascosto', () => {
    const { root } = monta();
    const piano = root.querySelector('.storia-piano')!;
    expect(piano.getAttribute('role')).toBe('slider');
    expect(piano.getAttribute('tabindex')).toBe('0');
    expect(piano.getAttribute('aria-label')).toBe('Massimale stimato nelle ultime 5 sedute: da 24,5 kg il 24 agosto 2026 a 29,9 kg il 26 ottobre 2026');
    expect(piano.getAttribute('aria-valuemin')).toBe('1');
    expect(piano.getAttribute('aria-valuemax')).toBe('5');
    expect(piano.getAttribute('aria-valuenow')).toBe('5');
    expect(piano.getAttribute('aria-valuetext')).toBe('26 ottobre 2026: 29,9 kg');
    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(Number(svg.getAttribute('height'))).toBe(ALTEZZA_STORIA);
    expect(ALTEZZA_STORIA).toBe(150);
  });

  it('una linea, un pallino per seduta e l\'ultimo piu\' grande; sotto le date come in Andamento', () => {
    const { root, pulito } = monta();
    expect(root.querySelectorAll('path.linea').length).toBe(1);
    expect(root.querySelectorAll('circle.pallino:not(.ultimo)').length).toBe(4);
    expect(root.querySelector('circle.pallino.ultimo')!.getAttribute('r')).toBe('5.5');
    const date = Array.from(root.querySelectorAll('text.asse')).map(pulito).filter(t => /[a-z]/.test(t));
    // Oltre un mese e mezzo, l'inizio dei mesi.
    expect(date).toEqual(['set', 'ott']);
    const breve = monta(STORIA.slice(2));
    expect(Array.from(breve.root.querySelectorAll('text.asse')).map(breve.pulito).filter(t => /[a-z]/.test(t))).toEqual(['21 set', '26 ott']);
  });

  it('i segni sono larghi almeno 8 px, anello escluso', () => {
    const { root } = monta();
    for (const c of Array.from(root.querySelectorAll('circle.pallino'))) {
      expect(Number(c.getAttribute('r')) * 2).toBeGreaterThanOrEqual(8);
    }
  });

  describe('si legge una seduta alla volta, come il peso', () => {
    const tasto = (fixture: ReturnType<typeof monta>['fixture'], key: string) => {
      const piano = (fixture.nativeElement as HTMLElement).querySelector('.storia-piano')!;
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      piano.dispatchEvent(ev);
      fixture.detectChanges();
      return ev;
    };
    const cap = (root: HTMLElement, pulito: (e: Element | null) => string) => Array.from(root.querySelectorAll('.storia-cap span')).map(pulito);

    it('a riposo la didascalia racconta tutte le sedute e non c\'e\' il mirino', () => {
      const { root } = monta();
      expect(root.querySelector('line.mirino')).toBeNull();
      expect(root.querySelector('circle.pallino.scelto')).toBeNull();
    });

    it('la freccia a sinistra sceglie la seduta prima: giorno e massimale a sinistra, il cambio dalla prima a destra', () => {
      const { fixture, root, pulito } = monta();
      tasto(fixture, 'ArrowLeft');
      expect(cap(root, pulito)).toEqual(['5 ott · 28,3 kg', '+3,8 kg dal 24 ago']);
      expect(root.querySelector('.storia-piano')!.getAttribute('aria-valuenow')).toBe('4');
      expect(root.querySelector('.storia-piano')!.getAttribute('aria-valuetext')).toBe('5 ottobre 2026: 28,3 kg');
      expect(root.querySelector('line.mirino')).not.toBeNull();
      expect(root.querySelector('circle.pallino.scelto')).not.toBeNull();
    });

    it('Inizio porta alla prima seduta ("prima seduta"), Fine all\'ultima; oltre i bordi non si va', () => {
      const { fixture, root, pulito } = monta();
      tasto(fixture, 'Home');
      expect(cap(root, pulito)).toEqual(['24 ago · 24,5 kg', 'prima seduta']);
      tasto(fixture, 'ArrowLeft');
      expect(cap(root, pulito)[0]).toBe('24 ago · 24,5 kg');
      tasto(fixture, 'End');
      expect(cap(root, pulito)).toEqual(['26 ott · 29,9 kg', '+5,4 kg dal 24 ago']);
      tasto(fixture, 'ArrowRight');
      expect(cap(root, pulito)[0]).toBe('26 ott · 29,9 kg');
    });

    it('Esc torna alla didascalia di tutte le sedute; a riposo non lo ruba a nessuno', () => {
      const { fixture, root, pulito } = monta();
      expect(tasto(fixture, 'Escape').defaultPrevented).toBe(false);
      tasto(fixture, 'ArrowLeft');
      expect(tasto(fixture, 'Escape').defaultPrevented).toBe(true);
      expect(cap(root, pulito)).toEqual(['Nelle ultime 5 sedute', '+5,4 kg dal 24 ago']);
      expect(root.querySelector('line.mirino')).toBeNull();
    });

    it('un tocco sceglie la seduta piu\' vicina e la scelta resta; il mouse legge passando sopra e torna uscendo', () => {
      const { fixture, root, pulito } = monta();
      const piano = root.querySelector<HTMLElement>('.storia-piano')!;
      const xDi = (i: number) => Number(root.querySelectorAll('circle.pallino')[i].getAttribute('cx'));
      const evento = (tipo: string, x: number, puntatore: string) => {
        const ev = new MouseEvent(tipo, { bubbles: true, clientX: x });
        Object.defineProperty(ev, 'pointerType', { value: puntatore });
        Object.defineProperty(ev, 'pointerId', { value: 1 });
        piano.dispatchEvent(ev);
        fixture.detectChanges();
      };
      evento('pointerdown', xDi(1) + 2, 'touch');
      evento('pointerup', 0, 'touch');
      evento('pointerleave', 0, 'touch');
      expect(cap(root, pulito)[0]).toBe('7 set · 25,5 kg');

      evento('pointermove', xDi(2), 'mouse');
      expect(cap(root, pulito)[0]).toBe('21 set · 26,8 kg');
      evento('pointerleave', 0, 'mouse');
      // Il tocco di prima era finito: uscendo col mouse si torna a tutte le sedute.
      expect(cap(root, pulito)).toEqual(['Nelle ultime 5 sedute', '+5,4 kg dal 24 ago']);
    });

    it('cambiando le sedute la scelta riparte dall\'ultima', () => {
      const { fixture, root, pulito } = monta();
      tasto(fixture, 'Home');
      fixture.componentInstance.storia.set(STORIA.slice(1));
      fixture.detectChanges();
      expect(cap(root, pulito)[0]).toBe('Nelle ultime 4 sedute');
      expect(root.querySelector('line.mirino')).toBeNull();
    });
  });

  it('con meno di tre sedute non disegna niente', () => {
    const { root } = monta(STORIA.slice(0, 2));
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('.storia-cap')).toBeNull();
  });
});
