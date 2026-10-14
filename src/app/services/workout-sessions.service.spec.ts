import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock condivisa: vedi src/test-support/firestore-mock.ts per il perche' non
// puo' vivere qui dentro (isolate: false condivide i moduli fra i file).
vi.mock('firebase/firestore', async () => (await import('../../test-support/firestore-mock')).firestoreMock);

import { mockDocs } from '../../test-support/firestore-mock';

import type { WorkoutSessionsService } from './workout-sessions.service';
import type { WorkoutSession } from '../models/workout.model';

describe('WorkoutSessionsService.moveSession', () => {
  let service: WorkoutSessionsService;

  const baseSession: WorkoutSession = {
    dayId: 'day1',
    dayLabel: 'Giorno ON',
    date: '2026-07-01',
    exercises: [{ name: 'Squat', sets: [{ load: '100', reps: '8', done: true }] }]
  };

  beforeEach(async () => {
    mockDocs.clear();
    // I moduli sono condivisi fra i file di test (isolate: false): se un altro
    // file ha gia' caricato questo servizio, il servizio ha gia' legato le
    // funzioni VERE di firebase/firestore e la mock non lo raggiungerebbe —
    // fallimento a intermittenza, dipendente dall'ordine dei file. Ricaricarlo
    // qui, dopo la registrazione della mock, lo lega alla mock.
    vi.resetModules();
    const { WorkoutSessionsService } = await import('./workout-sessions.service');
    const fbStub = { db: {} } as any;
    const authStub = { currentUser: () => ({ uid: 'u1' }) } as any;
    const zoneFixStub = { run: (p: Promise<any>) => p } as any;
    service = new WorkoutSessionsService(fbStub, authStub, zoneFixStub);
  });

  it('con la stessa data, aggiorna il documento esistente senza cambiare id', async () => {
    mockDocs.set('day1_2026-07-01', { ...baseSession });

    const result = await service.moveSession(baseSession, 'day1_2026-07-01', '2026-07-01');

    expect(result).toBe('ok');
    expect(mockDocs.get('day1_2026-07-01')).toMatchObject({ date: '2026-07-01', dayId: 'day1' });
    expect(mockDocs.has('day1_2026-07-05')).toBe(false);
  });

  it('con una data diversa senza collisione, scrive il nuovo documento ed elimina quello vecchio', async () => {
    mockDocs.set('day1_2026-07-01', { ...baseSession });

    const result = await service.moveSession(baseSession, 'day1_2026-07-01', '2026-07-05');

    expect(result).toBe('ok');
    expect(mockDocs.get('day1_2026-07-05')).toMatchObject({ date: '2026-07-05', dayId: 'day1' });
    expect(mockDocs.has('day1_2026-07-01')).toBe(false);
  });

  it('blocca lo spostamento se esiste gia\' una seduta nella data di destinazione, senza scrivere ne\' cancellare nulla', async () => {
    mockDocs.set('day1_2026-07-01', { ...baseSession });
    mockDocs.set('day1_2026-07-05', { ...baseSession, date: '2026-07-05', exercises: [] });

    const result = await service.moveSession(baseSession, 'day1_2026-07-01', '2026-07-05');

    expect(result).toBe('collision');
    expect(mockDocs.get('day1_2026-07-01')).toMatchObject({ date: '2026-07-01' });
    expect(mockDocs.get('day1_2026-07-05')).toMatchObject({ exercises: [] });
  });
});

describe('WorkoutSessionsService.listAll', () => {
  let service: WorkoutSessionsService;

  beforeEach(async () => {
    mockDocs.clear();
    vi.resetModules();
    const { WorkoutSessionsService } = await import('./workout-sessions.service');
    service = new WorkoutSessionsService(
      { db: {} } as any,
      { currentUser: () => ({ uid: 'u1' }) } as any,
      { run: (p: Promise<any>) => p } as any
    );
  });

  it('un documento estraneo nella collezione non porta giu\' tutto lo storico', async () => {
    // E' successo davvero: un documento senza `exercises` faceva esplodere la
    // reduce che conta le serie, e la pagina mostrava "Errore nel caricamento"
    // come se non ci fosse piu' niente salvato.
    mockDocs.set('day1_2026-09-14', {
      dayId: 'day1', dayLabel: 'Petto', date: '2026-09-14',
      exercises: [{ name: 'Panca', sets: [{ load: '36', reps: '10', done: true }] }]
    });
    mockDocs.set('zz_probe', { probe: true });

    const rows = await service.listAll();

    expect(rows.map(r => r.id)).toEqual(['day1_2026-09-14']);
    expect(() => rows[0].session.exercises.reduce((n, ex) => n + ex.sets.length, 0)).not.toThrow();
  });

  it('una seduta incompleta ma datata resta nell\'elenco, vuota', async () => {
    // Con la data si puo' collocare e mostrare: meglio visibile e cancellabile
    // che nascosta senza spiegazioni.
    mockDocs.set('day9_2026-09-10', { date: '2026-09-10' });

    const rows = await service.listAll();

    expect(rows.length).toBe(1);
    expect(rows[0].session.exercises).toEqual([]);
  });
});
