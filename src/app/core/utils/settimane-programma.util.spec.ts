import { describe, expect, it } from 'vitest';
import { Day, Exercise, WeekPlan } from '../../models/workout.model';
import {
  SETTIMANE_MAX, riepilogoProgressione, ripulisciProgressione, senzaCopieDelProgramma, settimanaInPiu, stessaProgressione
} from './settimane-programma.util';

const piano = (...w: [number | string, number | string][]): WeekPlan[] => w.map(([sets, reps]) => ({ sets: sets as number, reps }));

/**
 * La progressione del programma e' scritta una volta sola: gli esercizi a onda
 * la seguono, e ne hanno una propria solo se si distingue.
 */
describe('stessaProgressione', () => {
  it('uguali: numero o testo non cambia', () => {
    expect(stessaProgressione(piano([4, 10], [3, '6-8']), piano(['4', '10'], [' 3 ', ' 6-8 ']))).toBe(true);
  });

  it('diverse in una settimana, o di lunghezza diversa, o mancanti', () => {
    expect(stessaProgressione(piano([4, 10], [3, 8]), piano([4, 10], [3, 6]))).toBe(false);
    expect(stessaProgressione(piano([4, 10]), piano([4, 10], [3, 8]))).toBe(false);
    expect(stessaProgressione(piano([4, 10]), undefined)).toBe(false);
    expect(stessaProgressione(undefined, piano([4, 10]))).toBe(false);
  });
});

describe('riepilogoProgressione', () => {
  it('tutte uguali: una volta sola', () => {
    expect(riepilogoProgressione(piano([4, 10], [4, 10], [4, 10]))).toBe('3 settimane · 4×10');
  });

  it('che cambiano: dalla prima all\'ultima', () => {
    expect(riepilogoProgressione(piano([4, 10], [4, 8], [3, '6-8']))).toBe('3 settimane · 4×10 → 3×6-8');
  });

  it('una settimana sola al singolare, nessuna a parole', () => {
    expect(riepilogoProgressione(piano([3, 12]))).toBe('1 settimana · 3×12');
    expect(riepilogoProgressione([])).toBe('Nessuna settimana');
    expect(riepilogoProgressione(undefined)).toBe('Nessuna settimana');
  });
});

describe('settimanaInPiu', () => {
  it('come l\'ultima, copiata', () => {
    const p = piano([4, 10], [3, '6-8']);
    const s = settimanaInPiu(p);
    expect(s).toEqual({ sets: 3, reps: '6-8' });
    s.sets = 9;
    expect(p[1].sets).toBe(3);
  });

  it('senza settimane, 4×10', () => {
    expect(settimanaInPiu([])).toEqual({ sets: 4, reps: 10 });
    expect(settimanaInPiu(undefined)).toEqual({ sets: 4, reps: 10 });
  });
});

describe('ripulisciProgressione', () => {
  it('le serie sono interi da 1 al tetto, le ripetizioni numeri o testi', () => {
    const r = ripulisciProgressione([
      { sets: '4' as any, reps: '10' }, { sets: 3.9, reps: ' 6-8 ' }, { sets: 0, reps: 12 }, { sets: 999, reps: 'max' }
    ]);
    expect(r).toEqual([{ sets: 4, reps: 10 }, { sets: 3, reps: '6-8' }, { sets: 1, reps: 12 }, { sets: 20, reps: 'max' }]);
  });

  it('un valore che manca ripete quello della settimana prima, e alla prima ha il valore di partenza', () => {
    const r = ripulisciProgressione([{ sets: '' as any, reps: '' }, { sets: null as any, reps: undefined as any }]);
    expect(r).toEqual([{ sets: 4, reps: 10 }, { sets: 4, reps: 10 }]);
    expect(ripulisciProgressione([{ sets: 3, reps: 8 }, { sets: 'boh' as any, reps: '' }])).toEqual([{ sets: 3, reps: 8 }, { sets: 3, reps: 8 }]);
  });

  it('non piu\' di un anno di settimane', () => {
    const lungo = Array.from({ length: 80 }, () => ({ sets: 3, reps: 10 }));
    expect(ripulisciProgressione(lungo)).toHaveLength(SETTIMANE_MAX);
  });

  it('senza settimane, niente', () => {
    expect(ripulisciProgressione(undefined)).toEqual([]);
    expect(ripulisciProgressione([])).toEqual([]);
  });

  it('non tocca quello che riceve', () => {
    const p = [{ sets: '4' as any, reps: '10' }];
    ripulisciProgressione(p);
    expect(p[0]).toEqual({ sets: '4', reps: '10' });
  });
});

describe('senzaCopieDelProgramma', () => {
  const ex = (name: string, scheme: 'wave' | 'plain', weekPlan?: WeekPlan[]): Exercise =>
    ({ name, scheme, sets: 3, muscle: 'Petto', reps: ['10'], ...(weekPlan ? { weekPlan } : {}) });
  const giorni = (...es: Exercise[]): Day[] => [{ id: 'd1', label: 'Giorno', rec: '90"', ex: es }];
  const programma = piano([4, 10], [4, 8], [3, '6-8']);

  it('toglie la progressione uguale a quella del programma: l\'esercizio la segue', () => {
    const d = giorni(ex('Panca', 'wave', piano([4, 10], [4, 8], [3, '6-8'])), ex('Croci', 'wave', piano(['4', '10'], ['4', '8'], ['3', ' 6-8 '])));
    expect(senzaCopieDelProgramma(d, programma)).toBe(2);
    expect(d[0].ex[0].weekPlan).toBeUndefined();
    expect(d[0].ex[1].weekPlan).toBeUndefined();
  });

  it('quella diversa resta, anche se e\' quasi uguale', () => {
    const quasi = piano([4, 10], [4, 8], [3, 6]);
    const d = giorni(ex('Panca', 'wave', quasi));
    expect(senzaCopieDelProgramma(d, programma)).toBe(0);
    expect(d[0].ex[0].weekPlan).toEqual(quasi);
  });

  it('una progressione vuota non dice niente: si toglie', () => {
    const d = giorni(ex('Panca', 'wave', []));
    expect(senzaCopieDelProgramma(d, programma)).toBe(1);
    expect(d[0].ex[0].weekPlan).toBeUndefined();
  });

  it('gli esercizi che non sono a onda, e quelli che gia\' seguono, non si toccano', () => {
    const d = giorni(ex('Squat', 'plain'), ex('Stacco', 'wave'));
    expect(senzaCopieDelProgramma(d, programma)).toBe(0);
    expect('weekPlan' in d[0].ex[0]).toBe(false);
    expect('weekPlan' in d[0].ex[1]).toBe(false);
  });

  it('un esercizio fisso che si porta una progressione vecchia (era a onda) la tiene: non e\' a onda', () => {
    const d = giorni(ex('Squat', 'plain', piano([4, 10], [4, 8], [3, '6-8'])));
    expect(senzaCopieDelProgramma(d, programma)).toBe(0);
    expect(d[0].ex[0].weekPlan).toBeDefined();
  });

  it('senza progressione del programma niente e\' una copia', () => {
    const d = giorni(ex('Panca', 'wave', piano([4, 10])));
    expect(senzaCopieDelProgramma(d, undefined)).toBe(0);
    expect(senzaCopieDelProgramma(d, [])).toBe(0);
  });
});
