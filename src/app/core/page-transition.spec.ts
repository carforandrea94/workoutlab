import { describe, it, expect } from 'vitest';
import { ENTRATA, Fotogramma, USCITA } from './page-transition';

/**
 * La testata non deve restare vuota: il titolo nuovo comincia a farsi vedere
 * mentre il vecchio non e' ancora sparito. Su dissolvenze lineari questo vuol
 * dire che l'entrata parte prima che l'uscita arrivi a zero.
 */
describe('dissolvenze della testata', () => {
  const quando = (frames: Fotogramma[], cond: (o: number) => boolean) => frames.find(f => cond(f.opacity))!.offset;

  it("l'uscita parte quasi piena e arriva a zero", () => {
    expect(USCITA[0].opacity).toBeGreaterThan(0.9);
    expect(USCITA[USCITA.length - 1].opacity).toBe(0);
  });

  it("l'entrata parte quasi invisibile e arriva piena", () => {
    expect(ENTRATA[0].opacity).toBeLessThan(0.1);
    expect(ENTRATA[ENTRATA.length - 1].opacity).toBe(1);
  });

  it("l'entrata comincia a salire prima che l'uscita sia a zero (niente testata vuota)", () => {
    const uscitaFinita = quando(USCITA, o => o === 0);
    // l'ultimo fotogramma "ancora basso" dell'entrata e' il punto da cui sale
    const entrataSale = [...ENTRATA].reverse().find(f => f.opacity < 0.1)!.offset;
    expect(entrataSale).toBeLessThan(uscitaFinita);
  });

  it('gli offset vanno in ordine da 0 a 1', () => {
    for (const frames of [USCITA, ENTRATA]) {
      const offsets = frames.map(f => f.offset);
      expect(offsets[0]).toBe(0);
      expect(offsets[offsets.length - 1]).toBe(1);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    }
  });
});
