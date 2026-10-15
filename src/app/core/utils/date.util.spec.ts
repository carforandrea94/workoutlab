import { ageOn, dataEstesa, quandoBreve } from './date.util';

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

describe('quandoBreve', () => {
  const oggi = '2026-10-15';

  it('oggi e ieri si dicono a parole', () => {
    expect(quandoBreve('2026-10-15', oggi)).toBe('oggi');
    expect(quandoBreve('2026-10-14', oggi)).toBe('ieri');
  });

  it('prima di ieri e\' il giorno e il mese', () => {
    expect(quandoBreve('2026-10-03', oggi)).toBe('3 ott');
    expect(quandoBreve('2026-01-31', oggi)).toBe('31 gen');
  });

  it('di un altro anno ha l\'anno', () => {
    expect(quandoBreve('2025-12-31', oggi)).toBe('31 dic 2025');
  });

  it('ieri vale anche a cavallo del mese e dell\'anno', () => {
    expect(quandoBreve('2026-09-30', '2026-10-01')).toBe('ieri');
    expect(quandoBreve('2025-12-31', '2026-01-01')).toBe('ieri');
  });

  it('l\'ora legale non sposta i giorni: ieri resta ieri il giorno dopo il cambio', () => {
    expect(quandoBreve('2026-03-28', '2026-03-29')).toBe('ieri');
    expect(quandoBreve('2026-03-29', '2026-03-30')).toBe('ieri');
    expect(quandoBreve('2026-10-24', '2026-10-25')).toBe('ieri');
    expect(quandoBreve('2026-10-25', '2026-10-26')).toBe('ieri');
  });

  it('una data nel futuro non diventa "domani": si scrive per intero', () => {
    expect(quandoBreve('2026-10-16', oggi)).toBe('16 ott');
  });

  it('una data illeggibile torna com\'e\'', () => {
    expect(quandoBreve('boh', oggi)).toBe('boh');
  });
});

describe('dataEstesa', () => {
  it('scrive il giorno della settimana, il giorno e il mese', () => {
    expect(dataEstesa('2026-10-15')).toBe('giovedì 15 ottobre');
    expect(dataEstesa('2026-01-01')).toBe('giovedì 1 gennaio');
  });
});
