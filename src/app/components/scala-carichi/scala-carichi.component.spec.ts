import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PuntoScala } from '../../core/utils/scala-carichi.util';
import { ScalaCarichiComponent } from './scala-carichi.component';

@Component({
  standalone: true,
  imports: [ScalaCarichiComponent],
  template: `<app-scala-carichi [punti]="punti()" [massimale]="massimale()"></app-scala-carichi>`
})
class Prova {
  readonly punti = signal<PuntoScala[]>([]);
  readonly massimale = signal<number | null>(126);
}

/** I pesi del foglio su una riga dall'80 al 100%: il caso delle Trazioni. */
describe('ScalaCarichiComponent', () => {
  const TRAZIONI: PuntoScala[] = [
    { chiave: 'piu', kg: 114.7, percento: 91, scelto: true },
    { chiave: 'ultima', kg: 112.2, percento: 89, scelto: false },
    { chiave: 'programma', kg: 107, percento: 85, scelto: false }
  ];

  function monta(punti: PuntoScala[] = TRAZIONI, massimale: number | null = 126) {
    const fixture = TestBed.createComponent(Prova);
    fixture.componentInstance.punti.set(punti);
    fixture.componentInstance.massimale.set(massimale);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    return { fixture, root, q };
  }

  it('con meno di due pesi non disegna niente', () => {
    expect(monta([TRAZIONI[0]]).q('.scala-carichi').length).toBe(0);
    expect(monta([]).q('.scala-carichi').length).toBe(0);
  });

  it('e\' un aiuto per l\'occhio: chi non vede trova gli stessi numeri nelle righe, quindi non si legge due volte', () => {
    expect(monta().q('.scala-carichi')[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('un punto e un\'etichetta per peso, dal piu\' leggero, con i chili come si scrivono qui', () => {
    const { q } = monta();
    expect(q('.scala-punto').length).toBe(3);
    expect(q('.scala-kg:not(.scala-kg-massimale)').map(e => e.textContent!.trim())).toEqual(['107', '112,2', '114,7']);
  });

  it('i punti stanno dove dice la scala: 85 al 25%, 89 al 45%, 91 al 55%', () => {
    const { q } = monta();
    expect(q('.scala-punto').map(e => e.style.left)).toEqual(['25%', '45%', '55%']);
  });

  it('la riga e\' piena dal peso piu\' leggero al piu\' pesante', () => {
    const riempi = monta().q('.scala-riempi')[0];
    expect(riempi.style.left).toBe('25%');
    expect(riempi.style.width).toBe('30%');
  });

  it('il peso nella ruota si distingue', () => {
    const { q } = monta();
    expect(q('.scala-punto.scelto').length).toBe(1);
    expect(q('.scala-punto.scelto')[0].style.left).toBe('55%');
    expect(q('.scala-kg.scelto')[0].textContent!.trim()).toBe('114,7');
  });

  it('due etichette vicine si dividono la riga: 107 e 112,2 distano 20 e stanno sopra, 114,7 e\' a 10 da 112,2 e va sotto', () => {
    const sotto = monta().q('.scala-kg.sotto').map(e => e.textContent!.trim());
    expect(sotto).toEqual(['114,7']);
  });

  it('in fondo il massimale, e sotto dove comincia e dove finisce la riga', () => {
    const { q } = monta();
    expect(q('.scala-kg-massimale')[0].textContent!.trim()).toBe('126');
    expect(q('.scala-assi span').map(e => e.textContent!.trim())).toEqual(['80%', '100% del massimale']);
  });

  it('senza massimale non scrive un numero inventato in fondo', () => {
    expect(monta(TRAZIONI, null).q('.scala-kg-massimale')[0].textContent!.trim()).toBe('');
  });

  it('cambiando i pesi si ridisegna', () => {
    const { fixture, q } = monta();
    fixture.componentInstance.punti.set([TRAZIONI[1], TRAZIONI[2]]);
    fixture.detectChanges();
    expect(q('.scala-punto').length).toBe(2);
  });
});
