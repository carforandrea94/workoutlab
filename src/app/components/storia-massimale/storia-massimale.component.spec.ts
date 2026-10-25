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

  it('il disegno e\' un\'immagine con la sua descrizione, alta quanto deve', () => {
    const { root } = monta();
    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Massimale stimato nelle ultime 5 sedute: da 24,5 kg il 24 agosto 2026 a 29,9 kg il 26 ottobre 2026');
    expect(Number(svg.getAttribute('height'))).toBe(ALTEZZA_STORIA);
    expect(ALTEZZA_STORIA).toBe(150);
  });

  it('una linea, un pallino per seduta e l\'ultimo piu\' grande; sotto le date come in Andamento', () => {
    const { root, pulito } = monta();
    expect(root.querySelectorAll('path.linea').length).toBe(1);
    expect(root.querySelectorAll('circle.pallino:not(.ultimo)').length).toBe(4);
    expect(root.querySelector('circle.pallino.ultimo')!.getAttribute('r')).toBe('4.5');
    const date = Array.from(root.querySelectorAll('text.asse')).map(pulito).filter(t => /[a-z]/.test(t));
    // Oltre un mese e mezzo, l'inizio dei mesi.
    expect(date).toEqual(['set', 'ott']);
    const breve = monta(STORIA.slice(2));
    expect(Array.from(breve.root.querySelectorAll('text.asse')).map(breve.pulito).filter(t => /[a-z]/.test(t))).toEqual(['21 set', '26 ott']);
  });

  it('con meno di tre sedute non disegna niente', () => {
    const { root } = monta(STORIA.slice(0, 2));
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('.storia-cap')).toBeNull();
  });
});
