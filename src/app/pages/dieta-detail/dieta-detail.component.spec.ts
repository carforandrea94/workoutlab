import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { controllaBarraInBasso } from '../../../test-support/barra-azione';
import { DietaDetailComponent } from './dieta-detail.component';
import { DietDataService } from '../../services/diet-data.service';
import { DietStateService } from '../../services/diet-state.service';
import { AppStateService } from '../../services/app-state.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { GiornoService } from '../../core/giorno.service';

/**
 * Il piano alimentare, disegnato davvero. Le intestazioni cliccabili sono
 * raggiungibili da tastiera; in ogni pasto si sceglie cosa si mangia (la
 * combinazione e, per macro, l'alimento) e la scelta si salva col giorno.
 */
describe('DietaDetailComponent', () => {
  const piano = (): any => ({
    id: 'p1', name: 'Giorno ON',
    meals: [
      {
        id: 'm1', name: 'Colazione',
        combinations: [
          {
            id: 'c1', label: 'Base',
            carb: { name: 'Avena', qty: '80 g', alt: [{ name: 'Riso', qty: '70 g' }] },
            protein: { name: 'Uova', qty: '3' }, fat: null
          },
          { id: 'c1b', label: 'Dolce', carb: { name: 'Pancake', qty: '100 g' }, protein: { name: 'Whey', qty: '30 g' }, fat: null }
        ],
        // Il grasso non c'e' nella Base, ma il pasto ha un'alternativa per lui.
        alternatives: { carb: [{ name: 'Pane', qty: '60 g' }], protein: [], fat: [{ name: 'Mandorle', qty: '15 g' }] },
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
  // Il segmento dei pasti porta in vista il suo bottone con scrollTo(): idem.
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = function () {} as any;
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollLeft = o?.left ?? 0; } as any;
  });

  async function monta(modo: 'list' | 'slider', mealsCompletion: any = null) {
    const patchField = vi.fn(async (_k: string, _v: any) => {});
    const viewMode = signal<'list' | 'slider'>(modo);
    TestBed.configureTestingModule({
      imports: [DietaDetailComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ mode: 'p1' }) } } },
        { provide: DietDataService, useValue: { getPlan: () => piano() } },
        { provide: DietStateService, useValue: { viewMode, setViewMode: vi.fn() } },
        { provide: AppStateService, useValue: { load: async () => ({ mealsCompletion }), patchField } }
      ]
    });
    const fixture = TestBed.createComponent(DietaDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => tutti(sel).map(e => (e.textContent ?? '').trim().replace(/\s+/g, ' '));
    const tasto = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const aggiorna = async () => { await fixture.whenStable(); fixture.detectChanges(); };
    /** Le chiamate fatte a mano (non da un evento del template) aggiornano la vista come fa il componente. */
    const ridisegna = () => (c as any).cdr.detectChanges();
    /** ion-button sposta aria-label dall'host al <button> interno: si legge dove sta. */
    const etichetta = (el: HTMLElement) => el.getAttribute('aria-label') ?? el.shadowRoot?.querySelector('button')?.getAttribute('aria-label') ?? (el as any).inheritedAttributes?.['aria-label'] ?? null;
    /** L'ultimo giorno scritto con patchField. */
    const salvato = () => {
      const chiamate = patchField.mock.calls.filter(k => k[0] === 'mealsCompletion');
      return chiamate.length ? chiamate[chiamate.length - 1][1] : null;
    };
    return { fixture, c, root, tutti, testo, tasto, aggiorna, ridisegna, etichetta, patchField, salvato };
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

    it('il giorno va anche nella storia dei pasti, per il bilancio della settimana', async () => {
      const { tutti, aggiorna, patchField } = await monta('list');
      tutti('.meal-check')[0].click();
      await aggiorna();
      await vi.waitFor(() => expect(patchField).toHaveBeenCalledWith('pastiGiorni', { [todayLocalISO()]: { fatti: 1, totali: 2 } }));
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

    it('nell\'elenco il tasto in fondo non c\'e\': ogni pasto ha la sua spunta', async () => {
      const { tutti } = await monta('list');
      expect(tutti('ion-footer').length).toBe(0);
      // e il contenuto non tiene lo spazio per una barra che non c'e'.
      expect(tutti('ion-content')[0].classList.contains('con-barra')).toBe(false);
    });
  });

  describe('la giornata', () => {
    it('il titolo e\' il piano: Giorno ON, non "Piano alimentare"', async () => {
      const { testo } = await monta('list');
      expect(testo('ion-title .navtitle')).toEqual(['Giorno ON']);
      expect(testo('p.sectiontitle')).toEqual([]);
    });

    it('dice quanti pasti sono fatti, e la barra segue', async () => {
      const { testo, tutti, aggiorna } = await monta('list');
      expect(testo('.dayprog-cnt')).toEqual(['0 di 2 pasti']);
      expect((tutti('ion-progress-bar')[0] as any).value).toBe(0);

      tutti('.meal-check')[0].click();
      await aggiorna();

      expect(testo('.dayprog-cnt')).toEqual(['1 di 2 pasti']);
      expect((tutti('ion-progress-bar')[0] as any).value).toBe(0.5);
    });
  });

  describe('cosa si mangia', () => {
    it('con piu\' combinazioni c\'e\' la riga per sceglierla, con il nome e la posizione', async () => {
      const { tutti, testo } = await monta('list');
      const righe = tutti('button.comborow');
      expect(righe.length).toBe(1);   // solo la Colazione: il Pranzo ne ha una
      expect(testo('button.comborow')[0]).toContain('Base · 1 di 2');
      expect(righe[0].getAttribute('type')).toBe('button');
      expect(righe[0].getAttribute('aria-label')).toBe('Combinazione Base, 1 di 2. Cambia combinazione');
    });

    it('ogni macro mostra l\'alimento del piano con la sua quantita\'', async () => {
      const { testo } = await monta('list');
      expect(testo('.scelta-testo .fname').slice(0, 2)).toEqual(['Avena', 'Uova']);
      expect(testo('.scelta-testo .fqty').slice(0, 2)).toEqual(['80 g', '3']);
    });

    it('"Cambia" c\'e\' solo dove ci sono alternative, e dice cosa cambia e quante sono', async () => {
      const { tutti, etichetta } = await monta('list');
      const etichette = tutti('ion-button.cambia-btn').map(b => etichetta(b));
      expect(etichette).toEqual([
        'Cambia Carboidrati: Avena, 2 alternative',      // Riso (dell'alimento) + Pane (del pasto)
        'Cambia Grassi: nessuno, 1 alternativa'           // Mandorle: solo del pasto
      ]);
    });

    it('un macro che la combinazione non prevede, ma che ha alternative, si mostra e si puo\' scegliere', async () => {
      const { testo } = await monta('list');
      expect(testo('.scelta-vuota')).toEqual(['Non previsto in questa combinazione']);
    });

    it('un macro senza alimento e senza alternative non si mostra', async () => {
      const { testo } = await monta('list');
      // Il Pranzo ha solo le proteine.
      const categorie = testo('.fooditem-category');
      expect(categorie.filter(c => c === 'Proteine').length).toBe(2);
      expect(categorie.filter(c => c === 'Carboidrati').length).toBe(1);
    });

    it('non ci sono piu\' le due fisarmoniche "Alternative": le alternative si scelgono da "Cambia"', async () => {
      const { tutti } = await monta('list');
      expect(tutti('.altwrap, .altwrap-header, .altlist').length).toBe(0);
    });
  });

  describe('scegliere la combinazione', () => {
    it('la riga apre il foglio della combinazione', async () => {
      const { c, tutti, aggiorna } = await monta('list');
      tutti('button.comborow')[0].click();
      await aggiorna();
      expect(c.foglioAperto).toBe(true);
      expect(c.foglio?.tipo).toBe('combo');
      expect(c.valoreFoglio(c.foglio!)).toBe('c1');
    });

    it('sceglierne un\'altra cambia tutto il pasto, chiude il foglio e la salva col giorno', async () => {
      const { c, testo, aggiorna, salvato } = await monta('list');
      c.apriCombo(c.meals[0]);
      c.scegliNelFoglio(c.foglio!, 'c1b', new MouseEvent('click'));
      await aggiorna();

      expect(c.foglioAperto).toBe(false);
      expect(testo('button.comborow')[0]).toContain('Dolce · 2 di 2');
      expect(testo('.scelta-testo .fname').slice(0, 2)).toEqual(['Pancake', 'Whey']);
      expect(salvato()).toEqual({ date: todayLocalISO(), done: { m1: false, m2: false }, choices: { m1: { combo: 'c1b' } } });
    });

    it('tornare alla prima e\' tornare al piano: non resta niente da salvare', async () => {
      const { c, salvato } = await monta('list');
      c.apriCombo(c.meals[0]);
      c.scegliNelFoglio(c.foglio!, 'c1b');
      c.apriCombo(c.meals[0]);
      c.scegliNelFoglio(c.foglio!, 'c1');
      expect(salvato()).toEqual({ date: todayLocalISO(), done: { m1: false, m2: false } });
    });

    it('cambiare combinazione azzera i cambi fatti sull\'altra', async () => {
      const { c } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'pasto:Pane');
      expect(c.meals[0].scelta?.macro?.carb).toBeTruthy();

      c.apriCombo(c.meals[0]);
      c.scegliNelFoglio(c.foglio!, 'c1b');
      expect(c.meals[0].scelta).toEqual({ combo: 'c1b' });
    });
  });

  describe('cambiare un alimento', () => {
    it('"Cambia" apre il foglio di quel macro', async () => {
      const { c, tutti, aggiorna } = await monta('list');
      tutti('ion-button.cambia-btn')[0].click();
      await aggiorna();
      expect(c.foglio).toEqual(expect.objectContaining({ tipo: 'macro', cat: 'carb' }));
      expect(c.valoreFoglio(c.foglio!)).toBe('base');
    });

    it('il foglio mette in fila il piano, le alternative dell\'alimento e quelle del pasto', async () => {
      const { c } = await monta('list');
      const o = c.opzioni(c.meals[0], 'carb');
      expect(o.base?.name).toBe('Avena');
      expect(o.alimento.map(a => a.name)).toEqual(['Riso']);
      expect(o.pasto.map(a => a.name)).toEqual(['Pane']);
    });

    it('sceglierne una la mostra nella card come "scelta tua" e la salva', async () => {
      const { c, testo, aggiorna, salvato } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'pasto:Pane', new MouseEvent('click'));
      await aggiorna();

      expect(testo('.scelta-testo .fname')[0]).toBe('Pane, scelta tua');
      expect(testo('.scelta-testo .fqty')[0]).toBe('60 g');
      expect(salvato()?.choices).toEqual({ m1: { macro: { carb: { fonte: 'pasto', nome: 'Pane' } } } });
    });

    it('scegliere di nuovo il piano toglie "scelta tua" e la scelta salvata', async () => {
      const { c, testo, aggiorna, salvato } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'alimento:Riso');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'base');
      await aggiorna();

      expect(testo('.scelta-tua')).toEqual([]);
      expect(salvato()?.choices).toBeUndefined();
    });

    it('il grasso che la Base non prevede si puo\' aggiungere dalle alternative del pasto', async () => {
      const { c, testo, aggiorna } = await monta('list');
      c.apriMacro(c.meals[0], 'fat');
      c.scegliNelFoglio(c.foglio!, 'pasto:Mandorle');
      await aggiorna();
      expect(testo('.scelta-vuota')).toEqual([]);
      expect(testo('.scelta-testo .fname')).toContain('Mandorle, scelta tua');
    });
  });

  describe('il foglio e la tastiera', () => {
    it('una scelta fatta con le frecce aggiorna la card ma non chiude il foglio', async () => {
      // Nel gruppo di radio le frecce spostano E scelgono: chiudere alla prima
      // impedirebbe a chi usa la tastiera di scorrere le opzioni.
      const { c, testo, aggiorna } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'alimento:Riso', new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await aggiorna();
      expect(c.foglioAperto).toBe(true);
      expect(testo('.scelta-testo .fname')[0]).toBe('Riso, scelta tua');
    });

    it('col dito (o con Spazio, che arriva come click) la scelta chiude il foglio', async () => {
      const { c } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'alimento:Riso', new MouseEvent('click'));
      expect(c.foglioAperto).toBe(false);
    });

    it('il contenuto resta finche\' il foglio non e\' sceso del tutto', async () => {
      const { c } = await monta('list');
      c.apriMacro(c.meals[0], 'carb');
      c.scegliNelFoglio(c.foglio!, 'alimento:Riso');
      expect(c.foglio).not.toBeNull();     // sta scendendo: se sparisse, scenderebbe vuoto
      c.foglioChiuso();
      expect(c.foglio).toBeNull();
      expect(c.foglioAperto).toBe(false);
    });
  });

  describe('il giorno salvato', () => {
    const oggi = (extra: any = {}) => ({ date: todayLocalISO(), done: { m1: true }, ...extra });

    it('riapre con le scelte di oggi', async () => {
      const { c, testo } = await monta('list', oggi({ choices: { m1: { combo: 'c1b' } } }));
      expect(c.meals[0].completed).toBe(true);
      expect(testo('button.comborow')[0]).toContain('Dolce · 2 di 2');
    });

    it('le scelte di un altro giorno non valgono', async () => {
      const { c } = await monta('list', { date: '2000-01-01', done: { m1: true }, choices: { m1: { combo: 'c1b' } } });
      expect(c.meals[0].completed).toBe(false);
      expect(c.meals[0].scelta).toBeUndefined();
    });

    it('una scelta che il piano non ha piu\' torna al piano senza rompere niente', async () => {
      const { c, testo } = await monta('list', oggi({ choices: { m1: { combo: 'sparita', macro: { carb: { fonte: 'pasto', nome: 'Tolta' } } } } }));
      expect(c.meals[0].scelta).toBeUndefined();
      expect(testo('button.comborow')[0]).toContain('Base · 1 di 2');
    });

    it('salvando non cancella i pasti e le scelte degli altri piani', async () => {
      // Il Giorno OFF ha i suoi pasti: prima, segnare qui li cancellava.
      const { c, salvato } = await monta('list', oggi({ done: { m1: true, off1: true }, choices: { off1: { combo: 'x' } } }));
      c.toggleMealCompleted(c.meals[1]);
      expect(salvato()).toEqual({
        date: todayLocalISO(),
        done: { off1: true, m1: true, m2: true },
        choices: { off1: { combo: 'x' } }
      });
    });

    it('a mezzanotte, a pagina aperta, la giornata riparte: niente spunte ne\' scelte di ieri salvate come di oggi', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 25, 23, 59));
      try {
        const { c, testo, salvato } = await monta('slider', { date: '2026-10-25', done: { m1: true, off1: true }, choices: { m1: { combo: 'c1b' }, off1: { combo: 'x' } } });
        expect(c.meals[0].completed).toBe(true);
        expect(c.sliderIndex).toBe(1);
        const scorri = vi.spyOn(c, 'scrollToIndex');

        vi.setSystemTime(new Date(2026, 9, 26, 0, 0, 1));
        TestBed.inject(GiornoService).controlla();
        expect(c.meals.map(vm => vm.completed)).toEqual([false, false]);
        expect(c.meals[0].scelta).toBeUndefined();
        expect(c.sliderIndex).toBe(0);
        // Lo slider torna sul primo pasto, non resta sulla card di ieri.
        expect(scorri).toHaveBeenLastCalledWith(0, false);
        expect(testo('button.comborow')[0]).toContain('Base · 1 di 2');

        c.toggleMealCompleted(c.meals[1]);
        expect(salvato()).toEqual({ date: '2026-10-26', done: { m1: false, m2: true } });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('vista slider', () => {
    it('i pasti hanno un nome nel segmento in cima, e il valore e\' il pasto sulla card', async () => {
      const { tutti, testo, c } = await monta('slider');
      expect(testo('ion-segment.mealnav ion-segment-button')).toEqual(['Colazione', 'Pranzo']);
      expect((tutti('ion-segment.mealnav')[0] as any).value).toBe('m1');
      expect(tutti('ion-segment.mealnav')[0].getAttribute('aria-label')).toBe('Pasti di oggi');
      expect(c.pastoCorrente?.meal.id).toBe('m1');
    });

    it('un pasto fatto lo dice anche nel segmento, a parole per chi non vede la spunta', async () => {
      const { tutti, testo, aggiorna } = await monta('slider');
      tutti('ion-footer ion-button')[0].click();
      await aggiorna();
      expect(testo('ion-segment.mealnav ion-segment-button')[0]).toBe('Colazione, fatto');
      expect(testo('ion-segment.mealnav .sr-only')).toEqual([', fatto']);
    });

    it('il segmento porta al pasto scelto; un id che non c\'e\' non fa niente', async () => {
      const { c } = await monta('slider');
      c.vaiAlPasto('m2');
      expect(c.pastoCorrente?.meal.id).toBe('m2');
      c.vaiAlPasto('inesistente');
      expect(c.pastoCorrente?.meal.id).toBe('m2');
    });

    it('aprendo il piano lo slider e\' gia\' sul primo pasto da fare: ci va di colpo, non scorre mentre la pagina entra', async () => {
      const visti: unknown[] = [];
      const prima = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function (o?: unknown) { visti.push(o); } as any;
      try {
        const { c } = await monta('slider', { date: todayLocalISO(), done: { m1: true } });
        expect(c.sliderIndex).toBe(1);
        expect(visti.length).toBeGreaterThan(0);
        for (const v of visti) expect(v).toEqual({ behavior: 'instant', inline: 'center', block: 'nearest' });
      } finally {
        HTMLElement.prototype.scrollIntoView = prima;
      }
    });

    it('toccato un pasto, mentre lo slider ci va il segmento resta sulla meta; arrivati, segue di nuovo lo slider', async () => {
      const { c, root } = await monta('slider');
      // jsdom non impagina: le card stanno una accanto all'altra, larghe 393.
      const slider = root.querySelector<HTMLElement>('.dietslider')!;
      Array.from(slider.children).forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 393 }));
      let x = 0;
      Object.defineProperty(slider, 'scrollLeft', { get: () => x, configurable: true });
      const scorri = async (v: number) => { x = v; c.onSliderScroll(); await new Promise(r => setTimeout(r, 40)); };

      c.vaiAlPasto('m2');
      // Il primo pezzo di strada e' ancora sulla Colazione: prima il segmento ci tornava.
      await scorri(20);
      expect(c.sliderIndex).toBe(1);
      await scorri(393);
      expect(c.sliderIndex).toBe(1);
      await scorri(0);
      expect(c.sliderIndex).toBe(0);
    });

    it('se il dito riprende lo slider, il segmento segue di nuovo quello che si vede', async () => {
      const { c, root } = await monta('slider');
      const slider = root.querySelector<HTMLElement>('.dietslider')!;
      Array.from(slider.children).forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 393 }));
      Object.defineProperty(slider, 'scrollLeft', { get: () => 10, configurable: true });
      c.vaiAlPasto('m2');
      slider.dispatchEvent(new Event('pointerdown'));
      c.onSliderScroll();
      await new Promise(r => setTimeout(r, 40));
      expect(c.sliderIndex).toBe(0);
    });

    it('da slider a elenco le viste si scambiano dissolvendosi; sulla vista gia\' aperta non succede niente', async () => {
      const { c } = await monta('slider');
      const transizione = vi.fn((fn: () => void) => { fn(); return {}; });
      (document as any).startViewTransition = transizione;
      try {
        c.cambiaVista('slider');
        expect(transizione).not.toHaveBeenCalled();
        expect(c.state.setViewMode).not.toHaveBeenCalled();
        c.cambiaVista('list');
        expect(transizione).toHaveBeenCalledTimes(1);
        expect(c.state.setViewMode).toHaveBeenCalledWith('list');
      } finally {
        delete (document as any).startViewTransition;
      }
    });

    it('"Ho mangiato questo" sta nella barra in basso, fatta come la barra delle tab', async () => {
      const { fixture, testo } = await monta('slider');
      expect(controllaBarraInBasso(fixture).classList.contains('salva-btn')).toBe(true);
      expect(testo('ion-footer.barra-azione ion-button')).toEqual(['Ho mangiato questo']);
    });

    it('in fondo c\'e\' "Ho mangiato questo": segna il pasto della card e lo salva', async () => {
      const { tutti, testo, aggiorna, patchField } = await monta('slider');
      expect(testo('ion-footer ion-button')).toEqual(['Ho mangiato questo']);

      tutti('ion-footer ion-button')[0].click();
      await aggiorna();

      expect(testo('ion-footer ion-button')).toEqual(['Segna come da fare']);
      expect(testo('.exslide .meal-stato')[0]).toBe('fatto');
      expect(patchField).toHaveBeenCalledWith('mealsCompletion', expect.objectContaining({ done: { m1: true, m2: false } }));

      tutti('ion-footer ion-button')[0].click();
      await aggiorna();
      expect(testo('ion-footer ion-button')).toEqual(['Ho mangiato questo']);
      expect(testo('.exslide .meal-stato')[0]).toBe('da fare');
    });

    it('il tasto in fondo segue la card: sul Pranzo segna il Pranzo', async () => {
      const { c, tutti, aggiorna, ridisegna } = await monta('slider');
      c.vaiAlPasto('m2');
      ridisegna();
      tutti('ion-footer ion-button')[0].click();
      await aggiorna();
      expect(c.meals.map(m => m.completed)).toEqual([false, true]);
    });

    it('nella card non c\'e\' piu\' la spunta in alto: il gesto e\' il tasto in fondo', async () => {
      const { tutti } = await monta('slider');
      expect(tutti('.exslide .meal-check').length).toBe(0);
    });

    it('nello slider il titolo del pasto non e\' un controllo che apre qualcosa', async () => {
      const { tutti } = await monta('slider');
      expect(tutti('.meal-summary')[0].getAttribute('role')).toBeNull();
    });

    it('le card hanno ognuna la sua altezza', async () => {
      const { tutti } = await monta('slider');
      expect(tutti('.exslider')[0].classList.contains('dietslider')).toBe(true);
    });
  });
});
