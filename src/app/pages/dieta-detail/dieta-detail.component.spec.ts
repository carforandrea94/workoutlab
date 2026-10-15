import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { beforeAll, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { DietaDetailComponent } from './dieta-detail.component';
import { DietDataService } from '../../services/diet-data.service';
import { DietStateService } from '../../services/diet-state.service';
import { AppStateService } from '../../services/app-state.service';

/**
 * Il template vero, disegnato: le intestazioni cliccabili sono raggiungibili da
 * tastiera (ruolo, Tab, Invio e Spazio, aria-expanded) e fanno quello che
 * facevano col dito.
 */
describe('DietaDetailComponent — accessibilita\' del template', () => {
  const piano = (): any => ({
    id: 'p1', name: 'Giorno ON',
    meals: [
      {
        id: 'm1', name: 'Colazione',
        combinations: [{
          id: 'c1', label: 'Base',
          carb: { name: 'Avena', qty: '80 g', alt: [{ name: 'Riso', qty: '70 g' }] },
          protein: { name: 'Uova', qty: '3' }, fat: null
        }],
        alternatives: { carb: [{ name: 'Pane', qty: '60 g' }], protein: [], fat: [] },
        supplements: []
      },
      {
        id: 'm2', name: 'Pranzo',
        combinations: [{ id: 'c2', label: 'Base', carb: null, protein: { name: 'Pollo', qty: '150 g' }, fat: null }],
        alternatives: { carb: [], protein: [], fat: [] },
        supplements: []
      }
    ]
  });

  // Lo slider si porta sul pasto con scrollIntoView(), che l'ambiente di test non ha.
  // Non si ripristina: il componente lo chiama anche da un setTimeout che scatta
  // dopo l'ultimo test, e ogni file di test ha il suo ambiente.
  beforeAll(() => { HTMLElement.prototype.scrollIntoView = function () {} as any; });

  async function monta(modo: 'list' | 'slider') {
    const patchField = vi.fn(async () => {});
    const viewMode = signal<'list' | 'slider'>(modo);
    TestBed.configureTestingModule({
      imports: [DietaDetailComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ mode: 'p1' }) } } },
        { provide: DietDataService, useValue: { getPlan: () => piano() } },
        { provide: DietStateService, useValue: { viewMode, setViewMode: vi.fn() } },
        { provide: AppStateService, useValue: { load: async () => ({ mealsCompletion: null }), patchField } }
      ]
    });
    const fixture = TestBed.createComponent(DietaDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const tasto = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const aggiorna = async () => { await fixture.whenStable(); fixture.detectChanges(); };
    return { fixture, tutti, tasto, aggiorna, patchField };
  }

  describe('vista elenco', () => {
    it('ogni pasto e\' un button con lo stato aperto/chiuso', async () => {
      const { tutti } = await monta('list');
      const intestazioni = tutti('.meal-summary');
      expect(intestazioni.length).toBe(2);
      for (const h of intestazioni) {
        expect(h.getAttribute('role')).toBe('button');
        expect(h.getAttribute('tabindex')).toBe('0');
        expect(h.getAttribute('aria-expanded')).toBe('true');
      }
    });

    it('Invio sull\'intestazione chiude il pasto, un secondo Invio lo riapre', async () => {
      const { tutti, tasto, aggiorna } = await monta('list');
      const h = tutti('.meal-summary')[0];
      expect(tutti('.content-inner').length).toBe(2);

      tasto(h, 'Enter');
      await aggiorna();
      expect(tutti('.meal-summary')[0].getAttribute('aria-expanded')).toBe('false');
      expect(tutti('.content-inner').length).toBe(1);

      tasto(tutti('.meal-summary')[0], ' ');
      await aggiorna();
      expect(tutti('.meal-summary')[0].getAttribute('aria-expanded')).toBe('true');
      expect(tutti('.content-inner').length).toBe(2);
    });

    it('"Alternative" e\' un button chiuso, e Spazio lo apre', async () => {
      const { tutti, tasto, aggiorna } = await monta('list');
      const header = tutti('.altwrap-header');
      expect(header.length).toBeGreaterThan(0);
      for (const h of header) {
        expect(h.getAttribute('role')).toBe('button');
        expect(h.getAttribute('aria-expanded')).toBe('false');
      }
      const prima = tutti('.altlist').length;

      tasto(header[0], ' ');
      await aggiorna();

      expect(tutti('.altwrap-header')[0].getAttribute('aria-expanded')).toBe('true');
      expect(tutti('.altlist').length).toBe(prima + 1);
    });

    it('ogni pasto ha la sua spunta, accanto all\'intestazione e non dentro', async () => {
      // Dentro l'intestazione (role="button") sarebbe un controllo in un controllo.
      const { tutti } = await monta('list');
      const spunte = tutti('.meal-check');
      expect(spunte.length).toBe(2);
      expect(spunte.map(s => s.getAttribute('role'))).toEqual(['checkbox', 'checkbox']);
      expect(spunte.map(s => s.getAttribute('aria-label'))).toEqual(['Pasto fatto: Colazione', 'Pasto fatto: Pranzo']);
      expect(spunte.map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'false']);
      for (const s of spunte) expect(s.closest('.meal-summary')).toBeNull();
    });

    it('la spunta ha il bersaglio da 44 px', async () => {
      const { tutti } = await monta('list');
      expect(tutti('.meal-check').every(s => s.classList.contains('tap44'))).toBe(true);
    });

    it('toccarla segna il pasto e lo salva, senza aprire o chiudere il pasto', async () => {
      const { tutti, aggiorna, patchField } = await monta('list');
      expect(tutti('.meal-summary')[0].getAttribute('aria-expanded')).toBe('true');

      tutti('.meal-check')[0].click();
      await aggiorna();

      expect(tutti('.meal-check')[0].getAttribute('aria-checked')).toBe('true');
      expect(tutti('.meal-check')[1].getAttribute('aria-checked')).toBe('false');
      expect(tutti('.meal-summary')[0].getAttribute('aria-expanded')).toBe('true');
      expect(patchField).toHaveBeenCalledWith('mealsCompletion', expect.objectContaining({ done: { m1: true, m2: false } }));
    });

    it('da tastiera: Spazio e Invio la cambiano, e di nuovo toglie la spunta', async () => {
      const { tutti, tasto, aggiorna } = await monta('list');
      tasto(tutti('.meal-check')[1], ' ');
      await aggiorna();
      expect(tutti('.meal-check')[1].getAttribute('aria-checked')).toBe('true');

      tasto(tutti('.meal-check')[1], 'Enter');
      await aggiorna();
      expect(tutti('.meal-check')[1].getAttribute('aria-checked')).toBe('false');
    });

    it('l\'intestazione continua ad aprire e chiudere come prima', async () => {
      const { tutti, aggiorna } = await monta('list');
      tutti('.meal-summary')[0].click();
      await aggiorna();
      expect(tutti('.meal-summary')[0].getAttribute('aria-expanded')).toBe('false');
      expect(tutti('.meal-check')[0].getAttribute('aria-checked')).toBe('false');
    });

    it('le intestazioni non hanno ne\' tabindex negativi ne\' ruoli doppi', async () => {
      const { tutti } = await monta('list');
      for (const el of tutti('[appTasto], .tasto')) {
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(['button', 'checkbox']).toContain(el.getAttribute('role'));
      }
    });
  });

  describe('vista slider', () => {
    it('la spunta del pasto e\' un checkbox con nome e stato, e Spazio la cambia', async () => {
      const { tutti, tasto, aggiorna, patchField } = await monta('slider');
      const spunte = tutti('.meal-check');
      expect(spunte.length).toBe(2);
      expect(spunte[0].getAttribute('role')).toBe('checkbox');
      expect(spunte[0].getAttribute('aria-label')).toBe('Pasto fatto: Colazione');
      expect(spunte[0].getAttribute('aria-checked')).toBe('false');

      tasto(spunte[0], ' ');
      await aggiorna();

      expect(tutti('.meal-check')[0].getAttribute('aria-checked')).toBe('true');
      expect(tutti('.meal-check')[1].getAttribute('aria-checked')).toBe('false');
      // E non e' solo un attributo: la spunta viene salvata.
      expect(patchField).toHaveBeenCalledWith('mealsCompletion', expect.objectContaining({ done: { m1: true, m2: false } }));
    });

    it('i trattini hanno nome e dicono quale e\' quello corrente', async () => {
      const { tutti } = await monta('slider');
      const trattini = tutti('.exslider-dash');
      expect(trattini.length).toBe(2);
      expect(trattini.map(t => t.getAttribute('aria-label'))).toEqual(['Vai al pasto 1', 'Vai al pasto 2']);
      expect(trattini.map(t => t.getAttribute('role'))).toEqual(['button', 'button']);
      expect(trattini.filter(t => t.getAttribute('aria-current') === 'true').length).toBe(1);
      expect(trattini[0].getAttribute('aria-current')).toBe('true');
    });

    it('anche nello slider la spunta ha il bersaglio da 44 px', async () => {
      const { tutti } = await monta('slider');
      expect(tutti('.meal-check').every(s => s.classList.contains('tap44'))).toBe(true);
    });

    it('nello slider il titolo del pasto non e\' un controllo che apre qualcosa', async () => {
      const { tutti } = await monta('slider');
      expect(tutti('.meal-summary')[0].getAttribute('role')).toBeNull();
    });
  });
});
