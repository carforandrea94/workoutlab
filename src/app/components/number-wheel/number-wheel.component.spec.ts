import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NumberWheelComponent, WHEEL_ITEM_H, WHEEL_NOTCHES } from './number-wheel.component';

/**
 * La ruota si scorre per i cambi piccoli e si scrive per i salti grossi.
 * Quello che conta e' che le due vie dicano sempre lo stesso numero: quello
 * che sta al centro della banda.
 */
function monta(opts: Partial<NumberWheelComponent> = {}): {
  fx: ComponentFixture<NumberWheelComponent>; c: NumberWheelComponent; emessi: number[];
} {
  const fx = TestBed.createComponent(NumberWheelComponent);
  const c = fx.componentInstance;
  Object.assign(c, { min: 0, max: 200, step: 0.5, unit: 'kg', ...opts });

  const emessi: number[] = [];
  c.valueChange.subscribe(v => emessi.push(v));

  // Assegnare gli input a mano non fa scattare ngOnChanges, che nell'uso vero
  // lo fa Angular: senza, la ruota resterebbe senza tacche.
  c.ngOnChanges({ value: {} as any });
  fx.detectChanges();
  // jsdom non impagina: lo scorrimento si simula a mano.
  const el = c.trackEl!.nativeElement;
  el.scrollTo = ((o: any) => { el.scrollTop = o?.top ?? 0; }) as any;
  return { fx, c, emessi };
}

/** Porta la ruota alla tacca n come farebbe un dito. */
function scorriA(c: NumberWheelComponent, index: number): void {
  c.trackEl!.nativeElement.scrollTop = index * WHEEL_ITEM_H;
  c.onScroll();
}

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [NumberWheelComponent] }).compileComponents();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('NumberWheel — dove si ferma', () => {
  it('parte dal valore scelto', () => {
    const { c } = monta({ value: 30 });
    expect(c.values[c.index]).toBe(30);
  });

  it('senza valore parte dal suggerito del protocollo', () => {
    const { c } = monta({ value: null, placeholder: 22.5 });
    expect(c.values[c.index]).toBe(22.5);
  });

  it('senza niente parte dal primo', () => {
    const { c } = monta({ value: null, placeholder: null });
    expect(c.values[c.index]).toBe(0);
  });

  it('le ripetizioni partono da uno, non da zero', () => {
    const { c } = monta({ min: 1, max: 40, step: 1, unit: 'rip.', value: null, placeholder: null });
    expect(c.values[c.index]).toBe(1);
  });
});

describe('NumberWheel — scorrendo', () => {
  it('scorrere di una tacca cambia il valore di un passo', () => {
    const { c, emessi } = monta({ value: 30 });
    scorriA(c, c.index + 1);
    expect(emessi).toEqual([30.5]);
  });

  it('fermarsi dove si era non emette niente', () => {
    const { c, emessi } = monta({ value: 30 });
    scorriA(c, c.index);
    expect(emessi).toEqual([]);
  });

  it('oltre la fine non esce dall\'elenco', () => {
    const { c, emessi } = monta({ value: 199.5 });
    scorriA(c, 99999);
    expect(emessi).toEqual([200]);
  });

  it('toccare un\'altra tacca ci si porta', () => {
    const { c, emessi } = monta({ value: 30 });
    c.onItem(c.index + 2);
    expect(emessi).toEqual([31]);
  });

  it('a ruota spenta non si muove niente', () => {
    const { c, emessi } = monta({ value: 30, disabled: true });
    c.onItem(c.index + 2);
    expect(emessi).toEqual([]);
  });
});

describe('NumberWheel — scrivendo', () => {
  it('toccare il numero al centro apre la scrittura, gia\' compilata', () => {
    const { c } = monta({ value: 30 });
    c.onItem(c.index);
    expect(c.editing).toBe(true);
    expect(c.draft).toBe('30');
  });

  it('un numero fuori griglia non viene arrotondato via', () => {
    // 32,3 con passo 0,5: entra nella ruota al posto suo, fra 32 e 32,5.
    const { c, emessi } = monta({ value: 30 });
    c.edit();
    c.draft = '32,3';
    c.commit();

    expect(emessi).toEqual([32.3]);
    expect(c.values[c.index]).toBe(32.3);
    expect(c.values[c.index - 1]).toBe(32);
    expect(c.values[c.index + 1]).toBe(32.5);
  });

  it('accetta la virgola e il punto', () => {
    const { c, emessi } = monta({ value: 30 });
    c.edit(); c.draft = '42.5'; c.commit();
    expect(emessi).toEqual([42.5]);
  });

  it('un numero oltre la forbice si riporta dentro', () => {
    const { c, emessi } = monta({ value: 30 });
    c.edit(); c.draft = '900'; c.commit();
    expect(emessi).toEqual([200]);
  });

  it('una scrittura illeggibile lascia le cose come stavano', () => {
    const { c, emessi } = monta({ value: 30 });
    c.edit(); c.draft = 'abc'; c.commit();
    expect(emessi).toEqual([]);
    expect(c.values[c.index]).toBe(30);
    expect(c.editing).toBe(false);
  });

  it('mentre si scrive lo scorrimento non cambia il valore sotto le dita', () => {
    const { c, emessi } = monta({ value: 30 });
    c.edit();
    scorriA(c, c.index + 4);
    expect(emessi).toEqual([]);
  });

  it('il salto grosso costa due cifre invece di sessanta tacche', () => {
    const { c, emessi } = monta({ value: 30 });
    c.edit(); c.draft = '60'; c.commit();
    expect(emessi).toEqual([60]);
    expect(c.values[c.index]).toBe(60);
  });
});

/**
 * Niente tetto. Prima il carico si fermava a 200 kg, e su una leg press si va
 * oltre: adesso il limite e' 1000, ma la ruota ne disegna solo un pezzo per
 * volta e lo allunga quando ci si arriva.
 */
describe('NumberWheel — la finestra', () => {
  it('non disegna tutta la forbice', () => {
    const { c } = monta({ value: 200, max: 1000 });
    expect(c.values.length).toBe(WHEEL_NOTCHES * 2 + 1);
    expect(c.values[c.index]).toBe(200);
  });

  it('un carico pesante non costa piu\' di uno leggero', () => {
    // Vicino allo zero la ruota e' piu' corta, perche' di la' la forbice
    // finisce davvero; piu' in su resta sempre della stessa lunghezza.
    const leggero = monta({ value: 30, max: 1000 }).c.values.length;
    const pesante = monta({ value: 200, max: 1000 }).c.values.length;
    const pesantissimo = monta({ value: 400, max: 1000 }).c.values.length;
    expect(pesante).toBe(pesantissimo);
    expect(leggero).toBeLessThanOrEqual(pesante);
  });

  it('arrivati in cima la ruota si allunga', () => {
    const { c } = monta({ value: 200, max: 1000 });
    const prima = c.values.length;
    const ultimo = c.values[prima - 1];

    scorriA(c, prima - 1);

    expect(c.values.length).toBeGreaterThan(prima);
    // le tacche gia' presenti non si spostano: aggiungere in testa farebbe
    // scattare la ruota sotto le dita
    expect(c.values[prima - 1]).toBe(ultimo);
  });

  it('si allunga fino al massimo vero, e li\' si ferma', () => {
    const { c } = monta({ value: 99, max: 100, step: 0.5 });
    scorriA(c, c.values.length - 1);
    expect(c.values[c.values.length - 1]).toBe(100);
    const quante = c.values.length;
    scorriA(c, c.values.length - 1);
    expect(c.values.length).toBe(quante);
  });

  it('scrivere un carico lontano rifa\' la finestra intorno a quello', () => {
    const { c, emessi } = monta({ value: 30, max: 1000 });
    c.edit(); c.draft = '250'; c.commit();

    expect(emessi).toEqual([250]);
    expect(c.values[c.index]).toBe(250);
    expect(c.values.length).toBe(WHEEL_NOTCHES * 2 + 1);
  });
});
