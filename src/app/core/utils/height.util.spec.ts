import {
  heightOptions, toWheelValue, wheelValueAt, wheelOffsetOf, formatHeightCm,
  HEIGHT_MIN_CM, HEIGHT_MAX_CM, HEIGHT_DEFAULT_CM, WHEEL_ITEM_H
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

describe('la ruota, avanti e indietro', () => {
  it('il primo valore sta a scorrimento zero', () => {
    expect(wheelValueAt(0)).toBe(HEIGHT_MIN_CM);
    expect(wheelOffsetOf(HEIGHT_MIN_CM)).toBe(0);
  });

  it('ogni tacca vale WHEEL_ITEM_H di scorrimento', () => {
    expect(wheelValueAt(WHEEL_ITEM_H * 80)).toBe(HEIGHT_MIN_CM + 80);
    expect(wheelOffsetOf(180)).toBe((180 - HEIGHT_MIN_CM) * WHEEL_ITEM_H);
  });

  it('a meta\' fra due tacche sceglie la piu\' vicina', () => {
    expect(wheelValueAt(WHEEL_ITEM_H * 80 + 5)).toBe(HEIGHT_MIN_CM + 80);
    expect(wheelValueAt(WHEEL_ITEM_H * 81 - 5)).toBe(HEIGHT_MIN_CM + 81);
  });

  // Lo slancio del dito puo' portare lo scorrimento oltre il contenuto.
  it('regge uno scorrimento oltre gli estremi', () => {
    expect(wheelValueAt(-40)).toBe(HEIGHT_MIN_CM);
    expect(wheelValueAt(WHEEL_ITEM_H * 5000)).toBe(HEIGHT_MAX_CM);
  });

  it('andata e ritorno restituiscono lo stesso valore', () => {
    heightOptions().forEach(cm => expect(wheelValueAt(wheelOffsetOf(cm))).toBe(cm));
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
