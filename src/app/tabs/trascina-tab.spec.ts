import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTESA_MS, Corsia, SOGLIA_PX, TrascinaTab, indiceSotto, spostamento } from './trascina-tab';

/** Cinque tab larghe 70 px a partire da x = 20: la prima va da 20 a 90, l'ultima da 300 a 370. */
const CORSIA: Corsia = { inizio: 20, passo: 70, n: 5 };

describe('indiceSotto', () => {
  it('la tab sotto il dito', () => {
    expect(indiceSotto(20, CORSIA)).toBe(0);
    expect(indiceSotto(89, CORSIA)).toBe(0);
    expect(indiceSotto(90, CORSIA)).toBe(1);
    expect(indiceSotto(200, CORSIA)).toBe(2);
    expect(indiceSotto(369, CORSIA)).toBe(4);
  });

  it('oltre i bordi della fila, la prima o l\'ultima', () => {
    expect(indiceSotto(0, CORSIA)).toBe(0);
    expect(indiceSotto(-50, CORSIA)).toBe(0);
    expect(indiceSotto(370, CORSIA)).toBe(4);
    expect(indiceSotto(500, CORSIA)).toBe(4);
  });
});

describe('spostamento', () => {
  it('la pastiglia sta centrata sul dito', () => {
    // Col dito a 200 il centro della pastiglia (larga 70) e' a 200: parte da 165, 145 dopo la prima tab.
    expect(spostamento(200, CORSIA)).toBe(145);
    // Al centro della seconda tab sta esattamente sul suo posto.
    expect(spostamento(125, CORSIA)).toBe(70);
  });

  it('non esce dalla fila', () => {
    expect(spostamento(30, CORSIA)).toBe(0);
    expect(spostamento(-100, CORSIA)).toBe(0);
    expect(spostamento(360, CORSIA)).toBe(280);
    expect(spostamento(1000, CORSIA)).toBe(280);
  });
});

/**
 * Il gesto su una barra finta: cinque tasti con le misure di CORSIA, una
 * pastiglia, e gli eventi del dito mandati a mano.
 */
describe('TrascinaTab', () => {
  let barra: HTMLElement;
  let tasti: HTMLElement[];
  let pastiglia: HTMLElement;
  let lenti: (number | null)[];
  let scelte: [number, boolean][];
  let gesto: TrascinaTab;

  const rett = (left: number, width: number) =>
    ({ left, right: left + width, width, top: 0, bottom: 60, height: 60, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

  beforeEach(() => {
    vi.useFakeTimers();
    barra = document.createElement('div');
    pastiglia = document.createElement('div');
    pastiglia.className = 'pill';
    barra.appendChild(pastiglia);
    tasti = Array.from({ length: 5 }, (_, i) => {
      const t = document.createElement('button');
      t.getBoundingClientRect = () => rett(CORSIA.inizio + i * CORSIA.passo, CORSIA.passo);
      barra.appendChild(t);
      return t;
    });
    document.body.appendChild(barra);
    lenti = [];
    scelte = [];
    gesto = new TrascinaTab(barra, () => tasti, () => pastiglia, {
      lente: i => lenti.push(i),
      scegli: (i, scorso) => scelte.push([i, scorso])
    });
  });

  afterEach(() => {
    gesto.distruggi();
    barra.remove();
    vi.useRealTimers();
  });

  const dito = (tipo: string, x: number, y = 30, su: Element = tasti[0], extra: PointerEventInit = {}) =>
    su.dispatchEvent(new PointerEvent(tipo, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, cancelable: true, ...extra }));
  const clic = (su: Element = tasti[0], detail = 1) => {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
    const arrivato = vi.fn();
    su.addEventListener('click', arrivato);
    su.dispatchEvent(e);
    su.removeEventListener('click', arrivato);
    return { arrivato: arrivato.mock.calls.length > 0, bloccato: e.defaultPrevented };
  };

  it('un tocco resta un tocco: niente lente, niente scelta, il clic passa', () => {
    dito('pointerdown', 50);
    dito('pointermove', 50 + SOGLIA_PX - 1);
    dito('pointerup', 50 + SOGLIA_PX - 1);
    expect(lenti).toEqual([]);
    expect(scelte).toEqual([]);
    expect(clic()).toEqual({ arrivato: true, bloccato: false });
  });

  it('scorrendo di lato la lente si alza, segue il dito e alzandolo si apre la tab sotto', () => {
    dito('pointerdown', 50);
    dito('pointermove', 50 + SOGLIA_PX);
    expect(lenti).toEqual([0]);
    // Col dito a 58 il centro della pastiglia andrebbe a 58: 3 px dopo il posto della prima.
    expect(pastiglia.style.transform).toBe('translateX(3px)');

    dito('pointermove', 200);
    dito('pointermove', 210);
    // La tab sotto il dito si dice solo quando cambia.
    expect(lenti).toEqual([0, 2]);
    expect(pastiglia.style.transform).toBe('translateX(155px)');

    dito('pointermove', 330);
    dito('pointerup', 330);
    expect(scelte).toEqual([[4, true]]);
    // La scelta arriva prima della lente che si posa, e la pastiglia torna alla sua classe.
    expect(lenti).toEqual([0, 2, 4, null]);
    expect(pastiglia.style.transform).toBe('');
  });

  it('dopo un trascinamento il clic che segue non apre la tab e non segue il link', () => {
    dito('pointerdown', 50);
    dito('pointermove', 200);
    dito('pointerup', 200);
    expect(clic()).toEqual({ arrivato: false, bloccato: true });
    // Solo quello: il tocco dopo passa.
    dito('pointerdown', 50);
    dito('pointerup', 50);
    expect(clic()).toEqual({ arrivato: true, bloccato: false });
  });

  it('un clic rimasto da bloccare non tocca il tocco successivo, ne\' la tastiera', () => {
    // Trascinamento finito senza clic dal browser.
    dito('pointerdown', 50);
    dito('pointermove', 200);
    dito('pointerup', 200);
    // Invio sulla tab (detail 0) passa anche cosi'.
    expect(clic(tasti[1], 0)).toEqual({ arrivato: true, bloccato: false });
    dito('pointerdown', 50);
    dito('pointerup', 50);
    expect(clic()).toEqual({ arrivato: true, bloccato: false });
  });

  it('premuto fermo a lungo la lente si alza, e alzando il dito vale come un tocco su quella tab', () => {
    dito('pointerdown', 130, 30, tasti[1]);
    vi.advanceTimersByTime(ATTESA_MS - 1);
    expect(lenti).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lenti).toEqual([1]);
    dito('pointerup', 130, 30, tasti[1]);
    expect(scelte).toEqual([[1, false]]);
    expect(clic(tasti[1])).toEqual({ arrivato: false, bloccato: true });
  });

  it('premuto a lungo e poi scorso, e\' uno scorrimento', () => {
    dito('pointerdown', 130, 30, tasti[1]);
    vi.advanceTimersByTime(ATTESA_MS);
    dito('pointermove', 132);
    dito('pointermove', 280);
    dito('pointerup', 280);
    expect(scelte).toEqual([[3, true]]);
  });

  it('verso l\'alto non e\' un gesto della barra', () => {
    dito('pointerdown', 50, 30);
    dito('pointermove', 52, 30 - SOGLIA_PX - 4);
    dito('pointermove', 200, 0);
    vi.advanceTimersByTime(ATTESA_MS * 2);
    dito('pointerup', 200, 0);
    expect(lenti).toEqual([]);
    expect(scelte).toEqual([]);
  });

  it('un gesto interrotto dal sistema non sceglie niente', () => {
    dito('pointerdown', 50);
    dito('pointermove', 200);
    dito('pointercancel', 200);
    dito('pointerup', 200);
    expect(scelte).toEqual([]);
    expect(lenti).toEqual([2, null]);
    expect(pastiglia.style.transform).toBe('');
  });

  it('perso il dito dalla barra il gesto finisce; perso da un tasto (che lo passa alla barra) no', () => {
    dito('pointerdown', 50);
    dito('pointermove', 200);
    tasti[0].dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }));
    expect(lenti).toEqual([2]);
    barra.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }));
    expect(lenti).toEqual([2, null]);
  });

  it('un secondo dito, un tasto destro o un dito non primario non cominciano niente', () => {
    dito('pointerdown', 50, 30, tasti[0], { button: 2 });
    dito('pointermove', 200);
    dito('pointerdown', 50, 30, tasti[0], { isPrimary: false, pointerId: 2 });
    dito('pointermove', 200, 30, tasti[0], { pointerId: 2 });
    expect(lenti).toEqual([]);

    dito('pointerdown', 50);
    dito('pointerdown', 300, 30, tasti[4], { pointerId: 3 });
    dito('pointermove', 200);
    dito('pointermove', 330, 30, tasti[4], { pointerId: 3 });
    dito('pointerup', 200);
    expect(scelte).toEqual([[2, true]]);
  });

  it('durante il gesto niente menu del link; fuori dal gesto si', () => {
    const menu = () => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); tasti[0].dispatchEvent(e); return e.defaultPrevented; };
    expect(menu()).toBe(false);
    dito('pointerdown', 50);
    expect(menu()).toBe(true);
    dito('pointerup', 50);
    expect(menu()).toBe(false);
  });

  it('distrutto, non ascolta piu\'', () => {
    gesto.distruggi();
    dito('pointerdown', 50);
    dito('pointermove', 200);
    dito('pointerup', 200);
    expect(lenti).toEqual([]);
    expect(scelte).toEqual([]);
  });
});
