import { ageOn } from './date.util';

describe('ageOn', () => {
  it('conta gli anni compiuti', () => {
    expect(ageOn('1994-03-10', '2026-09-24')).toBe(32);
  });

  // Il compleanno non ancora arrivato vale un anno in meno.
  it('non regala l\'anno prima del compleanno', () => {
    expect(ageOn('1994-12-31', '2026-01-01')).toBe(31);
  });

  it('il giorno del compleanno l\'anno e\' compiuto', () => {
    expect(ageOn('1994-09-24', '2026-09-24')).toBe(32);
  });

  it('il giorno prima del compleanno no', () => {
    expect(ageOn('1994-09-25', '2026-09-24')).toBe(31);
  });

  it('senza data non c\'e\' eta\'', () => {
    expect(ageOn(null, '2026-09-24')).toBeNull();
    expect(ageOn(undefined, '2026-09-24')).toBeNull();
    expect(ageOn('', '2026-09-24')).toBeNull();
  });

  it('una data illeggibile non da\' un\'eta\'', () => {
    expect(ageOn('non-una-data', '2026-09-24')).toBeNull();
  });

  // Un'eta' negativa non e' un'eta'.
  it('una nascita nel futuro non da\' un\'eta\'', () => {
    expect(ageOn('2030-01-01', '2026-09-24')).toBeNull();
  });
});
