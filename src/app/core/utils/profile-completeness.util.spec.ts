import { campiMancanti, profiloCompleto, validaProfilo, InputProfilo } from './profile-completeness.util';

const OGGI = '2026-10-14';

describe('campiMancanti', () => {
  it('un profilo appena iscritto ha tutto da dire tranne il nome', () => {
    expect(campiMancanti({ displayName: 'Anna' }))
      .toEqual(['cognome', 'birthDate', 'sex', 'heightCm']);
  });

  /* Un profilo nato con il solo nome intero ha il cognome dentro displayName:
     leggerlo come mancante lo farebbe riscrivere a chi l'ha gia' dato. */
  it('il cognome dentro il nome intero non manca', () => {
    expect(campiMancanti({ displayName: 'Anna Rossi', birthDate: '1994-05-01', sex: 'f', heightCm: 168 }))
      .toEqual([]);
  });

  it('nome e cognome separati hanno la precedenza sul nome intero', () => {
    expect(campiMancanti({ displayName: 'Anna Rossi', firstName: 'Anna', lastName: '' }))
      .toContain('cognome');
  });

  it('un profilo vuoto manca di tutto', () => {
    expect(campiMancanti({})).toEqual(['nome', 'cognome', 'birthDate', 'sex', 'heightCm']);
  });

  it('un sesso diverso da m o f non conta', () => {
    expect(campiMancanti({ displayName: 'A B', birthDate: '1990-01-01', heightCm: 170, sex: null }))
      .toEqual(['sex']);
  });

  it('un\'altezza null manca', () => {
    expect(campiMancanti({ displayName: 'A B', birthDate: '1990-01-01', sex: 'm', heightCm: null }))
      .toEqual(['heightCm']);
  });

  it('profiloCompleto dice se non manca niente', () => {
    expect(profiloCompleto({ displayName: 'Anna Rossi', birthDate: '1994-05-01', sex: 'f', heightCm: 168 })).toBe(true);
    expect(profiloCompleto({ displayName: 'Anna' })).toBe(false);
  });
});

describe('validaProfilo', () => {
  const valido = (): InputProfilo => ({
    nome: 'Anna', cognome: 'Rossi', birthDate: '1994-05-01', sex: 'f', heightCm: 168
  });

  it('dati completi e corretti non hanno errori', () => {
    expect(validaProfilo(valido(), OGGI)).toEqual({});
  });

  it('l\'altezza puo\' arrivare come stringa dal campo', () => {
    expect(validaProfilo({ ...valido(), heightCm: '168' }, OGGI)).toEqual({});
  });

  it('nome e cognome sono obbligatori, anche fatti di soli spazi', () => {
    const e = validaProfilo({ ...valido(), nome: '   ', cognome: '' }, OGGI);
    expect(e.nome).toBeTruthy();
    expect(e.cognome).toBeTruthy();
  });

  it('nome e cognome insieme non superano gli 80 caratteri del nome intero', () => {
    const e = validaProfilo({ ...valido(), nome: 'a'.repeat(50), cognome: 'b'.repeat(40) }, OGGI);
    expect(e.cognome).toContain('troppo lunghi');
  });

  it('la data di nascita e\' obbligatoria', () => {
    expect(validaProfilo({ ...valido(), birthDate: '' }, OGGI).birthDate).toContain('obbligatoria');
  });

  it('non accetta una data futura, ne\' una precedente al 1920', () => {
    expect(validaProfilo({ ...valido(), birthDate: '2026-10-15' }, OGGI).birthDate).toContain('non e\' valida');
    expect(validaProfilo({ ...valido(), birthDate: '1919-12-31' }, OGGI).birthDate).toContain('non e\' valida');
  });

  it('accetta la data di oggi', () => {
    expect(validaProfilo({ ...valido(), birthDate: OGGI }, OGGI).birthDate).toBeUndefined();
  });

  it('non accetta un giorno che non esiste', () => {
    expect(validaProfilo({ ...valido(), birthDate: '1994-02-31' }, OGGI).birthDate).toBeTruthy();
  });

  it('il sesso va scelto', () => {
    expect(validaProfilo({ ...valido(), sex: null }, OGGI).sex).toBeTruthy();
  });

  it('l\'altezza e\' obbligatoria e sta fra 100 e 250 cm, come nelle regole', () => {
    expect(validaProfilo({ ...valido(), heightCm: null }, OGGI).heightCm).toContain('obbligatoria');
    expect(validaProfilo({ ...valido(), heightCm: '' }, OGGI).heightCm).toContain('obbligatoria');
    expect(validaProfilo({ ...valido(), heightCm: 99 }, OGGI).heightCm).toContain('fra 100 e 250');
    expect(validaProfilo({ ...valido(), heightCm: 251 }, OGGI).heightCm).toContain('fra 100 e 250');
    expect(validaProfilo({ ...valido(), heightCm: 100 }, OGGI).heightCm).toBeUndefined();
    expect(validaProfilo({ ...valido(), heightCm: 250 }, OGGI).heightCm).toBeUndefined();
  });
});
