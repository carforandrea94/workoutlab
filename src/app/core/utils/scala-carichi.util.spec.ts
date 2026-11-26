import { describe, expect, it } from 'vitest';
import { PuntoScala, disegnaScala } from './scala-carichi.util';

const p = (chiave: string, kg: number, percento: number, scelto = false): PuntoScala => ({ chiave, kg, percento, scelto });

/** Il caso delle Trazioni: 107 kg all'85%, 112,2 all'89%, 114,7 al 91% di 126. */
const TRAZIONI = [p('piu', 114.7, 91, true), p('ultima', 112.2, 89), p('programma', 107, 85)];

describe('disegnaScala', () => {
  it('con meno di due pesi non c\'e\' niente da mettere in scala', () => {
    expect(disegnaScala([])).toBeNull();
    expect(disegnaScala([p('ultima', 112.2, 89)])).toBeNull();
  });

  it('una percentuale che non e\' un numero non conta', () => {
    expect(disegnaScala([p('a', 100, 80), p('b', 100, NaN)])).toBeNull();
  });

  it('dall\'80 al 100%: 85 sta al 25, 89 al 45, 91 al 55', () => {
    const s = disegnaScala(TRAZIONI)!;
    expect(s.inizio).toBe(80);
    expect(s.punti.map(q => [q.chiave, q.x])).toEqual([['programma', 25], ['ultima', 45], ['piu', 55]]);
  });

  it('i pesi si scrivono come nell\'app, con la virgola', () => {
    expect(disegnaScala(TRAZIONI)!.punti.map(q => q.testo)).toEqual(['107', '112,2', '114,7']);
  });

  it('la riga e\' piena dal peso piu\' leggero al piu\' pesante', () => {
    const s = disegnaScala(TRAZIONI)!;
    expect([s.da, s.a]).toEqual([25, 55]);
  });

  it('dice qual e\' il peso nella ruota', () => {
    expect(disegnaScala(TRAZIONI)!.punti.filter(q => q.scelto).map(q => q.chiave)).toEqual(['piu']);
  });

  it('un peso sotto l\'80% allunga la riga a un gradino di cinque sotto di lui', () => {
    const s = disegnaScala([p('a', 62, 62), p('b', 100, 80)])!;
    expect(s.inizio).toBe(60);
    // 62 -> (62-60)/40 = 5; 80 -> 50
    expect(s.punti.map(q => q.x)).toEqual([5, 50]);
  });

  it('mai sotto lo zero, e un peso oltre il massimale resta in fondo', () => {
    const s = disegnaScala([p('a', 1, 2), p('b', 130, 103)])!;
    expect(s.inizio).toBe(0);
    expect(s.punti[1].x).toBe(100);
  });

  describe('le etichette', () => {
    it('lontane stanno tutte sopra la riga', () => {
      const s = disegnaScala([p('a', 100, 80), p('b', 105, 90)])!;
      expect(s.punti.map(q => q.sotto)).toEqual([false, false]);
    });

    it('due vicine si dividono: la seconda va sotto', () => {
      // 89 -> 45 e 91 -> 55: distano 10, meno dello spazio di un'etichetta
      const s = disegnaScala([p('ultima', 112.2, 89), p('piu', 114.7, 91)])!;
      expect(s.punti.map(q => [q.chiave, q.sotto])).toEqual([['ultima', false], ['piu', true]]);
    });

    it('vicino al massimale l\'etichetta va sotto: sopra, in fondo, c\'e\' gia\' il suo numero', () => {
      const s = disegnaScala([p('a', 100, 80), p('b', 125, 98)])!;
      expect(s.punti.map(q => q.sotto)).toEqual([false, true]);
    });

    it('con tre vicine nessuna si sovrappone a un\'altra dalla stessa parte', () => {
      const s = disegnaScala([p('a', 1, 88), p('b', 2, 90), p('c', 3, 92)])!;
      for (const lato of [false, true]) {
        const xs = s.punti.filter(q => q.sotto === lato).map(q => q.x);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(16);
      }
    });
  });
});
