import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { beforeAll, vi } from 'vitest';

// Stesso mock di protocollo-builder.component.spec.ts: pdfjs-dist tocca API
// del browser che l'ambiente di test non ha.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

import { providerPagina } from '../../../test-support/pagina';
import { ProtocolloBuilderComponent } from './protocollo-builder.component';
import { ProtocolService } from '../../services/protocol.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Protocol } from '../../models/protocol.model';

/** Dove il builder torna dopo aver salvato. */
@Component({ standalone: true, template: '' })
class ElencoProtocolli {}

/**
 * Il builder e' una pagina sola con cinque livelli. Qui si monta il template
 * vero: la testata cambia davvero con il livello, le righe cliccabili sono
 * controlli da tastiera, e il solo disegnare la pagina non sporca il
 * protocollo (altrimenti la guardia "modifiche non salvate" chiederebbe
 * conferma a chi non ha toccato niente).
 */
describe('ProtocolloBuilderComponent — disegno vero', () => {
  function protocollo(): Protocol {
    return {
      id: 'proto1', userId: 'user1', name: 'Protocollo test', status: 'draft', source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        weekPlan: [{ sets: 4, reps: 10 }, { sets: 4, reps: 10 }, { sets: 4, reps: 10 }, { sets: 4, reps: 10 }],
        days: [{
          id: 'day1', label: 'Gambe', rec: '60-90"',
          ex: [{ name: 'Squat', scheme: 'wave', sets: 4, muscle: 'Gambe', reps: ['10'] }]
        }]
      },
      diet: [{
        id: 'pianoA', name: 'Giorno ON',
        meals: [{
          id: 'pastoA', name: 'Colazione',
          combinations: [{
            id: 'comboA', label: 'Base',
            carb: { name: 'Pane', qty: '80 g', alt: [{ name: 'Fette biscottate', qty: '60 g' }] },
            protein: null, fat: null
          }],
          alternatives: { carb: [], protein: [{ name: 'Pollo', qty: '100 g' }], fat: [] }
        }]
      }],
      infoNote: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } as any;
  }

  // Il template usa ruote e liste che si portano sul valore con scrollTo() /
  // scrollIntoView(): l'ambiente di test non li ha. Non si ripristinano, perche'
  // ogni file di test ha il suo ambiente e i timer possono scattare dopo l'ultimo test.
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollTop = o?.top ?? 0; } as any;
    HTMLElement.prototype.scrollIntoView = function () {} as any;
  });

  async function monta() {
    const protocolSvc = {
      changed$: new Subject<void>(),
      get: vi.fn(async () => structuredClone(protocollo())),
      update: vi.fn(async () => {}),
      activate: vi.fn(async () => {})
    };
    TestBed.configureTestingModule({
      imports: [ProtocolloBuilderComponent],
      providers: [
        ...providerPagina([{ path: 'scheda/protocolli', component: ElencoProtocolli }]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ protocolId: 'proto1' })) } },
        { provide: ProtocolService, useValue: protocolSvc },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn(async () => true) } }
      ]
    });
    const fixture = TestBed.createComponent(ProtocolloBuilderComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    await vi.waitFor(() => expect(c.loading).toBe(false));
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const titolo = () => root.querySelector('.navtitle-livello')?.textContent?.trim();
    const freccia = () => root.querySelector<HTMLElement>('ion-button.navback');
    const tasto = (el: HTMLElement, key: string) => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };
    const aggiorna = () => fixture.detectChanges();
    return { fixture, c, root, titolo, freccia, tasto, aggiorna, protocolSvc };
  }

  describe('testata', () => {
    it('sull\'elenco: freccia di sistema e titolo "Protocollo"', async () => {
      const { root, titolo, freccia } = await monta();
      expect(titolo()).toBe('Protocollo');
      expect(root.querySelector('ion-back-button')).toBeTruthy();
      expect(freccia()).toBeNull();
    });

    it('dentro un giorno: la freccia sale di un livello, dice dove, e il titolo e\' il giorno', async () => {
      const { c, fixture, root, titolo, freccia } = await monta();

      c.openDay(c.protocol!.workout.days[0], 0);
      fixture.detectChanges();

      expect(titolo()).toBe('Gambe');
      expect(root.querySelector('ion-back-button')).toBeNull();
      expect(freccia()).toBeTruthy();
      expect(freccia()!.getAttribute('aria-label')).toBe('Torna ai giorni');
    });

    it('la freccia dentro il giorno riporta all\'elenco', async () => {
      const { c, fixture, titolo, freccia } = await monta();
      c.openDay(c.protocol!.workout.days[0], 0);
      fixture.detectChanges();

      freccia()!.click();
      await vi.waitFor(() => expect(c.livello).toBe(0));
      fixture.detectChanges();

      expect(titolo()).toBe('Protocollo');
    });
  });

  describe('non sporca il protocollo', () => {
    it('appena disegnato non ci sono modifiche da perdere', async () => {
      const { c } = await monta();
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('nemmeno dopo aver girato fra le schede e aperto piano e pasto', async () => {
      const { c, fixture } = await monta();

      c.vaAScheda('dieta');
      fixture.detectChanges();
      c.openPlan(c.protocol!.diet[0]);
      fixture.detectChanges();
      c.openMeal(c.protocol!.diet[0].meals[0]);
      fixture.detectChanges();
      c.vaAScheda('scheda');
      fixture.detectChanges();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      expect(c.haModificheNonSalvate()).toBe(false);
    });
  });

  describe('le caselle del pasto', () => {
    async function conPastoAperto() {
      const m = await monta();
      m.c.vaAScheda('dieta');
      m.c.openPlan(m.c.protocol!.diet[0]);
      m.c.openMeal(m.c.protocol!.diet[0].meals[0]);
      m.fixture.detectChanges();
      return m;
    }
    const caselle = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.slotdrop .builder-item'));

    it('aprire il pasto disegna una casella per macro, e non e\' una modifica', async () => {
      const { c, root } = await conPastoAperto();

      expect(caselle(root).length).toBe(3);
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('scrivere in una casella vuota invece si', async () => {
      const { c, fixture } = await conPastoAperto();

      c.editingMeal!.combinations[0].protein!.name = 'Pollo';
      fixture.detectChanges();

      expect(c.haModificheNonSalvate()).toBe(true);
    });

    it('tornare a svuotarla riporta il protocollo com\'era', async () => {
      const { c } = await conPastoAperto();
      const proteine = c.editingMeal!.combinations[0].protein!;

      proteine.name = 'Pollo';
      expect(c.haModificheNonSalvate()).toBe(true);
      proteine.name = '';

      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('la \u2715 svuota l\'alimento ma lascia la casella da riempire', async () => {
      const { c, fixture, root } = await conPastoAperto();

      root.querySelector<HTMLElement>('.slotdrop .delete-btn')!.click();
      fixture.detectChanges();

      expect(c.editingMeal!.combinations[0].carb).toEqual({ name: '', qty: '', category: 'carb' });
      expect(caselle(root).length).toBe(3);
      // l'alimento c'era e ora non c'e': questa si' che e' una modifica
      expect(c.haModificheNonSalvate()).toBe(true);
    });

    it('trascinare un alimento fuori dalla casella non la lascia senza campi', async () => {
      const { c, fixture, root } = await conPastoAperto();
      const combo = c.editingMeal!.combinations[0];
      const lista: any[] = [];
      const rilascio: any = {
        previousContainer: { data: { tipo: 'casella', cat: 'carb' } },
        container: { data: { tipo: 'lista', items: lista } },
        previousIndex: 0, currentIndex: 0
      };

      c.rilascia(combo, rilascio);
      fixture.detectChanges();

      expect(lista.map(a => a.name)).toEqual(['Pane']);
      expect(combo.carb).toEqual({ name: '', qty: '', category: 'carb' });
      expect(caselle(root).length).toBe(3);
    });

    it('salvando, le caselle vuote non finiscono nel protocollo', async () => {
      const { c, protocolSvc } = await conPastoAperto();
      // aperto il pasto, proteine e grassi sono caselle vuote; il pane c'e'

      await c.save(false);

      const salvata = (protocolSvc.update.mock.calls[0] as any[])[1].diet[0].meals[0].combinations[0];
      expect(salvata.carb).toEqual({ name: 'Pane', qty: '80 g', alt: [{ name: 'Fette biscottate', qty: '60 g' }] });
      expect(salvata.protein).toBeNull();
      expect(salvata.fat).toBeNull();
    });

    it('e l\'editor, dopo il salvataggio, ha ancora le sue caselle da riempire', async () => {
      const { c, fixture, root } = await conPastoAperto();

      await c.save(false);
      fixture.detectChanges();

      expect(c.editingMeal!.combinations[0].protein).toEqual({ name: '', qty: '', category: 'protein' });
      expect(caselle(root).length).toBe(3);
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('un alimento scritto nella casella, invece, si salva', async () => {
      const { c, protocolSvc } = await conPastoAperto();
      c.editingMeal!.combinations[0].protein!.name = 'Pollo';
      c.editingMeal!.combinations[0].protein!.qty = '150 g';

      await c.save(false);

      const salvata = (protocolSvc.update.mock.calls[0] as any[])[1].diet[0].meals[0].combinations[0];
      expect(salvata.protein).toEqual({ name: 'Pollo', qty: '150 g', category: 'protein' });
    });

    it('una combinazione aggiunta ha le sue tre caselle', async () => {
      const { c, fixture, root } = await conPastoAperto();

      c.addCombination(c.editingMeal!);
      fixture.detectChanges();

      expect(caselle(root).length).toBe(3);
      expect(c.haModificheNonSalvate()).toBe(true); // una combinazione in piu' e' una modifica
    });
  });

  describe('righe della dieta da tastiera', () => {
    it('la riga del piano e\' un pulsante che dice quale piano apre', async () => {
      const { c, fixture, root } = await monta();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      const info = root.querySelector<HTMLElement>('.protocol-row .info')!;
      expect(info.getAttribute('role')).toBe('button');
      expect(info.getAttribute('tabindex')).toBe('0');
      expect(info.getAttribute('aria-label')).toBe('Apri il piano Giorno ON');
    });

    it('Invio sul piano lo apre: il click sintetico risale alla riga', async () => {
      const { c, fixture, root, tasto, titolo } = await monta();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      tasto(root.querySelector<HTMLElement>('.protocol-row .info')!, 'Enter');
      fixture.detectChanges();

      expect(c.editingPlan?.id).toBe('pianoA');
      expect(titolo()).toBe('Giorno ON');
    });

    it('il nome del pasto e\' un pulsante e Invio apre il pasto', async () => {
      const { c, fixture, root, tasto, titolo } = await monta();
      c.vaAScheda('dieta');
      c.openPlan(c.protocol!.diet[0]);
      fixture.detectChanges();

      const lbl = root.querySelector<HTMLElement>('.meal-preview-header .lbl')!;
      expect(lbl.getAttribute('role')).toBe('button');
      expect(lbl.getAttribute('aria-label')).toBe('Apri il pasto Colazione');

      tasto(lbl, 'Enter');
      fixture.detectChanges();

      expect(c.editingMeal?.id).toBe('pastoA');
      expect(titolo()).toBe('Colazione');
    });

    it('"Alternative" dichiara se e\' aperto e, aprendolo, non apre il pasto', async () => {
      const { c, fixture, root, tasto } = await monta();
      c.vaAScheda('dieta');
      c.openPlan(c.protocol!.diet[0]);
      fixture.detectChanges();

      const testate = () => Array.from(root.querySelectorAll<HTMLElement>('.meal-preview-card .altwrap-header'));
      // una per l'alimento (con le sue alternative), una per le alternative del pasto
      expect(testate().length).toBe(2);
      for (const t of testate()) {
        expect(t.getAttribute('role')).toBe('button');
        expect(t.getAttribute('aria-expanded')).toBe('false');
      }

      tasto(testate()[1], ' ');
      fixture.detectChanges();

      expect(testate()[1].getAttribute('aria-expanded')).toBe('true');
      expect(testate()[0].getAttribute('aria-expanded')).toBe('false');
      // Il click sintetico risale alla card che apre il pasto: il toggle lo ferma.
      expect(c.editingMeal).toBeNull();
    });

    it('anche "Alternative" dell\'alimento si apre senza aprire il pasto', async () => {
      const { c, fixture, root, tasto } = await monta();
      c.vaAScheda('dieta');
      c.openPlan(c.protocol!.diet[0]);
      fixture.detectChanges();

      const prima = root.querySelector<HTMLElement>('.meal-preview-cat .altwrap-header')!;
      tasto(prima, 'Enter');
      fixture.detectChanges();

      expect(root.querySelector<HTMLElement>('.meal-preview-cat .altwrap-header')!.getAttribute('aria-expanded')).toBe('true');
      expect(root.textContent).toContain('Fette biscottate');
      expect(c.editingMeal).toBeNull();
    });
  });
});
