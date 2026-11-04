import { describe, expect, it } from 'vitest';
import { Exercise } from '../../models/workout.model';
import {
  RIPETIZIONI_MAX, SERIE_MAX, impostaRipetizioniUguali, impostaSerie, nuovoEsercizio, passoRipetizioni,
  riepilogoSerie, ripetizioniComuni, ripetizioniUguali, settimaneDaProgramma
} from './esercizio.util';

const ex = (sets: number, reps: (number | string)[], extra: Partial<Exercise> = {}): Exercise =>
  ({ name: 'Panca', scheme: 'plain', sets, muscle: 'Petto', reps, ...extra });

/**
 * Serie e ripetizioni dicevano due volte la stessa cosa (il numero di serie e'
 * la lunghezza dell'elenco delle ripetizioni): qui un'informazione sola.
 */
describe('ripetizioniUguali / ripetizioniComuni', () => {
  it('tutte uguali, anche scritte in modo diverso (numero o testo, spazi)', () => {
    expect(ripetizioniUguali(['10', '10', '10'])).toBe(true);
    expect(ripetizioniUguali([10, '10', ' 10 '])).toBe(true);
    expect(ripetizioniUguali(['8-10', '8-10'])).toBe(true);
  });

  it('diverse da serie a serie', () => {
    expect(ripetizioniUguali(['12', '10', '8'])).toBe(false);
    expect(ripetizioniUguali(['10', '10', '12'])).toBe(false);
  });

  it('senza ripetizioni scritte non c\'e\' niente da distinguere', () => {
    expect(ripetizioniUguali(undefined)).toBe(true);
    expect(ripetizioniUguali([])).toBe(true);
    expect(ripetizioniUguali(['', '', ''])).toBe(true);
  });

  it('quelle comuni sono quelle della prima serie', () => {
    expect(ripetizioniComuni(['12', '10'])).toBe('12');
    expect(ripetizioniComuni([8, 8])).toBe('8');
    expect(ripetizioniComuni(undefined)).toBe('');
  });
});

describe('impostaSerie', () => {
  it('con ripetizioni uguali le nuove serie hanno le stesse', () => {
    const e = ex(3, ['10', '10', '10']);
    impostaSerie(e, 5);
    expect(e.sets).toBe(5);
    expect(e.reps).toEqual(['10', '10', '10', '10', '10']);
  });

  it('con ripetizioni diverse tiene quelle che ci sono e copia l\'ultima nelle nuove', () => {
    const e = ex(3, ['12', '10', '8']);
    impostaSerie(e, 5);
    expect(e.reps).toEqual(['12', '10', '8', '8', '8']);
  });

  it('togliendo serie taglia dal fondo', () => {
    const e = ex(4, ['12', '10', '8', '6']);
    impostaSerie(e, 2);
    expect(e.sets).toBe(2);
    expect(e.reps).toEqual(['12', '10']);
  });

  it('il numero resta tra 1 e il tetto, e un valore illeggibile vale 1', () => {
    const e = ex(3, ['10', '10', '10']);
    impostaSerie(e, 0);
    expect(e.sets).toBe(1);
    impostaSerie(e, -4);
    expect(e.sets).toBe(1);
    impostaSerie(e, 999);
    expect(e.sets).toBe(SERIE_MAX);
    expect(e.reps).toHaveLength(SERIE_MAX);
    impostaSerie(e, '');
    expect(e.sets).toBe(1);
    impostaSerie(e, 'boh');
    expect(e.sets).toBe(1);
    impostaSerie(e, 4.9);
    expect(e.sets).toBe(4);
  });

  it('senza ripetizioni le crea vuote, della lunghezza giusta', () => {
    const e = ex(3, []);
    delete e.reps;
    impostaSerie(e, 3);
    expect(e.reps).toEqual(['', '', '']);
  });
});

describe('impostaRipetizioniUguali', () => {
  it('le stesse per ogni serie, tante quante le serie', () => {
    const e = ex(4, ['12', '10', '8', '6']);
    impostaRipetizioniUguali(e, '8-10');
    expect(e.reps).toEqual(['8-10', '8-10', '8-10', '8-10']);
  });
});

describe('passoRipetizioni', () => {
  it('un passo su un intero', () => {
    expect(passoRipetizioni('10', 1)).toBe('11');
    expect(passoRipetizioni(10, -1)).toBe('9');
    expect(passoRipetizioni('12', 2)).toBe('14');
  });

  it('non scende sotto 1 ne\' sale oltre il tetto', () => {
    expect(passoRipetizioni('1', -1)).toBe('1');
    expect(passoRipetizioni(String(RIPETIZIONI_MAX), 1)).toBe(String(RIPETIZIONI_MAX));
  });

  it('da vuoto parte dal valore di partenza (10)', () => {
    expect(passoRipetizioni('', 1)).toBe('11');
    expect(passoRipetizioni(undefined, -1)).toBe('9');
  });

  it('un intervallo o un testo non ha un passo: null', () => {
    expect(passoRipetizioni('8-10', 1)).toBeNull();
    expect(passoRipetizioni('max', -1)).toBeNull();
  });
});

describe('nuovoEsercizio', () => {
  it('senza un esercizio prima: 3 serie da 10, Petto, nome vuoto', () => {
    expect(nuovoEsercizio()).toEqual({ name: '', scheme: 'plain', sets: 3, muscle: 'Petto', reps: ['10', '10', '10'] });
  });

  it('parte da quello che lo precede: serie, ripetizioni e gruppo, non il nome ne\' la nota', () => {
    const prima = ex(4, ['12', '12', '12', '12'], { name: 'Lat machine', muscle: 'Dorso', note: 'in controllo' });
    const n = nuovoEsercizio(prima);
    expect(n).toEqual({ name: '', scheme: 'plain', sets: 4, muscle: 'Dorso', reps: ['12', '12', '12', '12'] });
    // Una copia: cambiare il nuovo non tocca il vecchio.
    n.reps![0] = '5';
    expect(prima.reps![0]).toBe('12');
  });

  it('le ripetizioni diverse da serie a serie si portano dietro cosi\' come sono', () => {
    expect(nuovoEsercizio(ex(3, ['12', '10', '8'])).reps).toEqual(['12', '10', '8']);
  });

  it('un cluster non si porta dietro: e\' l\'eccezione, non quello che viene dopo', () => {
    const cluster = ex(3, ['8+8', '8+8', '8+8'], { cluster: { blocks: [8, 8], restSec: 15, end: 'fixed' } });
    const n = nuovoEsercizio(cluster);
    expect(n.cluster).toBeUndefined();
    expect(n.sets).toBe(3);
    expect(n.reps).toEqual(['10', '10', '10']);
    expect(n.muscle).toBe('Petto');
  });

  it('dopo un esercizio a onda e\' a onda, con la sua progressione copiata', () => {
    const onda = ex(4, ['10', '10', '10', '10'], { scheme: 'wave', weekPlan: [{ sets: 4, reps: '6-8' }, { sets: 3, reps: 10 }] });
    const n = nuovoEsercizio(onda);
    expect(n.scheme).toBe('wave');
    expect(n.weekPlan).toEqual([{ sets: 4, reps: '6-8' }, { sets: 3, reps: 10 }]);
    n.weekPlan![0].reps = 99;
    expect(onda.weekPlan![0].reps).toBe('6-8');
  });

  it('un esercizio prima senza ripetizioni scritte non svuota le serie: restano i valori di partenza', () => {
    const n = nuovoEsercizio(ex(5, ['', '', '', '', '']));
    expect(n.sets).toBe(3);
    expect(n.reps).toEqual(['10', '10', '10']);
  });

  it('senza gruppo nell\'esercizio prima si parte da Petto', () => {
    expect(nuovoEsercizio(ex(3, ['10'], { muscle: '' })).muscle).toBe('Petto');
  });
});

describe('settimaneDaProgramma', () => {
  it('le settimane del programma, copiate', () => {
    const programma = [{ sets: 3, reps: '6-8' }, { sets: 4, reps: 10 }];
    const s = settimaneDaProgramma(programma);
    expect(s).toEqual(programma);
    s[0].sets = 9;
    expect(programma[0].sets).toBe(3);
  });

  it('senza programma, otto settimane da 4x10 come punto di partenza', () => {
    for (const vuoto of [undefined, []]) {
      const s = settimaneDaProgramma(vuoto);
      expect(s).toHaveLength(8);
      expect(s.every(w => w.sets === 4 && w.reps === 10)).toBe(true);
    }
  });
});

describe('riepilogoSerie', () => {
  it('serie uguali: una volta sola, "3×12" e non "3×12-12-12"', () => {
    expect(riepilogoSerie(ex(3, ['12', '12', '12']))).toBe('3×12');
    expect(riepilogoSerie(ex(4, ['8-10', '8-10', '8-10', '8-10']))).toBe('4×8-10');
  });

  it('serie diverse: una per serie', () => {
    expect(riepilogoSerie(ex(3, ['12', '10', '8']))).toBe('3×12-10-8');
  });

  it('senza ripetizioni scritte un punto interrogativo', () => {
    expect(riepilogoSerie(ex(3, ['', '', '']))).toBe('3×?');
    expect(riepilogoSerie(ex(3, []))).toBe('3×?');
  });
});
