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

/**
 * Per chi non usa il dito la ruota e' UN controllo: prima erano centinaia di
 * <button> in un "listbox" senza opzioni, e il Tab li attraversava uno a uno
 * (in sessione, 1.545 tab-stop). Adesso e' uno "spinbutton" con un solo stop.
 */
describe('NumberWheel — per tastiera e screen reader', () => {
  const pista = (fx: ComponentFixture<NumberWheelComponent>) =>
    fx.nativeElement.querySelector('.wheel') as HTMLElement;
  const tasto = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(ev);
    return ev;
  };

  describe('cosa dichiara', () => {
    it('e\' uno spinbutton con un solo tab-stop, col suo valore e la sua forbice', () => {
      const { fx } = monta({ value: 30, min: 0, max: 200, label: 'Carico della serie 1, in chili' });
      const el = pista(fx);
      expect(el.getAttribute('role')).toBe('spinbutton');
      expect(el.getAttribute('tabindex')).toBe('0');
      expect(el.getAttribute('aria-label')).toBe('Carico della serie 1, in chili');
      expect(el.getAttribute('aria-valuenow')).toBe('30');
      expect(el.getAttribute('aria-valuemin')).toBe('0');
      expect(el.getAttribute('aria-valuemax')).toBe('200');
      expect(el.getAttribute('aria-valuetext')).toBe('30 kg');
    });

    it('le tacche non sono tab-stop ne\' voci per lo screen reader', () => {
      const { fx } = monta({ value: 30 });
      const tacche = Array.from(fx.nativeElement.querySelectorAll('.wheel-item')) as HTMLElement[];
      expect(tacche.length).toBeGreaterThan(100);
      expect(tacche.every(t => t.getAttribute('tabindex') === '-1' && t.getAttribute('aria-hidden') === 'true')).toBe(true);
      expect(fx.nativeElement.querySelector('[role="listbox"], [aria-selected]')).toBeNull();
    });

    it('il numero e\' scritto come lo si legge: virgola e unita\'', () => {
      const { fx } = monta({ value: 32.5, unit: 'kg' });
      expect(pista(fx).getAttribute('aria-valuetext')).toBe('32,5 kg');
    });

    it('finche\' c\'e\' solo il suggerito lo dice', () => {
      const { fx } = monta({ value: null, placeholder: 10, unit: 'rip.', min: 1, max: 100, step: 1 });
      const el = pista(fx);
      expect(el.getAttribute('aria-valuenow')).toBe('10');
      expect(el.getAttribute('aria-valuetext')).toBe('10 rip., suggerito');
    });

    it('senza nemmeno un suggerito non inventa un valore', () => {
      const { fx } = monta({ value: null, placeholder: null });
      expect(pista(fx).getAttribute('aria-valuenow')).toBeNull();
      expect(pista(fx).getAttribute('aria-valuetext')).toBeNull();
    });

    it('a ruota spenta esce dal Tab e lo dichiara', () => {
      const { fx } = monta({ value: 30, disabled: true });
      const el = pista(fx);
      expect(el.getAttribute('tabindex')).toBe('-1');
      expect(el.getAttribute('aria-disabled')).toBe('true');
    });

    it('mentre si scrive la ruota esce dal Tab e dall\'albero: il campo e\' l\'unico controllo', () => {
      const { fx, c } = monta({ value: 30 });
      c.edit();
      fx.detectChanges();
      const el = pista(fx);
      expect(el.getAttribute('tabindex')).toBe('-1');
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('le frecce', () => {
    it('su aumenta di un passo, giu\' diminuisce (il verso dei campi numerici)', () => {
      const { fx, emessi } = monta({ value: 30 });
      tasto(pista(fx), 'ArrowUp');
      tasto(pista(fx), 'ArrowDown');
      tasto(pista(fx), 'ArrowDown');
      expect(emessi).toEqual([30.5, 30, 29.5]);
    });

    it('Pag su e Pag giu\' vanno di dieci passi', () => {
      const { fx, emessi } = monta({ value: 30 });
      tasto(pista(fx), 'PageUp');
      tasto(pista(fx), 'PageDown');
      tasto(pista(fx), 'PageDown');
      expect(emessi).toEqual([35, 30, 25]);
    });

    it('porta davvero la ruota li\': lo scorrimento e il valore dichiarato seguono', () => {
      const { fx, c } = monta({ value: 30 });
      tasto(pista(fx), 'ArrowUp');
      expect(c.trackEl!.nativeElement.scrollTop).toBe((c.index) * WHEEL_ITEM_H);
      expect(c.values[c.index]).toBe(30.5);
    });

    it('in fondo e in cima non esce dall\'elenco e non emette', () => {
      const a = monta({ value: 0 });
      tasto(pista(a.fx), 'ArrowDown');
      tasto(pista(a.fx), 'PageDown');
      expect(a.emessi).toEqual([]);

      const b = monta({ value: 200 });
      tasto(pista(b.fx), 'ArrowUp');
      expect(b.emessi).toEqual([]);
    });

    it('il preventDefault c\'e\': la pagina non scorre sotto la ruota', () => {
      const { fx } = monta({ value: 30 });
      expect(tasto(pista(fx), 'ArrowUp').defaultPrevented).toBe(true);
    });

    it('a ruota spenta, con una scorciatoia di sistema o su una tacca non fa niente', () => {
      const spenta = monta({ value: 30, disabled: true });
      tasto(pista(spenta.fx), 'ArrowUp');
      expect(spenta.emessi).toEqual([]);

      const viva = monta({ value: 30 });
      tasto(pista(viva.fx), 'ArrowUp', { ctrlKey: true });
      tasto(pista(viva.fx), 'ArrowUp', { metaKey: true });
      const tacca = viva.fx.nativeElement.querySelector('.wheel-item') as HTMLElement;
      tasto(tacca, 'ArrowUp');
      expect(viva.emessi).toEqual([]);
    });

    it('una ruota lunga si allunga anche da tastiera, come scorrendo', () => {
      const { fx, c } = monta({ value: 20, max: 1000 });
      const prima = c.values.length;
      for (let i = 0; i < 20; i++) tasto(pista(fx), 'PageUp');
      expect(c.values.length).toBeGreaterThan(prima);
      expect(c.values[c.index]).toBe(120);
    });
  });

  describe('scrivere', () => {
    it('Invio apre la scrittura, gia\' compilata', () => {
      const { fx, c } = monta({ value: 30 });
      tasto(pista(fx), 'Enter');
      expect(c.editing).toBe(true);
      expect(c.draft).toBe('30');
    });

    it('e il campo riceve il focus: Invio e le cifre dopo vanno a lui, non alla ruota', () => {
      const { fx } = monta({ value: 30 });
      pista(fx).focus();
      tasto(pista(fx), '6');
      fx.detectChanges();
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      expect(document.activeElement).toBe(campo);
    });

    it('una cifra premuta sulla ruota apre la scrittura da quella, senza selezionarla', async () => {
      const { fx, c } = monta({ value: 30 });
      tasto(pista(fx), '6');
      fx.detectChanges();
      await Promise.resolve();
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      expect(c.draft).toBe('6');
      expect(campo.value).toBe('6');
      expect(campo.selectionStart).toBe(1);
      expect(campo.selectionEnd).toBe(1);
    });

    it('Invio apre il numero tutto selezionato: la cifra dopo lo sostituisce, non lo allunga', async () => {
      const { fx } = monta({ value: 30 });
      tasto(pista(fx), 'Enter');
      fx.detectChanges();
      await Promise.resolve();
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      expect(campo.value).toBe('30');
      expect(campo.selectionStart).toBe(0);
      expect(campo.selectionEnd).toBe(2);
    });

    it('Invio nel campo conferma e il focus torna sulla ruota', () => {
      const { fx, c, emessi } = monta({ value: 30 });
      tasto(pista(fx), '6');
      fx.detectChanges();
      c.draft = '65';
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      tasto(campo, 'Enter');
      fx.detectChanges();

      expect(emessi).toEqual([65]);
      expect(c.editing).toBe(false);
      expect(document.activeElement).toBe(pista(fx));
    });

    it('Esc esce senza toccare il valore e restituisce il focus', () => {
      const { fx, c, emessi } = monta({ value: 30 });
      tasto(pista(fx), 'Enter');
      fx.detectChanges();
      c.draft = '99';
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      tasto(campo, 'Escape');
      fx.detectChanges();

      expect(emessi).toEqual([]);
      expect(c.editing).toBe(false);
      expect(c.values[c.index]).toBe(30);
      expect(document.activeElement).toBe(pista(fx));
    });

    it('uscire dal campo col Tab conferma ma non ruba il focus', () => {
      const { fx, c, emessi } = monta({ value: 30 });
      tasto(pista(fx), 'Enter');
      fx.detectChanges();
      c.draft = '40';
      const campo = fx.nativeElement.querySelector('input.wheel-write') as HTMLInputElement;
      campo.dispatchEvent(new Event('blur'));
      fx.detectChanges();

      expect(emessi).toEqual([40]);
      expect(document.activeElement).not.toBe(pista(fx));
    });

    it('a ruota spenta Invio e le cifre non aprono niente', () => {
      const { fx, c } = monta({ value: 30, disabled: true });
      tasto(pista(fx), 'Enter');
      tasto(pista(fx), '5');
      expect(c.editing).toBe(false);
    });
  });
});
