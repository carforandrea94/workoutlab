import {
  bodyFatJp3, bodyDensityJp3, siriBodyFat, meanSide, formatBodyFat,
  jp3SumLimit, JP3_SITES, BODYFAT_MIN_AGE, Jp3Sites
} from './bodyfat.util';
import { Sex } from '../models/user.model';

/** Tre siti che sommano a `sum`, quelli giusti per il sesso indicato. */
function sites(sum: number, sex: Sex): Jp3Sites {
  const each = sum / 3;
  return Object.fromEntries(JP3_SITES[sex].map(s => [s, each])) as Jp3Sites;
}

describe('bodyDensityJp3', () => {
  // Valori calcolati a mano dai coefficienti pubblicati, non ripresi dal codice.
  it('usa i coefficienti maschili di Jackson & Pollock 1978', () => {
    expect(bodyDensityJp3(60, 32, 'm')).toBeCloseTo(1.057301, 6);
  });

  it('usa i coefficienti femminili di Jackson, Pollock & Ward 1980', () => {
    expect(bodyDensityJp3(60, 32, 'f')).toBeCloseTo(1.043744, 6);
  });

  it('la densita\' cala al crescere delle pliche', () => {
    expect(bodyDensityJp3(100, 30, 'm')).toBeLessThan(bodyDensityJp3(40, 30, 'm'));
  });

  it('la densita\' cala al crescere dell\'eta\'', () => {
    expect(bodyDensityJp3(60, 45, 'm')).toBeLessThan(bodyDensityJp3(60, 25, 'm'));
  });
});

describe('siriBodyFat', () => {
  it('converte la densita\' in percentuale', () => {
    expect(siriBodyFat(1.057301)).toBeCloseTo(18.17, 2);
  });
});

describe('bodyFatJp3', () => {
  it('stima il grasso di un uomo', () => {
    expect(bodyFatJp3(sites(60, 'm'), 32, 'm').pct).toBe(18.2);
    expect(bodyFatJp3(sites(30, 'm'), 25, 'm').pct).toBe(8.5);
    expect(bodyFatJp3(sites(100, 'm'), 45, 'm').pct).toBe(30.1);
  });

  it('stima il grasso di una donna', () => {
    expect(bodyFatJp3(sites(60, 'f'), 32, 'f').pct).toBe(24.3);
    expect(bodyFatJp3(sites(30, 'f'), 25, 'f').pct).toBe(13.4);
    expect(bodyFatJp3(sites(100, 'f'), 45, 'f').pct).toBe(36.8);
  });

  /*
   * I SITI sono diversi, non solo i coefficienti: le pliche di un uomo non
   * bastano a stimare una donna, perche' sono proprio altre tre.
   */
  it('a un sesso non bastano le pliche dell\'altro', () => {
    const r = bodyFatJp3(sites(60, 'm'), 32, 'f');
    expect(r.pct).toBeNull();
    expect(r.missing).toEqual(['tricipite', 'iliaca']);
  });

  it('il quadricipite e\' l\'unico sito in comune', () => {
    const comuni = JP3_SITES.m.filter(s => JP3_SITES.f.includes(s));
    expect(comuni).toEqual(['quadricipite']);
  });

  it('non stima senza sesso, e non prova nemmeno a dire quali pliche', () => {
    const r = bodyFatJp3(sites(60, 'm'), 32, null);
    expect(r.pct).toBeNull();
    expect(r.needsSex).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('non stima senza eta\', e lo dice', () => {
    const r = bodyFatJp3(sites(60, 'm'), null, 'm');
    expect(r.pct).toBeNull();
    expect(r.needsAge).toBe(true);
  });

  it('non stima sotto l\'eta\' minima', () => {
    expect(bodyFatJp3(sites(60, 'm'), BODYFAT_MIN_AGE - 1, 'm').pct).toBeNull();
    expect(bodyFatJp3(sites(60, 'm'), BODYFAT_MIN_AGE, 'm').pct).not.toBeNull();
  });

  // Una somma parziale direbbe MENO grasso di quanto ce n'e', e sembrerebbe
  // un buon risultato.
  it('non stima con un sito mancante, e dice quale', () => {
    const r = bodyFatJp3({ ...sites(60, 'm'), quadricipite: null }, 32, 'm');
    expect(r.pct).toBeNull();
    expect(r.missing).toEqual(['quadricipite']);
  });

  it('tratta uno zero come un sito non misurato', () => {
    const r = bodyFatJp3({ ...sites(60, 'm'), pettorale: 0 }, 32, 'm');
    expect(r.pct).toBeNull();
    expect(r.missing).toEqual(['pettorale']);
  });

  /*
   * Il pavimento e' molto piu' basso che a sette siti: servono pliche da un
   * millimetro, che un plicometro non produce perche' afferra comunque la
   * pelle. Resta un paracadute per un dato digitato male, non un caso che
   * qualcuno incontrera'.
   */
  it('non restituisce una percentuale negativa', () => {
    const r = bodyFatJp3(sites(3, 'm'), 18, 'm');
    expect(r.pct).toBeNull();
    expect(r.outOfRange).toBe(true);
  });

  /*
   * Oltre il vertice della parabola la stima SCENDE al crescere delle pliche.
   * A tre siti il vertice e' molto piu' vicino che a sette — 258 mm per
   * l'uomo, 216 per la donna — quindi questo controllo conta piu' di prima.
   */
  it('non stima oltre il vertice della formula', () => {
    (['m', 'f'] as const).forEach(sex => {
      const limite = jp3SumLimit(sex);
      expect(bodyFatJp3(sites(limite - 20, sex), 30, sex).pct).not.toBeNull();
      const oltre = bodyFatJp3(sites(limite + 20, sex), 30, sex);
      expect(oltre.pct).toBeNull();
      expect(oltre.outOfRange).toBe(true);
    });
  });

  it('dentro il suo campo, piu\' pliche significano piu\' grasso', () => {
    (['m', 'f'] as const).forEach(sex => {
      let prec = 0;
      for (let somma = 20; somma < jp3SumLimit(sex); somma += 10) {
        const pct = bodyFatJp3(sites(somma, sex), 30, sex).pct;
        expect(pct).not.toBeNull();
        expect(pct!).toBeGreaterThan(prec);
        prec = pct!;
      }
    });
  });
});

describe('meanSide', () => {
  it('fa la media dei due lati', () => {
    expect(meanSide(10, 12)).toBe(11);
  });

  it('si accontenta del lato misurato', () => {
    expect(meanSide(10, null)).toBe(10);
    expect(meanSide(null, 12)).toBe(12);
  });

  it('senza nessun lato non c\'e\' valore', () => {
    expect(meanSide(null, null)).toBeNull();
  });
});

describe('formatBodyFat', () => {
  it('scrive con la virgola', () => {
    expect(formatBodyFat(18.2)).toBe('18,2');
  });
});
