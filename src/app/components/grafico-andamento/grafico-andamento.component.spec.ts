import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GraficoAndamentoComponent } from './grafico-andamento.component';
import { PuntoMisura } from '../../core/utils/grafico-andamento.util';

const PESO: PuntoMisura[] = [
  { date: '2026-07-14', value: 110.9 }, { date: '2026-08-05', value: 109.2 },
  { date: '2026-09-07', value: 107.6 }, { date: '2026-10-21', value: 113.1 }
];

@Component({
  standalone: true,
  imports: [GraficoAndamentoComponent],
  template: `<app-grafico-andamento [punti]="punti()" [nome]="nome()" [unita]="unita()" [traguardo]="traguardo()" [pesate]="pesate()"></app-grafico-andamento>`
})
class Prova {
  readonly punti = signal<PuntoMisura[]>(PESO);
  readonly nome = signal('Peso');
  readonly unita = signal('kg');
  readonly traguardo = signal<{ valore: number; testo: string } | null>(null);
  readonly pesate = signal<PuntoMisura[] | null>(null);
}

/**
 * Il grafico di Andamento in una ion-card: la testata dice il valore e da
 * quando e' cambiato, il dito (o la tastiera) sceglie una misurazione.
 */
describe('GraficoAndamentoComponent', () => {
  function monta(punti: PuntoMisura[] = PESO) {
    const fixture = TestBed.createComponent(Prova);
    fixture.componentInstance.punti.set(punti);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T & Element>(sel) as T | null;
    const testo = (sel: string) => q(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const piano = () => q<HTMLElement>('.andamento-piano')!;
    const tasto = (key: string) => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      piano().dispatchEvent(ev);
      fixture.detectChanges();
      return ev;
    };
    /** Un tocco a `x` pixel dal bordo sinistro del grafico (in jsdom il riquadro e' a zero). */
    const tocca = (x: number, tipo = 'touch', evento = 'pointerdown') => {
      const ev = new MouseEvent(evento, { bubbles: true, clientX: x });
      Object.defineProperty(ev, 'pointerType', { value: tipo });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      piano().dispatchEvent(ev);
      fixture.detectChanges();
    };
    const x = (i: number) => Number(q(`.andamento-piano circle.pallino:nth-of-type(${i + 1})`)?.getAttribute('cx'));
    return { fixture, q, testo, piano, tasto, tocca, x };
  }

  it('e\' una ion-card con il nome della misura nel titolo', () => {
    const { q, testo } = monta();
    expect(q('ion-card.andamento-card')).not.toBeNull();
    expect(testo('ion-card-title')).toBe('Peso');
  });

  it('in testa l\'ultimo valore, il giorno e la variazione dalla prima misura', () => {
    const { testo, q } = monta();
    expect(testo('.lettura')).toBe('113,1kg');
    expect(testo('.lettura-quando')).toBe('21 ott · +2,2 kg dal 14 lug');
    // Senza giudizio: ne' rosso ne' verde.
    expect(q('.lettura-quando .delta')!.className).toBe('delta');
  });

  it('se e\' tornata dov\'era dice "uguale", non "0 kg"', () => {
    const { testo } = monta([{ date: '2026-07-14', value: 80 }, { date: '2026-08-01', value: 80.02 }]);
    expect(testo('.lettura-quando')).toBe('1 ago · uguale al 14 lug');
  });

  it('se le misure stanno in anni diversi le date hanno l\'anno', () => {
    const { testo } = monta([{ date: '2025-12-20', value: 80 }, { date: '2026-01-10', value: 81 }]);
    expect(testo('.lettura-quando')).toBe('10 gen 2026 · +1 kg dal 20 dic 2025');
  });

  it('con una sola misura niente linea: il valore e un invito', () => {
    const { q, testo } = monta([{ date: '2026-07-14', value: 80 }]);
    expect(q('.andamento-piano')).toBeNull();
    expect(testo('.lettura')).toBe('80kg');
    expect(testo('.lettura-quando')).toBe('14 lug · prima misura');
    expect(testo('.andamento-vuoto')).toContain('prossima misurazione');
  });

  it('l\'SVG e\' disegnato alla sua misura, non stirato', () => {
    const { q } = monta();
    const svg = q('.andamento-piano svg')!;
    expect(svg.getAttribute('preserveAspectRatio')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('l\'asse dei valori ha numeri tondi con la virgola, le date i mesi', () => {
    const { q } = monta();
    const scritte = Array.from(q('.andamento-piano svg')!.querySelectorAll('text.asse')).map(t => t.textContent!.trim());
    expect(scritte).toEqual(['106', '108', '110', '112', '114', 'ago', 'set', 'ott']);
  });

  it('per lo screen reader e\' un cursore che dice giorno e valore', () => {
    const { piano } = monta();
    const p = piano();
    expect(p.getAttribute('role')).toBe('slider');
    expect(p.getAttribute('tabindex')).toBe('0');
    expect(p.getAttribute('aria-label')).toBe('Andamento di Peso');
    expect(p.getAttribute('aria-valuemin')).toBe('1');
    expect(p.getAttribute('aria-valuemax')).toBe('4');
    expect(p.getAttribute('aria-valuenow')).toBe('4');
    expect(p.getAttribute('aria-valuetext')).toBe('21 ottobre 2026: 113,1 kg');
  });

  describe('da tastiera', () => {
    it('la freccia a sinistra va alla misurazione prima, e la testata la racconta', () => {
      const { tasto, testo, piano, q } = monta();
      const ev = tasto('ArrowLeft');
      expect(ev.defaultPrevented).toBe(true);
      expect(testo('.lettura')).toBe('107,6kg');
      expect(testo('.lettura-quando')).toBe('7 set · -3,3 kg dal 14 lug');
      expect(piano().getAttribute('aria-valuenow')).toBe('3');
      expect(piano().getAttribute('aria-valuetext')).toBe('7 settembre 2026: 107,6 kg');
      expect(q('.andamento-piano line.mirino')).not.toBeNull();
    });

    it('Inizio porta alla prima, Fine all\'ultima; oltre i bordi non si va', () => {
      const { tasto, testo } = monta();
      tasto('Home');
      expect(testo('.lettura-quando')).toBe('14 lug · prima misura');
      tasto('ArrowLeft');
      expect(testo('.lettura')).toBe('110,9kg');
      tasto('End');
      tasto('ArrowRight');
      expect(testo('.lettura')).toBe('113,1kg');
    });

    it('Esc torna all\'ultima senza mirino; a riposo non lo ruba a nessuno', () => {
      const { tasto, q } = monta();
      tasto('Home');
      const esc = tasto('Escape');
      expect(esc.defaultPrevented).toBe(true);
      expect(q('.andamento-piano line.mirino')).toBeNull();
      expect(tasto('Escape').defaultPrevented).toBe(false);
      expect(tasto('a').defaultPrevented).toBe(false);
    });
  });

  describe('col dito', () => {
    it('un tocco sceglie la misurazione piu\' vicina e la scelta resta', () => {
      const { tocca, x, testo, q } = monta();
      tocca(x(2) + 4);
      tocca(0, 'touch', 'pointerup');
      expect(testo('.lettura')).toBe('107,6kg');
      expect(Number(q('.andamento-piano line.mirino')!.getAttribute('x1'))).toBe(x(2));
      tocca(0, 'touch', 'pointerleave');
      expect(testo('.lettura')).toBe('107,6kg');
    });

    it('trascinando la lettura segue il dito; lasciato, il movimento non sceglie piu\'', () => {
      const { tocca, x, testo } = monta();
      tocca(x(0));
      tocca(x(1), 'touch', 'pointermove');
      expect(testo('.lettura')).toBe('109,2kg');
      tocca(0, 'touch', 'pointerup');
      tocca(x(3), 'touch', 'pointermove');
      expect(testo('.lettura')).toBe('109,2kg');
    });

    it('col mouse basta passarci sopra, e uscendo si torna all\'ultima', () => {
      const { tocca, x, testo, q } = monta();
      tocca(x(1), 'mouse', 'pointermove');
      expect(testo('.lettura')).toBe('109,2kg');
      tocca(0, 'mouse', 'pointerleave');
      expect(testo('.lettura')).toBe('113,1kg');
      expect(q('.andamento-piano line.mirino')).toBeNull();
    });

    it('cambiando misura la scelta riparte dall\'ultima', () => {
      const { tocca, x, testo, fixture } = monta();
      tocca(x(0));
      expect(testo('.lettura')).toBe('110,9kg');
      fixture.componentInstance.nome.set('Vita');
      fixture.componentInstance.unita.set('cm');
      fixture.componentInstance.punti.set([{ date: '2026-07-14', value: 104 }, { date: '2026-10-21', value: 99.5 }]);
      fixture.detectChanges();
      expect(testo('.lettura')).toBe('99,5cm');
      expect(testo('.lettura-quando')).toBe('21 ott · -4,5 cm dal 14 lug');
    });
  });

  it('i pallini: uno per misurazione, l\'ultimo piu\' grande', () => {
    const { q } = monta();
    const pallini = Array.from(q('.andamento-piano svg')!.querySelectorAll('circle.pallino'));
    expect(pallini.length).toBe(4);
    expect(pallini[3].classList.contains('ultimo')).toBe(true);
    expect(Number(pallini[3].getAttribute('r'))).toBeGreaterThan(Number(pallini[0].getAttribute('r')));
  });

  it('senza traguardo niente linea e niente riga in testa', () => {
    const { q } = monta();
    expect(q('.andamento-piano line.traguardo')).toBeNull();
    expect(q('.lettura-traguardo')).toBeNull();
  });

  it('col traguardo: la linea tratteggiata con la sua scritta, e in testa quanto manca', () => {
    const fixture = TestBed.createComponent(Prova);
    fixture.componentInstance.traguardo.set({ valore: 105, testo: 'Traguardo 105 kg · mancano 8,1 kg' });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const linea = root.querySelector('.andamento-piano line.traguardo')!;
    expect(linea).not.toBeNull();
    expect(linea.getAttribute('y1')).toBe(linea.getAttribute('y2'));
    expect(root.querySelector('.andamento-piano text.traguardo-scritta')!.textContent!.trim()).toBe('traguardo');
    expect(root.querySelector('.lettura-traguardo')!.textContent!.trim()).toBe('Traguardo 105 kg · mancano 8,1 kg');
    // Sotto la linea dei dati: la linea del traguardo viene prima nel disegno.
    const ordine = Array.from(root.querySelectorAll('.andamento-piano svg > *')).map(e => e.getAttribute('class'));
    expect(ordine.indexOf('traguardo')).toBeLessThan(ordine.indexOf('linea'));
  });

  describe('con le pesate sotto la media', () => {
    const PESATE: PuntoMisura[] = [
      { date: '2026-10-19', value: 114 }, { date: '2026-10-21', value: 113 }, { date: '2026-10-23', value: 112 }
    ];
    const MEDIA: PuntoMisura[] = [
      { date: '2026-10-19', value: 114 }, { date: '2026-10-21', value: 113.5 }, { date: '2026-10-23', value: 113 }
    ];
    function conPesate(traguardo: { valore: number; testo: string } | null = null) {
      const m = monta(MEDIA);
      m.fixture.componentInstance.pesate.set(PESATE);
      m.fixture.componentInstance.traguardo.set(traguardo);
      m.fixture.detectChanges();
      return m;
    }

    it('un punto grigio per pesata, e la linea senza i suoi pallini (resta l\'ultimo)', () => {
      const { fixture } = conPesate();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelectorAll('.andamento-piano circle.pesata').length).toBe(3);
      expect(root.querySelector('.andamento-piano path.area')).toBeNull();
      expect(Array.from(root.querySelectorAll('.andamento-piano circle.pallino')).map(c => c.getAttribute('class'))).toEqual(['pallino ultimo']);
    });

    it('in testa il valore della media e la pesata di quel giorno', () => {
      const { testo, tasto } = conPesate();
      expect(testo('.lettura')).toBe('113kg');
      expect(testo('.lettura-quando')).toBe('23 ott · pesata 112 kg · -1 kg dal 19 ott');
      tasto('ArrowLeft');
      expect(testo('.lettura')).toBe('113,5kg');
      expect(testo('.lettura-quando')).toBe('21 ott · pesata 113 kg · -0,5 kg dal 19 ott');
    });

    it('lo screen reader sente la media e la pesata', () => {
      const { piano } = conPesate();
      expect(piano().getAttribute('aria-valuetext')).toBe('23 ottobre 2026: 113 kg, pesata 112 kg');
    });

    it('la legenda dice le due serie con la forma del segno; col traguardo anche lui', () => {
      const { q, fixture } = conPesate();
      const leggenda = () => q('.leggenda');
      expect(leggenda()!.getAttribute('aria-hidden')).toBe('true');
      const voci = () => Array.from(leggenda()!.querySelectorAll('span')).map(s => [s.querySelector('i')!.className, s.textContent!.trim()]);
      expect(voci()).toEqual([['m', 'media di 7 giorni'], ['p', 'pesate']]);
      fixture.componentInstance.traguardo.set({ valore: 110, testo: 'Traguardo 110 kg · mancano 3 kg' });
      fixture.detectChanges();
      expect(voci()).toEqual([['m', 'media di 7 giorni'], ['p', 'pesate'], ['t', 'traguardo']]);
    });

    it('senza pesate niente legenda e niente pesata in testa', () => {
      const { q, testo, piano } = monta();
      expect(q('.leggenda')).toBeNull();
      expect(q('circle.pesata')).toBeNull();
      expect(q('.andamento-piano path.area')).not.toBeNull();
      expect(testo('.lettura-quando')).not.toContain('pesata');
      expect(piano().getAttribute('aria-valuetext')).not.toContain('pesata');
    });
  });
});
