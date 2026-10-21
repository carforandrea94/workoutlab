import { afterEach, describe, it, expect } from 'vitest';
import type { Animation } from '@ionic/angular';
import { ENTRATA, Fotogramma, USCITA, transizionePagina } from './page-transition';

/**
 * La testata non deve restare vuota: il titolo nuovo comincia a farsi vedere
 * mentre il vecchio non e' ancora sparito. Su dissolvenze lineari questo vuol
 * dire che l'entrata parte prima che l'uscita arrivi a zero.
 */
describe('dissolvenze della testata', () => {
  const quando = (frames: Fotogramma[], cond: (o: number) => boolean) => frames.find(f => cond(f.opacity))!.offset;

  it("l'uscita parte quasi piena e arriva a zero", () => {
    expect(USCITA[0].opacity).toBeGreaterThan(0.9);
    expect(USCITA[USCITA.length - 1].opacity).toBe(0);
  });

  it("l'entrata parte quasi invisibile e arriva piena", () => {
    expect(ENTRATA[0].opacity).toBeLessThan(0.1);
    expect(ENTRATA[ENTRATA.length - 1].opacity).toBe(1);
  });

  it("l'entrata comincia a salire prima che l'uscita sia a zero (niente testata vuota)", () => {
    const uscitaFinita = quando(USCITA, o => o === 0);
    // l'ultimo fotogramma "ancora basso" dell'entrata e' il punto da cui sale
    const entrataSale = [...ENTRATA].reverse().find(f => f.opacity < 0.1)!.offset;
    expect(entrataSale).toBeLessThan(uscitaFinita);
  });

  it('gli offset vanno in ordine da 0 a 1', () => {
    for (const frames of [USCITA, ENTRATA]) {
      const offsets = frames.map(f => f.offset);
      expect(offsets[0]).toBe(0);
      expect(offsets[offsets.length - 1]).toBe(1);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    }
  });
});

/**
 * La barra in basso di una pagina interna e' la barra delle tab di quella
 * pagina: nella transizione non scorre di lato con il contenuto (entrava in
 * diagonale e usciva di lato), sale dal fondo con la pagina che entra e ci
 * scende con quella che esce, nella stessa animazione (che il dito, tornando
 * indietro, porta avanti e indietro).
 */
describe('la barra in basso nella transizione', () => {
  function pagina(barra: 'si' | 'nascosta' | 'no', altroPiede = false): HTMLElement {
    const p = document.createElement('div');
    p.className = 'ion-page';
    p.innerHTML = '<ion-header><ion-toolbar><ion-title>Titolo</ion-title></ion-toolbar></ion-header><ion-content></ion-content>'
      + (barra !== 'no' ? '<ion-footer class="barra-azione"><div class="barra-pillola"></div></ion-footer>' : '')
      + (altroPiede ? '<ion-footer class="altro"><div class="dentro"></div></ion-footer>' : '');
    document.body.appendChild(p);
    const f = p.querySelector<HTMLElement>('ion-footer.barra-azione');
    // jsdom non impagina: la barra sta a 700 px dall'alto, alta 52 (o nascosta dalla tastiera).
    if (f) f.getBoundingClientRect = () => ({ top: 700, height: barra === 'si' ? 52 : 0 }) as DOMRect;
    return p;
  }
  const tutte = (a: Animation): Animation[] => [a, ...a.childAnimations.flatMap(tutte)];
  const su = (radice: Animation, el: Element | null) => tutte(radice).filter(a => a.elements.includes(el as HTMLElement));
  const valori = (a: Animation, prop: string) => a.getKeyframes().map(k => (k as any)[prop]).filter(v => v !== undefined);
  const costruisci = (direction: 'forward' | 'back', entra: HTMLElement, esce: HTMLElement) =>
    transizionePagina(document.createElement('div'), { enteringEl: entra, leavingEl: esce, direction } as any);
  // In fondo allo schermo (768 in jsdom) dalla cima della barra (700), piu' l'ombra.
  const SOTTO = `translateY(${768 - 700 + 28}px)`;

  afterEach(() => { document.body.innerHTML = ''; });

  it('entrando in avanti sale dal fondo con la pagina, e la pillola non scorre di lato', () => {
    const entra = pagina('si'), esce = pagina('no');
    const radice = costruisci('forward', entra, esce);
    const barra = su(radice, entra.querySelector('ion-footer.barra-azione'));
    expect(barra.length).toBe(1);
    expect(valori(barra[0], 'transform')).toEqual([SOTTO, 'translateY(0px)']);
    expect(valori(barra[0], 'opacity')).toEqual([0, 1]);
    expect(su(radice, entra.querySelector('.barra-pillola'))).toEqual([]);
  });

  it('tornando indietro scende sul fondo con la pagina che esce, invece di andarsene di lato', () => {
    const entra = pagina('no'), esce = pagina('si');
    const radice = costruisci('back', entra, esce);
    const barra = su(radice, esce.querySelector('ion-footer.barra-azione'));
    expect(barra.length).toBe(1);
    expect(valori(barra[0], 'transform')).toEqual(['translateY(0px)', SOTTO]);
    expect(valori(barra[0], 'opacity')).toEqual([1, 0]);
    expect(su(radice, esce.querySelector('.barra-pillola'))).toEqual([]);
  });

  it('tornando su una pagina che ce l\'ha risale dal fondo; andando avanti da una che ce l\'ha scende', () => {
    const indietro = costruisci('back', pagina('si'), pagina('no'));
    expect(valori(su(indietro, document.querySelectorAll('ion-footer.barra-azione')[0])[0], 'transform')).toEqual([SOTTO, 'translateY(0px)']);
    document.body.innerHTML = '';
    const entra = pagina('no'), esce = pagina('si');
    const avanti = costruisci('forward', entra, esce);
    expect(valori(su(avanti, esce.querySelector('ion-footer.barra-azione'))[0], 'transform')).toEqual(['translateY(0px)', SOTTO]);
  });

  it('nascosta dalla tastiera non si anima', () => {
    const entra = pagina('nascosta');
    const radice = costruisci('forward', entra, pagina('no'));
    expect(su(radice, entra.querySelector('ion-footer.barra-azione'))).toEqual([]);
  });

  it('un altro piede di pagina scorre ancora di lato col contenuto', () => {
    const entra = pagina('no', true);
    const radice = costruisci('forward', entra, pagina('no'));
    const dentro = su(radice, entra.querySelector('ion-footer.altro .dentro'));
    expect(dentro.length).toBeGreaterThan(0);
    expect(valori(dentro[0], 'transform')).toEqual(['translateX(99.5%)', 'translateX(0%)']);
  });
});
