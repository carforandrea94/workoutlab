import {
  leanMassKg, ffmi, ffmiClass, formatFfmi,
  FFMI_CLASS_LABELS, FFMI_REF_HEIGHT_M, FFMI_NORM_COEFF
} from './ffmi.util';

describe('leanMassKg', () => {
  it('toglie il grasso dal peso', () => {
    expect(leanMassKg(78.4, 14.6)).toBe(67);
  });

  it('a grasso zero la massa magra e\' tutto il peso', () => {
    expect(leanMassKg(80, 0)).toBe(80);
  });

  it('senza peso o senza grasso non c\'e\' massa magra', () => {
    expect(leanMassKg(null, 14.6)).toBeNull();
    expect(leanMassKg(78.4, null)).toBeNull();
    expect(leanMassKg(78.4, undefined)).toBeNull();
  });

  it('rifiuta valori impossibili', () => {
    expect(leanMassKg(0, 14.6)).toBeNull();
    expect(leanMassKg(-70, 14.6)).toBeNull();
    expect(leanMassKg(78.4, -1)).toBeNull();
    expect(leanMassKg(78.4, 100)).toBeNull();
    expect(leanMassKg(78.4, NaN)).toBeNull();
  });
});

describe('ffmi', () => {
  /*
   * Il numero mostrato e' quello sull'ALTEZZA VERA: e' il proprio FFMI, non
   * quello di un ipotetico se stessi alto 1,80.
   */
  it('il valore sta sull\'altezza vera', () => {
    const m = 1.93;
    const atteso = leanMassKg(109, 16.5)! / (m * m);
    expect(ffmi(109, 193, 16.5).value).toBeCloseTo(atteso, 1);
  });

  // All'altezza di riferimento la correzione vale zero: i due coincidono.
  it('a 1,80 m i due numeri sono lo stesso', () => {
    const r = ffmi(78.4, 180, 14.6);
    expect(r.value).toBe(20.7);
    expect(r.normalized).toBe(20.7);
  });

  it('il normalizzato alza chi e\' piu\' basso del riferimento', () => {
    const r = ffmi(70, 170, 12);
    expect(r.normalized!).toBeGreaterThan(r.value!);
  });

  it('il normalizzato abbassa chi e\' piu\' alto del riferimento', () => {
    const r = ffmi(88, 190, 10);
    expect(r.normalized!).toBeLessThan(r.value!);
  });

  /*
   * La correzione e' esattamente quella pubblicata da Kouri: un coefficiente
   * per lo scarto dall'altezza di riferimento, niente di piu'. Non promette
   * che due corpi proporzionali cadano sullo stesso numero — e' un aggiustamento
   * empirico, non una legge di scala.
   */
  /*
   * La tolleranza e' 0,1 e non meno perche' i due numeri sono arrotondati al
   * decimo ciascuno: la loro differenza puo' scostarsi di tanto da quella
   * vera senza che niente sia sbagliato.
   */
  it('corregge della quantita\' esatta della formula', () => {
    [160, 170, 180, 190, 200].forEach(cm => {
      const m = cm / 100;
      const r = ffmi(70, cm, 14);
      const atteso = FFMI_NORM_COEFF * (FFMI_REF_HEIGHT_M - m);
      expect(Math.abs((r.normalized! - r.value!) - atteso)).toBeLessThanOrEqual(0.1);
    });
  });

  it('senza uno dei tre ingressi non c\'e\' FFMI', () => {
    [ffmi(null, 180, 14.6), ffmi(78.4, null, 14.6), ffmi(78.4, 180, null)]
      .forEach(r => {
        expect(r.value).toBeNull();
        expect(r.normalized).toBeNull();
      });
  });

  it('non divide per zero', () => {
    expect(ffmi(78.4, 0, 14.6).value).toBeNull();
  });
});

describe('ffmiClass', () => {
  it('riconosce le fasce maschili', () => {
    expect(ffmiClass(17, 'm')).toBe('sotto');
    expect(ffmiClass(19, 'm')).toBe('media');
    expect(ffmiClass(21, 'm')).toBe('buona');
    expect(ffmiClass(23.5, 'm')).toBe('molta');
    expect(ffmiClass(26, 'm')).toBe('fuoriscala');
  });

  it('riconosce le fasce femminili', () => {
    expect(ffmiClass(14, 'f')).toBe('sotto');
    expect(ffmiClass(15.5, 'f')).toBe('media');
    expect(ffmiClass(17, 'f')).toBe('buona');
    expect(ffmiClass(19, 'f')).toBe('molta');
    expect(ffmiClass(21, 'f')).toBe('fuoriscala');
  });

  /*
   * Il caso per cui le due scale esistono: a 16 una donna e' nella media,
   * un uomo e' sotto. Con una scala sola tutte le donne finirebbero in fondo.
   */
  it('lo stesso numero non vale lo stesso per i due sessi', () => {
    expect(ffmiClass(16, 'f')).toBe('media');
    expect(ffmiClass(16, 'm')).toBe('sotto');
  });

  it('gli estremi appartengono alla fascia piu\' alta', () => {
    expect(ffmiClass(18, 'm')).toBe('media');
    expect(ffmiClass(25, 'm')).toBe('fuoriscala');
    expect(ffmiClass(14.5, 'f')).toBe('media');
    expect(ffmiClass(20, 'f')).toBe('fuoriscala');
  });

  it('ha un\'etichetta per ogni fascia', () => {
    (['sotto', 'media', 'buona', 'molta', 'fuoriscala'] as const)
      .forEach(k => expect(FFMI_CLASS_LABELS[k]).toBeTruthy());
  });
});

describe('formatFfmi', () => {
  it('scrive con la virgola', () => {
    expect(formatFfmi(20.6)).toBe('20,6');
  });
});
