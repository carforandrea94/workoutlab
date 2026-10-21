import { andamento, buildSessionSummary, STESSA_GIORNATA, variazione } from './session-summary.util';
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

/*
 * Esercizio per esercizio: la riga del resoconto e il raggio della ragnatela.
 * La forza e' il massimale stimato (la stessa formula del foglio del
 * bilanciere), e dove un massimale non si stima sono le ripetizioni.
 */
describe('buildSessionSummary — esercizio per esercizio', () => {
  const uno = (oggi: Row[], prima: Row[] | null, nome = 'Panca') => {
    const s = buildSessionSummary(
      session('2026-10-20', { [nome]: oggi }),
      prima ? session('2026-10-12', { [nome]: prima }) : null
    );
    return s.esercizi[0];
  };

  it('la forza e\' il massimale stimato dalla serie migliore, oggi e allora', () => {
    const e = uno([['50', '5', true], ['45', '6', true]], [['30', '8', true]]);
    // 50 × 36 / 32 = 56,25 e 30 × 36 / 29 = 37,2: al mezzo chilo, come nel foglio.
    expect(e.forza).toEqual({ oggi: 56.5, prima: 37, unita: 'kg' });
    expect(andamento(e.forza)).toBe('su');
    expect(e.oggi).toBe('50 kg × 5');
    expect(e.prima).toBe('30 kg × 8');
  });

  it('la serie migliore e\' quella che esprime piu\' forza, non quella col carico piu\' alto', () => {
    // 36 × 6 (41,8) vale piu\' di 40 × 1? No: 40 × 3 (42,4) vale piu\' di 36 × 6.
    const e = uno([['36', '6', true], ['40', '3', true]], [['40', '3', true]]);
    expect(e.forza?.oggi).toBe(42.5);
    expect(andamento(e.forza)).toBe('pari');
  });

  it('oltre le 12 ripetizioni contano le ripetizioni', () => {
    const e = uno([['1', '50', true]], [['1', '20', true]], 'Crunch');
    expect(e.forza).toEqual({ oggi: 50, prima: 20, unita: 'rip' });
    expect(variazione(e.forza)).toBeCloseTo(1.5);
  });

  it('a corpo libero contano le ripetizioni, e il volume non c\'e\'', () => {
    const e = uno([[null, '12', true]], [[null, '10', true]], 'Dip');
    expect(e.forza).toEqual({ oggi: 12, prima: 10, unita: 'rip' });
    expect(e.volume).toBeNull();
  });

  it('le ripetizioni non si confrontano con un massimale di allora', () => {
    // 15 con 20 kg non e' "piu' forte" di 10 con 30: e' un'altra serie.
    const e = uno([['20', '15', true]], [['30', '10', true]]);
    expect(e.forza).toEqual({ oggi: 15, prima: null, unita: 'rip' });
    expect(andamento(e.forza)).toBeNull();
  });

  it('meglio, uguale o peggio: sotto il 2,5% e\' la stessa giornata', () => {
    expect(STESSA_GIORNATA).toBe(0.025);
    expect(andamento({ oggi: 102.5, prima: 100, unita: 'kg' })).toBe('pari');
    expect(andamento({ oggi: 102.6, prima: 100, unita: 'kg' })).toBe('su');
    expect(andamento({ oggi: 97.5, prima: 100, unita: 'kg' })).toBe('pari');
    expect(andamento({ oggi: 97.4, prima: 100, unita: 'kg' })).toBe('giu');
    expect(andamento({ oggi: 10, prima: null, unita: 'kg' })).toBeNull();
    expect(andamento(null)).toBeNull();
    expect(variazione({ oggi: 113, prima: 100, unita: 'kg' })).toBeCloseTo(0.13);
  });

  it('il volume e\' carico per ripetizioni delle serie fatte, oggi e allora', () => {
    const e = uno([['25', '10', true], ['25', '10', true], ['25', '10', false]], [['27,5', '10', true], ['27,5', '10', true]]);
    expect(e.volume).toEqual({ oggi: 500, prima: 550, unita: 'kg' });
    expect(andamento(e.volume)).toBe('giu');
    expect(andamento(e.forza)).toBe('giu');
  });

  it('un esercizio nuovo c\'e\', ma senza confronto', () => {
    const s = buildSessionSummary(session('2026-10-20', { 'Pulley': [['60', '12', true]] }), PRIMA);
    expect(s.esercizi[0].prima).toBeNull();
    expect(s.esercizi[0].forza?.prima).toBeNull();
    expect(s.esercizi[0].volume?.prima).toBeNull();
    expect(andamento(s.esercizi[0].forza)).toBeNull();
  });

  it('un esercizio senza serie fatte non c\'e\'', () => {
    const s = buildSessionSummary(session('2026-10-20', {
      'Panca': [['80', '10', true]], 'Croci': [['20', '12', false]]
    }), null);
    expect(s.esercizi.map(e => e.nome)).toEqual(['Panca']);
  });

  it('nelle formule passa solo cio\' che e\' tutto un numero', () => {
    // "62,5-55" e' un carico che scende, non 62,5: il massimale viene dall'altra serie.
    const e = uno([['62,5-55', '8', true], ['50', '8', true]], null);
    expect(e.forza?.oggi).toBe(62);
  });

  it('il record e\' quello della lista dei record, e l\'ordine e\' quello della seduta', () => {
    const s = buildSessionSummary(OGGI, PRIMA);
    expect(s.esercizi.map(e => [e.nome, e.record])).toEqual([['Panca piana', true], ['Dip', true]]);
    expect(buildSessionSummary(PRIMA, PRIMA).esercizi.every(e => !e.record)).toBe(true);
  });

  it('una serie a cluster si misura blocco per blocco', () => {
    const s = buildSessionSummary({
      dayId: 'day1', dayLabel: 'Giorno 1', date: '2026-10-20',
      exercises: [{ name: 'Panca', sets: [{ load: '60', reps: '8+8', done: true, blocks: [
        { load: '60', reps: '8', done: true }, { load: '60', reps: '8', done: true }
      ] }] }]
    }, null);
    // 60 × 36 / 29 = 74,5 dal blocco da 8, non da "16 ripetizioni".
    expect(s.esercizi[0].forza?.oggi).toBe(74.5);
    expect(s.esercizi[0].volume?.oggi).toBe(960);
  });

  it('la forza di un cluster e\' quella del primo blocco, come il massimale della scheda', () => {
    const conBlocchi = (date: string, blocchi: [string, string, boolean][]) => buildSessionSummary({
      dayId: 'day1', dayLabel: 'Giorno 1', date,
      exercises: [{ name: 'Panca', sets: [{ load: '', reps: '', done: true, blocks: blocchi.map(([load, reps, done]) => ({ load, reps, done })) }] }]
    }, null).esercizi[0];
    // 60 x 5 = 67,5; il 70 x 5 del secondo blocco (78,5) non conta. Il volume si', tutto.
    const e = conBlocchi('2026-10-20', [['60', '5', true], ['70', '5', true]]);
    expect(e.forza?.oggi).toBe(67.5);
    expect(e.volume?.oggi).toBe(650);
    // Un primo blocco non fatto non e' una misura.
    expect(conBlocchi('2026-10-20', [['60', '5', false], ['70', '5', true]]).forza).toBeNull();
  });

  it('porta la data della seduta', () => {
    expect(buildSessionSummary(OGGI, PRIMA).date).toBe('2026-09-25');
  });
});
