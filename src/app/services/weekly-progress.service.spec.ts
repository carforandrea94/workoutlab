import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WeeklyProgressService } from './weekly-progress.service';

// La settimana corrente ora si ricava dall'orologio, non da un numero passato
// dal chiamante: i test spostano la data di sistema invece di un parametro.
// 2026-07-13 e 2026-07-19 sono lunedi' e domenica della stessa settimana.
function oggiE(dateISO: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(dateISO + 'T09:00:00'));
}

function makeService(opts: { sessions?: any[] } = {}) {
  const listAll = vi.fn(() =>
    Promise.resolve((opts.sessions ?? []).map((session, i) => ({ id: `s${i}`, session }))));
  const sessions = { listAll } as any;
  const service = TestBed.runInInjectionContext(() => new WeeklyProgressService(sessions));
  return { service, listAll };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WeeklyProgressService', () => {
  it('segna solo i giorni allenati nella settimana corrente', async () => {
    oggiE('2026-07-15');
    const { service } = makeService({
      sessions: [
        { dayId: 'day1', date: '2026-07-13' },  // lunedi' di questa settimana
        { dayId: 'day3', date: '2026-07-19' },  // domenica di questa settimana
        { dayId: 'day2', date: '2026-07-12' }   // domenica precedente: non deve comparire
      ]
    });

    await service.refresh();

    expect(service.isDone('day1')).toBe(true);
    expect(service.isDone('day3')).toBe(true);
    expect(service.isDone('day2')).toBe(false);
  });

  it('al cambio di settimana le spunte si azzerano da sole, senza rileggere', async () => {
    oggiE('2026-07-15');
    const { service, listAll } = makeService({ sessions: [{ dayId: 'day1', date: '2026-07-14' }] });
    await service.refresh();
    expect(service.isDone('day1')).toBe(true);

    // Scatta la settimana mentre l'app e' aperta: nessuna nuova lettura, ma la
    // spunta deve sparire lo stesso perche' e' ricavata al momento.
    vi.setSystemTime(new Date('2026-07-20T09:00:00'));

    expect(service.isDone('day1')).toBe(false);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it('le spunte continuano a funzionare dopo l\'ultima settimana del protocollo', async () => {
    // Un protocollo di 8 settimane partito il 2026-07-06 finisce il 2026-08-30.
    // Qui siamo a novembre, ben oltre: la seduta di oggi deve comunque
    // spuntarsi, e quella dell'ultima settimana del programma no.
    oggiE('2026-11-04');
    const { service } = makeService({
      sessions: [
        { dayId: 'day1', date: '2026-11-04' },  // oggi
        { dayId: 'day2', date: '2026-08-25' }   // ultima settimana del protocollo
      ]
    });

    await service.refresh();

    expect(service.isDone('day1')).toBe(true);
    expect(service.isDone('day2')).toBe(false);
  });

  it('una lettura fallita non cancella le spunte gia\' note', async () => {
    oggiE('2026-07-15');
    const { service } = makeService({ sessions: [{ dayId: 'day1', date: '2026-07-14' }] });
    await service.refresh();
    expect(service.isDone('day1')).toBe(true);

    // La rilettura fallisce (rete assente, token in rinnovo): il valore resta.
    (service as any).sessions.listAll = () => Promise.reject(new Error('offline'));
    await service.refresh();

    expect(service.isDone('day1')).toBe(true);
  });

  it('lo stesso giorno fatto due volte conta una volta sola', async () => {
    oggiE('2026-07-15');
    const { service } = makeService({
      sessions: [{ dayId: 'day1', date: '2026-07-13' }, { dayId: 'day1', date: '2026-07-15' }]
    });

    await service.refresh();

    expect(service.doneDayIds().size).toBe(1);
  });

  it('letture ravvicinate condividono la stessa richiesta', async () => {
    oggiE('2026-07-15');
    const { service, listAll } = makeService({ sessions: [] });

    await Promise.all([service.refresh(), service.refresh(), service.refresh()]);

    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it('ignora le sedute senza data o senza giorno', async () => {
    oggiE('2026-07-15');
    const { service } = makeService({
      sessions: [{ dayId: 'day1', date: '' }, { dayId: '', date: '2026-07-14' }, null]
    });

    await service.refresh();

    expect(service.doneDayIds().size).toBe(0);
  });
});
