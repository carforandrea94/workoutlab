import { describe, expect, it } from 'vitest';
import { PASSO_PROGRESSIONE, provaDiPiu, ripetizioniDaRaggiungere } from './progressione.util';

/** La doppia progressione: tutte le serie in cima, oggi un passo in piu'. */
describe('ripetizioniDaRaggiungere', () => {
  it('un numero e\' la cima; di un intervallo conta il massimo', () => {
    expect(ripetizioniDaRaggiungere('10')).toBe(10);
    expect(ripetizioniDaRaggiungere(8)).toBe(8);
    expect(ripetizioniDaRaggiungere('8-10')).toBe(10);
    expect(ripetizioniDaRaggiungere('12/15')).toBe(15);
    expect(ripetizioniDaRaggiungere(' 6 - 8 ')).toBe(8);
  });

  it('senza un numero da toccare non c\'e\' una cima', () => {
    for (const raw of ['MAX', 'AL CEDIMENTO', '30\'\'', '12+12', '8+6+4', '', null, undefined, '0', '8-']) {
      expect(ripetizioniDaRaggiungere(raw)).toBeNull();
    }
  });
});

describe('provaDiPiu', () => {
  const serie = (load: string | null, reps: string | null, done?: boolean) => ({ load, reps, done });

  it('tutte le serie in cima: ognuna col suo peso piu\' un passo', () => {
    expect(PASSO_PROGRESSIONE).toBe(2.5);
    expect(provaDiPiu([serie('60', '10'), serie('62,5', '10'), serie('62,5', '11')], [10, 10, 10]))
      .toEqual([62.5, 65, 65]);
  });

  it('le ripetizioni sono quelle di oggi: su un\'onda che scende, chi ne ha fatte 10 sale', () => {
    expect(provaDiPiu([serie('50', '10'), serie('50', '10')], [8, 8])).toEqual([52.5, 52.5]);
  });

  it('basta una serie sotto la cima e si resta dove si era', () => {
    expect(provaDiPiu([serie('60', '10'), serie('60', '9')], [10, 10])).toBeNull();
    expect(provaDiPiu([serie('60', '10'), serie('60', '10')], [10, 11])).toBeNull();
  });

  it('una serie non fatta, senza peso o senza ripetizioni non e\' arrivata', () => {
    expect(provaDiPiu([serie('60', '10'), serie('60', '10', false)], [10, 10])).toBeNull();
    expect(provaDiPiu([serie('60', '10'), serie(null, '10')], [10, 10])).toBeNull();
    expect(provaDiPiu([serie('60', '10'), serie('62,5-55', '10')], [10, 10])).toBeNull();
    expect(provaDiPiu([serie('60', '10'), serie('60', null)], [10, 10])).toBeNull();
    expect(provaDiPiu([serie('60', '10'), serie('60', '5+5')], [10, 10])).toBeNull();
  });

  it('una serie fatta senza il segno (sedute di prima) vale fatta', () => {
    expect(provaDiPiu([serie('40', '12', true), serie('40', '12')], [12, 12])).toEqual([42.5, 42.5]);
  });

  it('oggi ci sono piu\' serie di allora: quella in piu\' non e\' arrivata da nessuna parte', () => {
    expect(provaDiPiu([serie('60', '10')], [10, 10])).toBeNull();
  });

  it('una serie di allora oltre il piano di oggi non conta', () => {
    expect(provaDiPiu([serie('60', '10'), serie('60', '4')], [10])).toEqual([62.5]);
  });

  it('una serie senza cima nel piano: non si sa se e\' arrivata', () => {
    expect(provaDiPiu([serie('60', '10'), serie('60', '10')], [10, null])).toBeNull();
  });

  it('senza piano niente da provare', () => {
    expect(provaDiPiu([serie('60', '10')], [])).toBeNull();
  });
});
