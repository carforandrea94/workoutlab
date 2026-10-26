import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GiornoService } from '../core/giorno.service';
import { RunningStateService } from './running-state.service';
import { RunsService } from './runs.service';

/**
 * I totali della settimana si ricavano al momento: a mezzanotte fra domenica e
 * lunedi' si azzerano da soli, senza rileggere niente. Il computed del lunedi'
 * prima chiedeva il giorno all'orologio e restava fermo alla settimana in cui
 * si era aperta l'app.
 */
describe('RunningStateService — la settimana in corso', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('a mezzanotte la settimana nuova parte vuota, e quella vecchia non conta piu\'', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    // Domenica 25 ottobre, mezzo minuto prima di mezzanotte.
    vi.setSystemTime(new Date(2026, 9, 25, 23, 59, 30));
    TestBed.configureTestingModule({ providers: [{ provide: RunsService, useValue: { listAll: async () => [] } }] });
    const s = TestBed.inject(RunningStateService);
    s.runs.set([
      { id: 'r1', run: { date: '2026-10-21', durationMin: 30 } as any },
      { id: 'r2', run: { date: '2026-10-25', durationMin: 40 } as any }
    ]);
    expect(s.weekStart()).toBe('2026-10-19');
    expect(s.thisWeek()).toMatchObject({ minutes: 70, runs: 2 });
    expect(s.thisWeekRuns().map(r => r.id)).toEqual(['r1', 'r2']);

    vi.advanceTimersByTime(31_000);
    expect(s.weekStart()).toBe('2026-10-26');
    expect(s.thisWeek()).toMatchObject({ minutes: 0, runs: 0 });
    expect(s.thisWeekRuns()).toEqual([]);
  });

  it('segue il giorno di GiornoService, anche quando cambia al risveglio', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 22, 0));
    TestBed.configureTestingModule({ providers: [{ provide: RunsService, useValue: { listAll: async () => [] } }] });
    const s = TestBed.inject(RunningStateService);
    expect(s.weekStart()).toBe('2026-10-19');
    vi.setSystemTime(new Date(2026, 10, 3, 8, 0));
    TestBed.inject(GiornoService).controlla();
    expect(s.weekStart()).toBe('2026-11-02');
  });
});
