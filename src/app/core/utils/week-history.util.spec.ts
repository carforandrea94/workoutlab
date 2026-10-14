import { buildWeekHistory, weekRangeLabel, addDaysISO, WeekRun } from './week-history.util';
import { Run } from '../../models/run.model';

function run(date: string, durationMin = 40): Run {
  return { date, durationMin, type: 'lento', effort: 'giusta' };
}

function rows(...dates: [string, number?][]): WeekRun[] {
  return dates.map(([date, min], i) => ({ id: 'r' + i, run: run(date, min ?? 40) }));
}

// Martedì 22 settembre 2026 cade nella settimana del lunedì 21.
const OGGI = '2026-09-22';

describe('addDaysISO', () => {
  it('somma giorni', () => {
    expect(addDaysISO('2026-09-21', 6)).toBe('2026-09-27');
  });

  it('sottrae giorni', () => {
    expect(addDaysISO('2026-09-21', -7)).toBe('2026-09-14');
  });

  it('attraversa il cambio di mese', () => {
    expect(addDaysISO('2026-09-28', 6)).toBe('2026-10-04');
  });

  it('attraversa il cambio d\'anno', () => {
    expect(addDaysISO('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('weekRangeLabel', () => {
  it('non ripete il mese quando la settimana non lo cambia', () => {
    expect(weekRangeLabel('2026-09-21')).toBe('21 – 27 set');
  });

  it('lo scrive due volte quando la settimana lo attraversa', () => {
    expect(weekRangeLabel('2026-09-28')).toBe('28 set – 4 ott');
  });
});

describe('buildWeekHistory', () => {
  it('raccoglie le uscite nella loro settimana', () => {
    const h = buildWeekHistory(rows(['2026-09-22', 40], ['2026-09-27', 52]), OGGI, 12);
    expect(h.weeks.length).toBe(1);
    expect(h.weeks[0].runs.length).toBe(2);
    expect(h.weeks[0].minutes).toBe(92);
  });

  it('marca la settimana in corso', () => {
    const h = buildWeekHistory(rows(['2026-09-22'], ['2026-09-15']), OGGI, 12);
    expect(h.weeks[0].isCurrent).toBe(true);
    expect(h.weeks[1].isCurrent).toBe(false);
  });

  it('mette le settimane dalla piu\' recente', () => {
    const h = buildWeekHistory(rows(['2026-09-01'], ['2026-09-22'], ['2026-09-15']), OGGI, 12);
    expect(h.weeks.map(w => w.mondayISO)).toEqual(['2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31']);
  });

  it('dentro la settimana mette le uscite dalla piu\' recente', () => {
    const h = buildWeekHistory(rows(['2026-09-22'], ['2026-09-27'], ['2026-09-24']), OGGI, 12);
    expect(h.weeks[0].runs.map(r => r.run.date)).toEqual(['2026-09-27', '2026-09-24', '2026-09-22']);
  });

  /*
   * Una pausa di tre settimane e' un'informazione: saltarla farebbe sembrare
   * che non ci si sia mai fermati.
   */
  it('tiene le settimane vuote in mezzo', () => {
    const h = buildWeekHistory(rows(['2026-09-22'], ['2026-08-31']), OGGI, 12);
    expect(h.weeks.length).toBe(4);
    expect(h.weeks[1].runs).toEqual([]);
    expect(h.weeks[1].minutes).toBe(0);
    expect(h.weeks[2].runs).toEqual([]);
  });

  // Quelle non sono una pausa: sono il tempo in cui l'app non c'era.
  it('non inventa settimane prima della prima uscita', () => {
    const h = buildWeekHistory(rows(['2026-09-15']), OGGI, 12);
    expect(h.weeks.map(w => w.mondayISO)).toEqual(['2026-09-21', '2026-09-14']);
  });

  it('senza uscite resta la sola settimana in corso', () => {
    const h = buildWeekHistory([], OGGI, 12);
    expect(h.weeks.length).toBe(1);
    expect(h.weeks[0].isCurrent).toBe(true);
    expect(h.weeks[0].minutes).toBe(0);
    expect(h.hidden).toBe(0);
  });

  it('da\' a ogni settimana la sua domenica', () => {
    const h = buildWeekHistory(rows(['2026-09-22']), OGGI, 12);
    expect(h.weeks[0].sundayISO).toBe('2026-09-27');
  });

  describe('il taglio', () => {
    it('tiene le piu\' recenti e conta quelle nascoste', () => {
      const h = buildWeekHistory(rows(['2026-09-22'], ['2026-06-01']), OGGI, 6);
      expect(h.weeks.length).toBe(6);
      expect(h.weeks[0].mondayISO).toBe('2026-09-21');
      expect(h.hidden).toBeGreaterThan(0);
    });

    it('con tutto in vista non nasconde niente', () => {
      const h = buildWeekHistory(rows(['2026-09-22'], ['2026-09-15']), OGGI, 12);
      expect(h.hidden).toBe(0);
    });

    it('a zero non taglia niente', () => {
      const h = buildWeekHistory(rows(['2026-09-22'], ['2026-06-01']), OGGI, 0);
      expect(h.hidden).toBe(0);
      expect(h.weeks.length).toBeGreaterThan(12);
    });
  });

  describe('dati sporchi', () => {
    it('scarta un\'uscita senza data', () => {
      const sporche = [{ id: 'x', run: { date: '', durationMin: 40, type: 'lento', effort: 'giusta' } as Run }];
      const h = buildWeekHistory(sporche, OGGI, 12);
      expect(h.weeks.length).toBe(1);
      expect(h.weeks[0].runs).toEqual([]);
    });

    it('non somma una durata negativa', () => {
      const h = buildWeekHistory([{ id: 'x', run: run('2026-09-22', -10) }], OGGI, 12);
      expect(h.weeks[0].minutes).toBe(0);
    });

    // Non dovrebbe succedere, ma se succede l'uscita non deve sparire.
    it('non perde un\'uscita datata nel futuro', () => {
      const h = buildWeekHistory(rows(['2026-10-05'], ['2026-09-22']), OGGI, 12);
      expect(h.weeks[0].mondayISO).toBe('2026-10-05');
      expect(h.weeks[0].runs.length).toBe(1);
    });
  });
});
