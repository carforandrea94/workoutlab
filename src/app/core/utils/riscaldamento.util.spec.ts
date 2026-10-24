import { describe, expect, it } from 'vitest';
import { RAMPA_RISCALDAMENTO, serieDiRiscaldamento } from './riscaldamento.util';

/** Il riscaldamento: il peso sale e le ripetizioni scendono, al 2,5 kg. */
describe('serieDiRiscaldamento', () => {
  it('da 100 kg: 40 x 8, 60 x 5, 80 x 3', () => {
    expect(serieDiRiscaldamento(100)).toEqual([{ kg: 40, reps: 8 }, { kg: 60, reps: 5 }, { kg: 80, reps: 3 }]);
  });

  it('le ripetizioni scendono mentre il peso sale: prima salivano (40% x 3, 60% x 5, 80% x 6)', () => {
    const s = serieDiRiscaldamento(87.5);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].kg).toBeGreaterThan(s[i - 1].kg);
      expect(s[i].reps).toBeLessThan(s[i - 1].reps);
    }
    expect(RAMPA_RISCALDAMENTO.map(p => p.percent)).toEqual([40, 60, 80]);
  });

  it('al 2,5 kg, non al 5: 62,5 kg da\' 25, 37,5, 50', () => {
    expect(serieDiRiscaldamento(62.5).map(s => s.kg)).toEqual([25, 37.5, 50]);
  });

  it('con un carico piccolo i passi uguali non si ripetono, e lo zero non c\'e\'', () => {
    // 6 kg: 2,4 -> 2,5; 3,6 -> 2,5 (gia' preso); 4,8 -> 5.
    expect(serieDiRiscaldamento(6)).toEqual([{ kg: 2.5, reps: 8 }, { kg: 5, reps: 3 }]);
    // 2 kg: 0,8 e 1,2 arrotondano a zero; resta l'80%, 1,6 -> 2,5.
    expect(serieDiRiscaldamento(2)).toEqual([{ kg: 2.5, reps: 3 }]);
  });

  it('senza un carico non c\'e\' riscaldamento', () => {
    expect(serieDiRiscaldamento(0)).toEqual([]);
    expect(serieDiRiscaldamento(-10)).toEqual([]);
    expect(serieDiRiscaldamento(NaN)).toEqual([]);
  });
});
