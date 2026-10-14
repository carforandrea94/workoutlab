import { buildSessionSummary } from './session-summary.util';
import { WorkoutSession } from '../../models/workout.model';

type Row = [string | null, string | null, boolean];

function session(date: string, exercises: Record<string, Row[]>, durationSec = 3000): WorkoutSession {
  return {
    dayId: 'day1', dayLabel: 'Giorno 1', date, durationSec,
    exercises: Object.entries(exercises).map(([name, sets]) => ({
      name,
      sets: sets.map(([load, reps, done]) => ({ load, reps, done }))
    }))
  };
}

const OGGI = session('2026-09-25', {
  'Panca piana': [['82,5', '10', true], ['82,5', '10', true], ['80', '8', true]],
  'Dip': [[null, '12', true], [null, '10', true]]
});

const PRIMA = session('2026-09-18', {
  'Panca piana': [['80', '10', true], ['80', '10', true], ['80', '8', true]],
  'Dip': [[null, '10', true], [null, '10', true]]
});

describe('buildSessionSummary — i conti', () => {
  it('conta le serie fatte e quelle previste', () => {
    const s = buildSessionSummary(
      session('2026-09-25', { 'Panca piana': [['80', '10', true], ['80', '10', false]] }),
      null
    );
    expect(s.setsDone).toBe(1);
    expect(s.setsTotal).toBe(2);
  });

  it('riporta la durata della seduta', () => {
    expect(buildSessionSummary(OGGI, null).durationSec).toBe(3000);
  });

  it('somma il volume delle sole serie spuntate', () => {
    // 82,5×10 + 82,5×10 + 80×8 = 2290; Dip senza carico non pesa.
    expect(buildSessionSummary(OGGI, null).volumeKg).toBe(2290);
  });

  it('confronta il volume con la stessa giornata precedente', () => {
    const s = buildSessionSummary(OGGI, PRIMA);
    // 2290 contro 80×10 + 80×10 + 80×8 = 2240
    expect(s.volumeDeltaKg).toBe(50);
    expect(s.previousDate).toBe('2026-09-18');
  });

  it('senza una giornata precedente non c\'e\' confronto', () => {
    const s = buildSessionSummary(OGGI, null);
    expect(s.volumeDeltaKg).toBeNull();
    expect(s.previousDate).toBe('');
  });

  /*
   * Un volume precedente a zero non e' un confronto ma una giornata in cui
   * nessun carico era stato scritto: il delta direbbe "+tutto".
   */
  it('non si confronta con una giornata senza carichi', () => {
    const vuota = session('2026-09-18', { 'Panca piana': [[null, '10', true]] });
    expect(buildSessionSummary(OGGI, vuota).volumeDeltaKg).toBeNull();
  });
});

describe('buildSessionSummary — i record', () => {
  it('riconosce un carico piu' + '\'' + ' alto', () => {
    const r = buildSessionSummary(OGGI, PRIMA).records.find(x => x.exercise === 'Panca piana');
    expect(r?.kind).toBe('carico');
    expect(r?.now).toBe('82,5 kg × 10');
    expect(r?.before).toBe('80 kg × 10');
  });

  it('riconosce piu\' ripetizioni a corpo libero', () => {
    const r = buildSessionSummary(OGGI, PRIMA).records.find(x => x.exercise === 'Dip');
    expect(r?.kind).toBe('ripetizioni');
    expect(r?.now).toBe('12 rip.');
    expect(r?.before).toBe('10 rip.');
  });

  it('riconosce piu\' ripetizioni allo stesso carico', () => {
    const oggi = session('2026-09-25', { 'Squat': [['100', '8', true]] });
    const prima = session('2026-09-18', { 'Squat': [['100', '6', true]] });
    const r = buildSessionSummary(oggi, prima).records[0];
    expect(r.kind).toBe('ripetizioni');
    expect(r.now).toBe('100 kg × 8');
  });

  it('senza miglioramento non c\'e\' record', () => {
    expect(buildSessionSummary(PRIMA, PRIMA).records).toEqual([]);
  });

  it('un carico piu\' basso non e\' un record', () => {
    const oggi = session('2026-09-25', { 'Squat': [['90', '12', true]] });
    const prima = session('2026-09-18', { 'Squat': [['100', '6', true]] });
    expect(buildSessionSummary(oggi, prima).records).toEqual([]);
  });

  /*
   * La prima volta che si fa un esercizio non si batte niente, si comincia.
   * Chiamarlo record svuoterebbe la parola al secondo allenamento.
   */
  it('un esercizio mai fatto prima non da\' un record', () => {
    const oggi = session('2026-09-25', { 'Pulley': [['60', '12', true]] });
    expect(buildSessionSummary(oggi, PRIMA).records).toEqual([]);
  });

  // Il caso che regala record mai successi.
  it('una serie compilata ma non spuntata non conta', () => {
    const oggi = session('2026-09-25', { 'Panca piana': [['80', '10', true], ['100', '10', false]] });
    expect(buildSessionSummary(oggi, PRIMA).records).toEqual([]);
  });

  /*
   * A corpo libero da una parte e coi pesi dall'altra non sono la stessa
   * misura: 12 ripetizioni libere non battono 80 kg × 10.
   */
  it('non confronta il corpo libero con i pesi', () => {
    const oggi = session('2026-09-25', { 'Dip': [['20', '12', true]] });
    expect(buildSessionSummary(oggi, PRIMA).records).toEqual([]);
  });

  it('regge una seduta senza esercizi', () => {
    const vuota = { dayId: 'day1', dayLabel: '', date: '2026-09-25', exercises: [] } as WorkoutSession;
    const s = buildSessionSummary(vuota, PRIMA);
    expect(s.setsTotal).toBe(0);
    expect(s.volumeKg).toBe(0);
    expect(s.records).toEqual([]);
  });
});

describe('buildSessionSummary — le serie a cluster', () => {
  /** Un esercizio a cluster: una serie sola, coi suoi blocchi. */
  function conCluster(date: string, load: string, blocchi: [string, boolean][]): WorkoutSession {
    return {
      dayId: 'day1', dayLabel: 'Giorno 1', date, durationSec: 3000,
      exercises: [{
        name: 'Panca piana',
        sets: [{
          load, reps: blocchi.filter(b => b[1]).map(b => b[0]).join('+'), done: true,
          blocks: blocchi.map(([reps, done]) => ({ load, reps, done }))
        }]
      }]
    };
  }

  /* 16 ripetizioni di fila non le ha mai fatte nessuno: il cluster e' fatto
     apposta per NON farle di fila. Il confronto e' fra blocchi. */
  it('il record si misura sul blocco, non sulla somma', () => {
    const s = buildSessionSummary(
      conCluster('2026-09-26', '62,5', [['8', true], ['8', true]]),
      conCluster('2026-09-19', '60', [['8', true], ['8', true]])
    );
    expect(s.records.length).toBe(1);
    expect(s.records[0].kind).toBe('carico');
    expect(s.records[0].now).toBe('62,5 kg × 8');
  });

  it('piu\' blocchi allo stesso carico non sono un record di ripetizioni', () => {
    const s = buildSessionSummary(
      conCluster('2026-09-26', '60', [['8', true], ['8', true], ['8', true]]),
      conCluster('2026-09-19', '60', [['8', true], ['8', true]])
    );
    expect(s.records).toEqual([]);
  });

  it('una serie a cluster resta una serie sola nei conti', () => {
    const s = buildSessionSummary(conCluster('2026-09-26', '60', [['8', true], ['8', true]]), null);
    expect(s.setsTotal).toBe(1);
    expect(s.setsDone).toBe(1);
    expect(s.volumeKg).toBe(960);
  });
});
