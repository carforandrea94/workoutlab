import {
  heightOptions, toWheelValue, formatHeightCm,
  HEIGHT_MIN_CM, HEIGHT_MAX_CM, HEIGHT_DEFAULT_CM
} from './height.util';

describe('heightOptions', () => {
  it('copre la forbice per intero, estremi compresi', () => {
    const opts = heightOptions();
    expect(opts[0]).toBe(HEIGHT_MIN_CM);
    expect(opts[opts.length - 1]).toBe(HEIGHT_MAX_CM);
    expect(opts.length).toBe(HEIGHT_MAX_CM - HEIGHT_MIN_CM + 1);
  });

  it('va di centimetro in centimetro, senza buchi', () => {
    const opts = heightOptions();
    opts.forEach((cm, i) => expect(cm).toBe(HEIGHT_MIN_CM + i));
  });
});

describe('toWheelValue', () => {
  it('lascia stare un valore gia\' buono', () => {
    expect(toWheelValue(180)).toBe(180);
  });

  // I profili salvati prima della ruota possono avere un decimale.
  it('arrotonda al centimetro', () => {
    expect(toWheelValue(180.5)).toBe(181);
    expect(toWheelValue(180.4)).toBe(180);
  });

  it('apre sul valore di partenza quando l\'altezza non c\'e\'', () => {
    expect(toWheelValue(null)).toBe(HEIGHT_DEFAULT_CM);
    expect(toWheelValue(undefined)).toBe(HEIGHT_DEFAULT_CM);
  });

  it('taglia agli estremi invece di uscire dalla ruota', () => {
    expect(toWheelValue(40)).toBe(HEIGHT_MIN_CM);
    expect(toWheelValue(320)).toBe(HEIGHT_MAX_CM);
  });
});

describe('formatHeightCm', () => {
  it('non mette decimali dove non servono', () => {
    expect(formatHeightCm(180)).toBe('180');
  });

  it('scrive con la virgola un valore vecchio col decimale', () => {
    expect(formatHeightCm(180.5)).toBe('180,5');
  });

  it('rende il vuoto per un\'altezza non impostata', () => {
    expect(formatHeightCm(null)).toBe('');
    expect(formatHeightCm(undefined)).toBe('');
  });
});
