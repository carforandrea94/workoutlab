import { describe, expect, it } from 'vitest';
import {
  ANTICIPO_MINUTI, GIORNI_PREDEFINITI, ORA_PREDEFINITA, Promemoria, elencoGiorni, giornoDellaSettimana,
  normalizzaPromemoria, prossimaSeduta, prossimoPromemoria, quandoArriva, rigaPromemoria
} from './promemoria.util';

/** Lunedi' 26 ottobre 2026, ora locale. */
const lun = (ore: number, minuti = 0, piuGiorni = 0) => new Date(2026, 9, 26 + piuGiorni, ore, minuti);
const p = (giorni: number[], ora = '18:00', attivo = true): Promemoria => ({ attivo, giorni, ora });

describe('normalizzaPromemoria', () => {
  it('quello che manca prende i valori di partenza: spenti, lun mer ven, alle 18', () => {
    expect([GIORNI_PREDEFINITI, ORA_PREDEFINITA]).toEqual([[1, 3, 5], '18:00']);
    expect(normalizzaPromemoria(null)).toEqual({ attivo: false, giorni: [1, 3, 5], ora: '18:00' });
    expect(normalizzaPromemoria({ attivo: 'si', ora: '25:00' })).toEqual({ attivo: false, giorni: [1, 3, 5], ora: '18:00' });
  });

  it('i giorni si tengono in ordine, senza doppioni e senza quelli che non esistono', () => {
    expect(normalizzaPromemoria({ attivo: true, giorni: [5, 1, 5, 0, 8, 2.5, 7], ora: '07:30' }))
      .toEqual({ attivo: true, giorni: [1, 5, 7], ora: '07:30' });
    // Nessun giorno e' una scelta, non un dato rotto.
    expect(normalizzaPromemoria({ giorni: [] }).giorni).toEqual([]);
  });
});

describe('prossimoPromemoria', () => {
  it('mezz\'ora prima dell\'allenamento, nel primo giorno scelto che deve ancora venire', () => {
    expect(ANTICIPO_MINUTI).toBe(30);
    const r = prossimoPromemoria(p([1, 3, 5]), lun(9))!;
    expect(r.allenamento).toEqual(lun(18));
    expect(r.invio).toEqual(lun(17, 30));
  });

  it('passato quello di oggi, il prossimo giorno scelto; anche la settimana dopo', () => {
    expect(prossimoPromemoria(p([1, 3, 5]), lun(17, 30))!.invio).toEqual(lun(17, 30, 2));
    expect(prossimoPromemoria(p([1]), lun(17, 31))!.invio).toEqual(lun(17, 30, 7));
  });

  it('un allenamento poco dopo mezzanotte si ricorda la sera prima', () => {
    const r = prossimoPromemoria(p([2], '00:15'), lun(9))!;
    expect(r.allenamento).toEqual(lun(0, 15, 1));
    expect(r.invio).toEqual(lun(23, 45));
  });

  it('senza giorni, o con un\'ora che non si legge, nessun promemoria', () => {
    expect(prossimoPromemoria(p([]), lun(9))).toBeNull();
    expect(prossimoPromemoria(p([1], '7'), lun(9))).toBeNull();
  });
});

describe('le scritte', () => {
  it('i giorni si contano da lunedi\'', () => {
    expect([giornoDellaSettimana(lun(9)), giornoDellaSettimana(lun(9, 0, 6))]).toEqual([1, 7]);
    expect(elencoGiorni([1, 3, 5])).toBe('lun, mer, ven');
    expect(elencoGiorni([1, 2, 3, 4, 5, 6, 7])).toBe('tutti i giorni');
  });

  it('la riga in Account', () => {
    expect(rigaPromemoria(null)).toBe('Spenti');
    expect(rigaPromemoria(p([1, 3, 5], '18:00', false))).toBe('Spenti');
    expect(rigaPromemoria(p([1, 3, 5]))).toBe('Lun, mer, ven alle 18:00');
    expect(rigaPromemoria(p([1, 2, 3, 4, 5, 6, 7], '07:00'))).toBe('Tutti i giorni alle 07:00');
    expect(rigaPromemoria(p([]))).toBe('Nessun giorno scelto');
  });

  it('quando arriva: oggi, domani, o il nome del giorno', () => {
    expect(quandoArriva(lun(17, 30), lun(9))).toBe('oggi alle 17:30');
    expect(quandoArriva(lun(7, 5, 1), lun(9))).toBe('domani alle 07:05');
    expect(quandoArriva(lun(17, 30, 2), lun(9))).toBe('mercoledì alle 17:30');
  });
});

describe('prossimaSeduta', () => {
  const programma = [{ id: 'd1', label: 'Petto' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }];

  it('la prima non ancora fatta questa settimana, come la scheda', () => {
    expect(prossimaSeduta(programma, new Set())).toEqual({ indice: 0, label: 'Petto' });
    expect(prossimaSeduta(programma, new Set(['d1', 'd3']))).toEqual({ indice: 1, label: 'Schiena' });
  });

  it('tutte fatte, o nessun programma: nessuna', () => {
    expect(prossimaSeduta(programma, new Set(['d1', 'd2', 'd3']))).toBeNull();
    expect(prossimaSeduta([], new Set())).toBeNull();
  });
});
