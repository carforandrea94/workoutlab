import { describe, it, expect } from 'vitest';
import { parseMinutes, formatMinutes, weekTotals, goalPct } from './run-math.util';
import { Run } from '../../models/run.model';

describe('parseMinutes', () => {
  it('legge il numero secco come minuti', () => {
    expect(parseMinutes('40')).toBe(40);
    expect(parseMinutes(' 90 ')).toBe(90);
  });

  it('legge anche la forma con l\'ora', () => {
    expect(parseMinutes('1:20')).toBe(80);
    expect(parseMinutes('2:00')).toBe(120);
  });

  it('restituisce 0 su quello che non si capisce', () => {
    expect(parseMinutes('')).toBe(0);
    expect(parseMinutes('abc')).toBe(0);
    expect(parseMinutes('1:')).toBe(0);
    expect(parseMinutes('1:20:30')).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('sotto l\'ora resta in minuti', () => {
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(59)).toBe('59 min');
  });

  it('dall\'ora in su passa a ore e minuti', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(80)).toBe('1h 20');
    expect(formatMinutes(125)).toBe('2h 05');
  });

  it('senza tempo non inventa una durata', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(-5)).toBe('0 min');
  });
});

describe('weekTotals', () => {
  const run = (date: string, durationMin: number): Run => ({
    date, durationMin, type: 'lento', effort: 'giusta'
  });

  // 2026-09-07 e' un lunedi'; 2026-09-13 la domenica della stessa settimana.
  const SETTIMANA = '2026-09-07';

  it('somma solo le uscite della settimana indicata', () => {
    const totals = weekTotals([
      run('2026-09-07', 40),
      run('2026-09-10', 35),
      run('2026-09-06', 50)   // domenica precedente: fuori
    ], SETTIMANA);

    expect(totals.runs).toBe(2);
    expect(totals.minutes).toBe(75);
  });

  it('la domenica appartiene alla settimana che inizia sei giorni prima', () => {
    expect(weekTotals([run('2026-09-13', 60)], SETTIMANA).runs).toBe(1);
  });

  it('il lunedi\' successivo apre una settimana nuova: i totali ripartono da zero', () => {
    const totals = weekTotals([run('2026-09-14', 60)], SETTIMANA);
    expect(totals.runs).toBe(0);
    expect(totals.minutes).toBe(0);
  });

  it('senza uscite i totali sono a zero', () => {
    expect(weekTotals([], SETTIMANA)).toEqual({ minutes: 0, runs: 0 });
  });
});

describe('goalPct', () => {
  it('restituisce la percentuale raggiunta', () => {
    expect(goalPct(80, 160)).toBe(50);
  });

  it('si ferma a 100: superare l\'obiettivo non deve far straripare la barra', () => {
    expect(goalPct(240, 160)).toBe(100);
  });

  it('senza obiettivo non c\'e\' percentuale', () => {
    expect(goalPct(80, 0)).toBe(0);
  });
});
