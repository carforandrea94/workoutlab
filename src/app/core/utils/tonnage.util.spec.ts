import { sessionTonnage, rotationTonnage, formatKg } from './tonnage.util';
import { WorkoutSession } from '../../models/workout.model';

function session(dayId: string, date: string, sets: [string | null, string | null, boolean][]): WorkoutSession {
  return {
    dayId, date, dayLabel: dayId,
    exercises: [{ name: 'Panca', sets: sets.map(([load, reps, done]) => ({ load, reps, done })) }]
  };
}

const DAYS = [
  { id: 'day1', label: 'Giorno 1' },
  { id: 'day2', label: 'Giorno 2' }
];

describe('sessionTonnage', () => {
  it('moltiplica carico per ripetizioni su ogni serie', () => {
    expect(sessionTonnage(session('day1', '2026-09-21', [['80', '10', true], ['80', '8', true]]))).toBe(1440);
  });

  // Una serie prevista e non fatta non e' volume.
  it('conta solo le serie spuntate', () => {
    expect(sessionTonnage(session('day1', '2026-09-21', [['80', '10', true], ['80', '10', false]]))).toBe(800);
  });

  it('legge la virgola italiana senza perdere il decimale', () => {
    expect(sessionTonnage(session('day1', '2026-09-21', [['80,5', '10', true]]))).toBe(805);
  });

  it('regge carico o ripetizioni mancanti', () => {
    expect(sessionTonnage(session('day1', '2026-09-21', [[null, '10', true], ['80', null, true]]))).toBe(0);
  });

  it('regge una seduta vuota o assente', () => {
    expect(sessionTonnage(session('day1', '2026-09-21', []))).toBe(0);
    expect(sessionTonnage(null)).toBe(0);
    expect(sessionTonnage({ dayId: 'day1', date: 'x', dayLabel: '' } as WorkoutSession)).toBe(0);
  });
});

describe('rotationTonnage', () => {
  it('somma un giorno per ciascun giorno del programma', () => {
    const r = rotationTonnage([
      { session: session('day1', '2026-09-21', [['80', '10', true]]) },
      { session: session('day2', '2026-09-18', [['60', '10', true]]) }
    ], DAYS);
    expect(r.totalKg).toBe(1400);
    expect(r.missing).toBe(0);
  });

  // Il cuore della card: un giro non e' un totale cumulativo.
  it('di ogni giorno prende SOLO l\'ultima seduta', () => {
    const r = rotationTonnage([
      { session: session('day1', '2026-09-07', [['100', '10', true]]) },
      { session: session('day1', '2026-09-21', [['80', '10', true]]) },
      { session: session('day1', '2026-09-14', [['90', '10', true]]) }
    ], DAYS);
    expect(r.days[0].kg).toBe(800);
    expect(r.days[0].date).toBe('2026-09-21');
    expect(r.totalKg).toBe(800);
  });

  it('segna i giorni mai allenati invece di contarli zero', () => {
    const r = rotationTonnage([
      { session: session('day1', '2026-09-21', [['80', '10', true]]) }
    ], DAYS);
    expect(r.days[1].kg).toBeNull();
    expect(r.missing).toBe(1);
  });

  it('tiene l\'ordine del programma, non quello delle date', () => {
    const r = rotationTonnage([
      { session: session('day2', '2026-09-22', [['60', '10', true]]) },
      { session: session('day1', '2026-09-01', [['80', '10', true]]) }
    ], DAYS);
    expect(r.days.map(d => d.dayId)).toEqual(['day1', 'day2']);
  });

  it('ignora le sedute senza giorno o senza data', () => {
    const r = rotationTonnage([
      { session: { dayId: '', date: '2026-09-21', dayLabel: '', exercises: [] } as WorkoutSession },
      { session: { dayId: 'day1', date: '', dayLabel: '', exercises: [] } as WorkoutSession }
    ], DAYS);
    expect(r.missing).toBe(2);
    expect(r.totalKg).toBe(0);
  });

  it('senza programma non c\'e\' giro', () => {
    const r = rotationTonnage([{ session: session('day1', '2026-09-21', [['80', '10', true]]) }], []);
    expect(r.days).toEqual([]);
    expect(r.totalKg).toBe(0);
  });
});

describe('formatKg', () => {
  it('separa le migliaia come si scrive in italiano', () => {
    expect(formatKg(38500)).toBe('38.500');
  });

  it('non mette separatori dove non servono', () => {
    expect(formatKg(800)).toBe('800');
  });
});

/*
 * Una serie a cluster: il suo `reps` e' il riassunto ("8+8"), e parseFloat ne
 * leggerebbe 8. I chili veri stanno nei blocchi.
 */
describe('sessionTonnage con le serie a cluster', () => {
  const cluster = (blocks: { reps: string; done: boolean }[]) => ({
    dayId: 'day1', dayLabel: 'G1', date: '2026-09-26',
    exercises: [{
      name: 'Panca',
      sets: [{
        load: '60', reps: '8+8', done: true,
        blocks: blocks.map(b => ({ load: '60', reps: b.reps, done: b.done }))
      }]
    }]
  });

  it('somma i blocchi, non il riassunto', () => {
    expect(sessionTonnage(cluster([{ reps: '8', done: true }, { reps: '8', done: true }]))).toBe(960);
  });

  it('un blocco non fatto non e\' volume', () => {
    expect(sessionTonnage(cluster([{ reps: '8', done: true }, { reps: '8', done: false }]))).toBe(480);
  });

  it('a esaurimento conta quanti ne sono usciti', () => {
    expect(sessionTonnage(cluster([
      { reps: '5', done: true }, { reps: '5', done: true }, { reps: '3', done: true }
    ]))).toBe(780);
  });
});
