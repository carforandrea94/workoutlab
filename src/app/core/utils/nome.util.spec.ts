import { describe, it, expect } from 'vitest';
import { dividiNome, componiNome } from './nome.util';

describe('dividiNome', () => {
  it('usa i due campi quando ci sono', () => {
    expect(dividiNome({ firstName: 'Andrea', lastName: 'Carfora', displayName: 'Altro Nome' }))
      .toEqual({ nome: 'Andrea', cognome: 'Carfora' });
  });

  /* Ogni account nato prima dei due campi ha solo il nome intero. */
  it('spezza il nome intero al primo spazio', () => {
    expect(dividiNome({ displayName: 'Andrea Carfora' }))
      .toEqual({ nome: 'Andrea', cognome: 'Carfora' });
  });

  it('di un nome doppio il secondo pezzo e\' tutto cognome', () => {
    expect(dividiNome({ displayName: 'Anna Maria Rossi' }))
      .toEqual({ nome: 'Anna', cognome: 'Maria Rossi' });
  });

  it('un nome solo resta un nome solo', () => {
    expect(dividiNome({ displayName: 'Andrea' })).toEqual({ nome: 'Andrea', cognome: '' });
  });

  it('gli spazi di troppo non diventano un cognome', () => {
    expect(dividiNome({ displayName: '  Andrea   Carfora  ' }))
      .toEqual({ nome: 'Andrea', cognome: 'Carfora' });
  });

  it('senza niente, due campi vuoti', () => {
    expect(dividiNome({})).toEqual({ nome: '', cognome: '' });
    expect(dividiNome({ displayName: '   ' })).toEqual({ nome: '', cognome: '' });
  });

  /* Un cognome cancellato apposta e' un dato, non un campo mancante: va
     rispettato, invece di far ricomparire quello dedotto dal nome intero. */
  it('un cognome svuotato resta svuotato', () => {
    expect(dividiNome({ firstName: 'Andrea', lastName: '', displayName: 'Andrea Carfora' }))
      .toEqual({ nome: 'Andrea', cognome: '' });
  });
});

describe('componiNome', () => {
  it('unisce con uno spazio solo', () => {
    expect(componiNome(' Andrea ', ' Carfora ')).toBe('Andrea Carfora');
  });

  /* Lo spazio appeso finirebbe nell'iniziale dell'avatar e nella lista del coach. */
  it('senza cognome non lascia lo spazio in fondo', () => {
    expect(componiNome('Andrea', '')).toBe('Andrea');
    expect(componiNome('Andrea', '   ')).toBe('Andrea');
  });

  it('senza nome resta il cognome', () => {
    expect(componiNome('', 'Carfora')).toBe('Carfora');
  });
});
