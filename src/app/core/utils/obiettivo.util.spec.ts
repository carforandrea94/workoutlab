import { describe, expect, it } from 'vitest';
import {
  NOMI_OBIETTIVO, PESO_MASSIMO, PESO_MINIMO, TIPI_OBIETTIVO, conTraguardoDiPeso, distanzaDalTraguardo,
  normalizzaObiettivo, pesoTraguardo, rigaObiettivo, testoTraguardo
} from './obiettivo.util';

/** Il mio obiettivo: una scelta, e per chi lavora sul peso un traguardo. */
describe('obiettivo', () => {
  const oggi = '2026-10-25';

  it('quattro obiettivi, coi loro nomi', () => {
    expect(TIPI_OBIETTIVO).toEqual(['massa', 'grasso', 'forza', 'corsa']);
    expect(TIPI_OBIETTIVO.map(t => NOMI_OBIETTIVO[t]))
      .toEqual(['Mettere massa', 'Perdere grasso', 'Diventare più forte', 'Correre di più']);
  });

  it('il traguardo di peso solo per chi lavora sul peso', () => {
    expect(TIPI_OBIETTIVO.filter(conTraguardoDiPeso)).toEqual(['massa', 'grasso']);
    expect(conTraguardoDiPeso(null)).toBe(false);
  });

  it('il peso del traguardo si scrive con la virgola, e dentro i limiti', () => {
    expect([PESO_MINIMO, PESO_MASSIMO]).toEqual([30, 300]);
    expect(pesoTraguardo('78,5')).toBe(78.5);
    expect(pesoTraguardo('78.25')).toBe(78.3);
    expect(pesoTraguardo(' 80 ')).toBe(80);
    expect(pesoTraguardo(30)).toBe(30);
    expect(pesoTraguardo(300)).toBe(300);
    for (const raw of ['', null, undefined, '29,9', '300,1', '-80', '80kg', 'ottanta', '7,8,5']) {
      expect(pesoTraguardo(raw)).toBeNull();
    }
  });

  it('da Firestore: quello che non si legge non diventa un obiettivo rotto', () => {
    expect(normalizzaObiettivo({ tipo: 'grasso', peso: 78, entro: '2027-03-31' })).toEqual({ tipo: 'grasso', peso: 78, entro: '2027-03-31' });
    expect(normalizzaObiettivo({ tipo: 'forza', peso: 100, entro: '2027-03-31' })).toEqual({ tipo: 'forza', peso: null, entro: null });
    expect(normalizzaObiettivo({ tipo: 'massa', peso: 900, entro: '2027-03-31' })).toEqual({ tipo: 'massa', peso: null, entro: null });
    expect(normalizzaObiettivo({ tipo: 'massa', peso: 85, entro: '31/03/2027' })).toEqual({ tipo: 'massa', peso: 85, entro: null });
    expect(normalizzaObiettivo({ tipo: 'massa' })).toEqual({ tipo: 'massa', peso: null, entro: null });
    for (const raw of [null, undefined, 'grasso', {}, { tipo: 'dimagrire' }, 42]) {
      expect(normalizzaObiettivo(raw)).toBeNull();
    }
  });

  it('la riga in Account dice l\'obiettivo e il traguardo', () => {
    expect(rigaObiettivo(null, oggi)).toBe('Scegli dove vuoi arrivare');
    expect(rigaObiettivo({ tipo: 'forza', peso: null, entro: null }, oggi)).toBe('Diventare più forte');
    expect(rigaObiettivo({ tipo: 'grasso', peso: 78, entro: null }, oggi)).toBe('Perdere grasso · 78 kg');
    expect(rigaObiettivo({ tipo: 'grasso', peso: 78.5, entro: '2026-12-31' }, oggi)).toBe('Perdere grasso · 78,5 kg entro il 31 dic');
    expect(rigaObiettivo({ tipo: 'massa', peso: 85, entro: '2027-03-01' }, oggi)).toBe('Mettere massa · 85 kg entro il 1 mar 2027');
  });

  it('chi perde grasso scende verso il traguardo, chi mette massa sale', () => {
    expect(distanzaDalTraguardo({ tipo: 'grasso', peso: 78, entro: null }, 81.2)).toEqual({ mancano: 3.2, raggiunto: false });
    expect(distanzaDalTraguardo({ tipo: 'grasso', peso: 78, entro: null }, 77.5)).toEqual({ mancano: 0, raggiunto: true });
    expect(distanzaDalTraguardo({ tipo: 'massa', peso: 85, entro: null }, 81.2)).toEqual({ mancano: 3.8, raggiunto: false });
    expect(distanzaDalTraguardo({ tipo: 'massa', peso: 85, entro: null }, 85)).toEqual({ mancano: 0, raggiunto: true });
  });

  it('senza traguardo o senza pesata non c\'e\' distanza', () => {
    expect(distanzaDalTraguardo(null, 80)).toBeNull();
    expect(distanzaDalTraguardo({ tipo: 'forza', peso: null, entro: null }, 80)).toBeNull();
    expect(distanzaDalTraguardo({ tipo: 'grasso', peso: 78, entro: null }, null)).toBeNull();
    expect(distanzaDalTraguardo({ tipo: 'grasso', peso: 78, entro: null }, NaN)).toBeNull();
  });

  it('sotto il grafico: il traguardo, la data e quanto manca', () => {
    expect(testoTraguardo({ tipo: 'grasso', peso: 78, entro: '2026-12-31' }, 81.2, oggi)).toBe('Traguardo 78 kg entro il 31 dic · mancano 3,2 kg');
    expect(testoTraguardo({ tipo: 'massa', peso: 85, entro: null }, 85.4, oggi)).toBe('Traguardo 85 kg · raggiunto');
    expect(testoTraguardo({ tipo: 'massa', peso: null, entro: null }, 85, oggi)).toBeNull();
    expect(testoTraguardo(null, 85, oggi)).toBeNull();
  });
});
