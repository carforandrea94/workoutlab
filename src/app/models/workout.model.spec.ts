import { describe, it, expect } from 'vitest';
import { normalizeSession } from './workout.model';

describe('normalizeSession', () => {
  const seduta = {
    dayId: 'day1', dayLabel: 'Petto', date: '2026-09-14', durationSec: 3600,
    exercises: [{ name: 'Panca', sets: [{ load: '36', reps: '10', done: true }] }]
  };

  it('tiene una seduta completa cosi\' com\'e\'', () => {
    expect(normalizeSession(seduta)).toEqual(seduta);
  });

  it('un documento senza exercises non fa piu\' esplodere il conteggio delle serie', () => {
    // E' il caso che aveva svuotato lo storico: un documento estraneo finito
    // nella collezione. Ora diventa una seduta vuota, visibile e cancellabile.
    const session = normalizeSession({ date: '2026-09-14', probe: true })!;

    expect(session.exercises).toEqual([]);
    expect(() => session.exercises.reduce((n, ex) => n + ex.sets.length, 0)).not.toThrow();
  });

  it('un esercizio senza serie diventa un esercizio a zero serie', () => {
    const session = normalizeSession({ date: '2026-09-14', exercises: [{ name: 'Squat' }] })!;
    expect(session.exercises[0].sets).toEqual([]);
  });

  it('senza data la seduta si scarta: non si potrebbe ne\' collocare ne\' mostrare', () => {
    expect(normalizeSession({ exercises: [] })).toBeNull();
    expect(normalizeSession({ date: '' })).toBeNull();
    expect(normalizeSession(null)).toBeNull();
  });

  it('una durata assente resta assente, non diventa zero', () => {
    const session = normalizeSession({ date: '2026-09-14', exercises: [] })!;
    expect(session.durationSec).toBeUndefined();
  });

  it('i valori di una serie che non sono testo diventano vuoti, non rompono la vista', () => {
    const session = normalizeSession({
      date: '2026-09-14',
      exercises: [{ name: 'Squat', sets: [{ load: 36, reps: null, done: 'si' }] }]
    })!;
    expect(session.exercises[0].sets[0]).toEqual({ load: null, reps: null, done: true });
  });
});
