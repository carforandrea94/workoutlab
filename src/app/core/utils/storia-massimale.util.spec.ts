import { describe, expect, it } from 'vitest';
import { PUNTI_STORIA, SEDUTE_STORIA, storiaDelMassimale, testiStoria } from './storia-massimale.util';
import { oneRepMaxOf } from './load-estimate.util';

describe('storia del massimale', () => {
  const seduta = (data: string, load: number, reps = 6) => ({ data, sets: [{ load, reps }] });

  it('un punto per seduta, col massimale stimato come quello in testa al foglio', () => {
    const sedute = [seduta('2026-09-19', 70), { data: '2026-09-26', sets: [{ load: 75, reps: 6 }, { load: 60, reps: 12 }] }];
    expect(storiaDelMassimale(sedute)).toEqual([
      { date: '2026-09-19', value: oneRepMaxOf(sedute[0].sets)!.value },
      { date: '2026-09-26', value: oneRepMaxOf(sedute[1].sets)!.value }
    ]);
  });

  it('solo le ultime dieci, dalla piu\' vecchia', () => {
    expect(SEDUTE_STORIA).toBe(10);
    const sedute = Array.from({ length: 12 }, (_, i) => seduta(`2026-08-${String(i + 1).padStart(2, '0')}`, 50 + i));
    const storia = storiaDelMassimale(sedute);
    expect(storia.length).toBe(10);
    expect(storia[0].date).toBe('2026-08-03');
    expect(storia[9].date).toBe('2026-08-12');
  });

  it('le sedute senza una stima, o senza una data, non sono punti', () => {
    const storia = storiaDelMassimale([seduta('2026-09-19', 70), { data: '2026-09-22', sets: [{ load: 70, reps: 40 }] }, seduta('', 80), seduta('2026-09-26', 75)]);
    expect(storia.map(p => p.date)).toEqual(['2026-09-19', '2026-09-26']);
  });
});

describe('le scritte della storia', () => {
  it('sotto i tre punti non c\'e\' linea', () => {
    expect(PUNTI_STORIA).toBe(3);
    expect(testiStoria([{ date: '2026-09-19', value: 80 }, { date: '2026-09-26', value: 82 }])).toBeNull();
  });

  it('quante sedute, quanto e\' cambiato dalla prima e, per lo screen reader, da dove a dove', () => {
    expect(testiStoria([{ date: '2026-08-24', value: 24.5 }, { date: '2026-09-20', value: 26.8 }, { date: '2026-10-26', value: 29.9 }])).toEqual({
      quante: 'Nelle ultime 3 sedute',
      cambio: '+5,4 kg dal 24 ago',
      descrizione: 'Massimale stimato nelle ultime 3 sedute: da 24,5 kg il 24 agosto 2026 a 29,9 kg il 26 ottobre 2026'
    });
  });

  it('in discesa col segno meno, ferma "uguale", e l\'anno quando le sedute lo attraversano', () => {
    expect(testiStoria([{ date: '2026-09-01', value: 90 }, { date: '2026-09-08', value: 88 }, { date: '2026-09-15', value: 87.5 }])!.cambio).toBe('-2,5 kg dal 1 set');
    expect(testiStoria([{ date: '2026-12-20', value: 90 }, { date: '2027-01-03', value: 92 }, { date: '2027-01-10', value: 90 }])!.cambio).toBe('uguale al 20 dic 2026');
  });
});
