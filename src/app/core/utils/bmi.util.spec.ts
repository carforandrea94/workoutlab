import { computeBmi, bmiClass, formatBmi, BMI_CLASS_LABELS } from './bmi.util';

describe('computeBmi', () => {
  it('calcola il BMI da peso e altezza', () => {
    // 78,4 kg su 1,80 m: 78,4 / 3,24 = 24,197…
    expect(computeBmi(78.4, 180)).toBe(24.2);
  });

  it('arrotonda al decimo', () => {
    expect(computeBmi(70, 175)).toBe(22.9);
  });

  it('non da\' un BMI senza peso', () => {
    expect(computeBmi(null, 180)).toBeNull();
    expect(computeBmi(undefined, 180)).toBeNull();
  });

  it('non da\' un BMI senza altezza', () => {
    expect(computeBmi(78.4, null)).toBeNull();
    expect(computeBmi(78.4, undefined)).toBeNull();
  });

  // Il caso per cui il controllo esiste: la divisione per zero vale Infinity,
  // e Infinity a schermo sembra un numero.
  it('non divide per zero', () => {
    expect(computeBmi(78.4, 0)).toBeNull();
    expect(computeBmi(0, 180)).toBeNull();
  });

  it('rifiuta i valori negativi e non finiti', () => {
    expect(computeBmi(-70, 180)).toBeNull();
    expect(computeBmi(70, -180)).toBeNull();
    expect(computeBmi(NaN, 180)).toBeNull();
    expect(computeBmi(70, Infinity)).toBeNull();
  });
});

describe('bmiClass', () => {
  it('riconosce le quattro fasce', () => {
    expect(bmiClass(17)).toBe('sottopeso');
    expect(bmiClass(22)).toBe('normopeso');
    expect(bmiClass(27)).toBe('sovrappeso');
    expect(bmiClass(33)).toBe('obesita');
  });

  // Gli estremi appartengono alla fascia piu' alta, come li scrive l'OMS.
  it('mette gli estremi nella fascia piu\' alta', () => {
    expect(bmiClass(18.5)).toBe('normopeso');
    expect(bmiClass(25)).toBe('sovrappeso');
    expect(bmiClass(30)).toBe('obesita');
  });

  it('e appena sotto un estremo resta nella fascia piu\' bassa', () => {
    expect(bmiClass(18.4)).toBe('sottopeso');
    expect(bmiClass(24.9)).toBe('normopeso');
    expect(bmiClass(29.9)).toBe('sovrappeso');
  });

  it('ha un\'etichetta per ogni fascia', () => {
    (['sottopeso', 'normopeso', 'sovrappeso', 'obesita'] as const)
      .forEach(k => expect(BMI_CLASS_LABELS[k]).toBeTruthy());
  });
});

describe('formatBmi', () => {
  it('scrive con la virgola', () => {
    expect(formatBmi(24.2)).toBe('24,2');
  });

  it('non inventa decimali', () => {
    expect(formatBmi(25)).toBe('25');
  });
});
