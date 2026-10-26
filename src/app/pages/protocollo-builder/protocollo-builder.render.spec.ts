import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { afterEach, beforeAll, vi } from 'vitest';

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
import { NavController } from '@ionic/angular';

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

  async function monta(extra: Partial<Protocol> = {}) {
    const protocolSvc = {
      changed$: new Subject<void>(),
      get: vi.fn(async () => structuredClone({ ...protocollo(), ...extra })),
      update: vi.fn(async () => {}),
      activate: vi.fn(async () => {}),
      delete: vi.fn(async () => {})
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

  describe('i giorni, come lista iOS', () => {
    it('un gruppo solo, e "Aggiungi giorno" e\' l\'ultima riga, senza chevron', async () => {
      const { c, root, aggiorna } = await monta();
      const lista = root.querySelector<HTMLElement>('ion-list.grouplist')!;
      const azione = lista.querySelector<HTMLElement & { detail?: boolean }>(':scope > ion-item.riga-azione')!;
      expect(lista.lastElementChild).toBe(azione);
      expect(azione.textContent!.trim()).toBe('Aggiungi giorno');
      expect(azione.detail).toBe(false);
      expect(root.querySelector('.savebar ion-button.savebtn')).toBeNull();
      const prima = c.protocol!.workout.days.length;
      azione.click();
      aggiorna();
      expect(c.protocol!.workout.days.length).toBe(prima + 1);
    });
  });

  describe('la dieta, come lista iOS', () => {
    it('i piani: "Aggiungi piano alimentare" e\' l\'ultima riga del gruppo, e aggiunge un piano', async () => {
      const { c, root, aggiorna } = await monta();
      c.vaAScheda('dieta');
      aggiorna();
      const gruppo = root.querySelector<HTMLElement>('ion-list.piani')!;
      const azione = gruppo.lastElementChild as HTMLElement & { detail?: boolean };
      expect(azione.matches('ion-item.riga-azione')).toBe(true);
      expect(azione.textContent!.trim()).toBe('Aggiungi piano alimentare');
      expect(azione.detail).toBe(false);
      expect(root.querySelector('.savebar ion-button.savebtn')).toBeNull();
      const prima = c.protocol!.diet.length;
      azione.click();
      aggiorna();
      expect(c.protocol!.diet.length).toBe(prima + 1);
    });

    it('senza piani lo dice, e la riga per aggiungerne uno c\'e\' lo stesso', async () => {
      const { c, root, aggiorna } = await monta();
      c.protocol!.diet = [];
      c.vaAScheda('dieta');
      aggiorna();
      expect(root.querySelector('.history-empty')!.textContent).toContain('Nessun piano ancora');
      const gruppo = root.querySelector<HTMLElement>('ion-list.piani')!;
      expect(Array.from(gruppo.children).map(e => e.textContent!.trim())).toEqual(['Aggiungi piano alimentare']);
    });

    it('i pasti di un piano: "Aggiungi pasto" e\' una riga d\'accento, non un tasto pieno', async () => {
      const { c, root, aggiorna } = await monta();
      c.vaAScheda('dieta');
      aggiorna();
      root.querySelector<HTMLElement>('ion-item.piano-dieta')!.click();
      aggiorna();
      const azione = Array.from(root.querySelectorAll<HTMLElement>('ion-item.riga-azione')).find(i => i.textContent!.trim() === 'Aggiungi pasto');
      expect(azione).toBeTruthy();
      expect(root.querySelector('.savebar ion-button.savebtn')).toBeNull();
    });
  });

  describe('il tipo di dieta', () => {
    afterEach(() => vi.useRealTimers());
    const testo = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    async function inDieta(extra: Partial<Protocol> = {}) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
      const m = await monta(extra);
      m.c.vaAScheda('dieta');
      m.aggiorna();
      const segmento = () => m.root.querySelector<HTMLElement & { value?: string }>('ion-segment.tipo-dieta');
      const data = () => m.root.querySelector<HTMLInputElement>('ion-list.ciclo-inizio input#ciclo-inizio');
      const nota = () => testo(m.root.querySelector('.tipo-dieta-nota'));
      const righe = () => Array.from(m.root.querySelectorAll('ion-item.piano-dieta ion-label p')).map(testo);
      // Come il tocco: l'evento parte dal segmento vero, e passa dal template.
      const scegli = (value: string) => {
        segmento()!.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
        m.aggiorna();
      };
      const salvato = () => (m.protocolSvc.update.mock.calls.at(-1) as any[])[1];
      return { ...m, segmento, data, nota, righe, scegli, salvato };
    }

    it('un protocollo senza tipo e\' ON/OFF: segmento, la spiegazione, nessun primo giorno', async () => {
      const { segmento, data, nota, righe, c } = await inDieta();
      expect(segmento()!.value).toBe('onoff');
      expect(Array.from(segmento()!.querySelectorAll('ion-segment-button')).map(b => [b.getAttribute('value'), testo(b)]))
        .toEqual([['onoff', 'Giorni ON/OFF'], ['ciclica', 'Ciclica']]);
      expect(segmento()!.getAttribute('aria-label')).toBe('Tipo di dieta');
      expect(data()).toBeNull();
      expect(nota()).toBe('I piani sono alternative: ogni giorno si sceglie quale seguire, di solito in base all\'allenamento.');
      expect(righe()).toEqual(['1 pasto · 2 alimenti']);
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('ciclica: il primo giorno parte da oggi, i piani hanno il loro posto nel ciclo, e si salva', async () => {
      const { scegli, segmento, data, nota, righe, c, salvato } = await inDieta();
      scegli('ciclica');
      expect(segmento()!.value).toBe('ciclica');
      expect(c.protocol!.dietCycleStart).toBe('2026-10-26');
      expect(data()).not.toBeNull();
      expect(nota()).toBe('Ogni giorno il piano dopo, nell\'ordine qui sotto, e dopo l\'ultimo si riparte dal primo. Si va avanti col calendario, anche nei giorni senza pasti segnati.');
      expect(righe()).toEqual(['Giorno 1 del ciclo · 1 pasto · 2 alimenti']);
      expect(c.haModificheNonSalvate()).toBe(true);
      await c.save(false);
      expect(salvato()).toMatchObject({ dietType: 'ciclica', dietCycleStart: '2026-10-26' });
    });

    it('il primo giorno scelto resta, anche passando da ON/OFF e tornando', async () => {
      const { scegli, c, salvato } = await inDieta({ dietType: 'ciclica', dietCycleStart: '2026-10-20' });
      scegli('onoff');
      scegli('ciclica');
      expect(c.protocol!.dietCycleStart).toBe('2026-10-20');
      expect(c.haModificheNonSalvate()).toBe(false);
      await c.save(false);
      expect(salvato()).toMatchObject({ dietType: 'ciclica', dietCycleStart: '2026-10-20' });
    });

    it('scelta ciclica e poi di nuovo ON/OFF non e\' una modifica; ON/OFF si salva senza primo giorno', async () => {
      const { scegli, c, salvato } = await inDieta();
      scegli('ciclica');
      scegli('onoff');
      expect(c.haModificheNonSalvate()).toBe(false);
      await c.save(false);
      expect(salvato()).toMatchObject({ dietType: 'onoff', dietCycleStart: null });
    });

    it('un protocollo gia\' ciclico si apre ciclico, col suo primo giorno, senza modifiche', async () => {
      const { segmento, c, righe } = await inDieta({ dietType: 'ciclica', dietCycleStart: '2026-10-20' });
      expect(segmento()!.value).toBe('ciclica');
      expect(c.protocol!.dietCycleStart).toBe('2026-10-20');
      expect(righe()).toEqual(['Giorno 1 del ciclo · 1 pasto · 2 alimenti']);
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('un valore che non e\' un tipo non cambia niente', async () => {
      const { scegli, c } = await inDieta();
      scegli('settimanale');
      expect(c.protocol!.dietType).toBeUndefined();
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('ciclica senza piani: l\'invito parla dei giorni del ciclo', async () => {
      const { c, scegli, root, aggiorna } = await inDieta();
      c.protocol!.diet = [];
      scegli('ciclica');
      aggiorna();
      const vuoto = root.querySelector('.history-empty')!;
      expect(vuoto.querySelector('br')).not.toBeNull();
      expect(testo(vuoto)).toBe('Nessun piano ancora.Aggiungi i giorni del ciclo, nell\'ordine in cui si seguono.');
    });
  });

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
    const caselle = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.slotdrop ion-item.alimento'));

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

    it('il meno rosso svuota l\'alimento ma lascia la casella da riempire', async () => {
      const { c, fixture, root } = await conPastoAperto();

      // Solo la casella piena (il pane) ha il meno: le vuote non hanno niente da togliere.
      expect(root.querySelectorAll('.slotdrop ion-button.togli').length).toBe(1);
      root.querySelector<HTMLElement>('.slotdrop ion-button.togli')!.click();
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

  /**
   * Il piano nell'elenco e' una riga di Ionic che si apre (ion-item button: la
   * tastiera e il lettore di schermo li da' il componente), con quanti pasti e
   * quanti alimenti; si elimina scorrendo, o da dentro con "Rimuovi piano".
   */
  describe('le righe dei piani', () => {
    it('la riga del piano e\' un pulsante con il chevron, il nome e quanto contiene', async () => {
      const { c, fixture, root } = await monta();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      const riga = root.querySelector<HTMLElement & { button?: boolean; detail?: boolean }>('ion-list.piani ion-item.piano-dieta')!;
      expect(riga.button).toBe(true);
      expect(riga.detail).toBe(true);
      expect(riga.querySelector('h2')!.textContent!.trim()).toBe('Giorno ON');
      // Gli alimenti sono quelli che conta il builder: le combinazioni e le alternative del pasto.
      expect(riga.querySelector('p')!.textContent!.trim()).toBe('1 pasto · 2 alimenti');
      expect(root.querySelector('ion-list.piani ion-button.delete-btn')).toBeNull();
    });

    it('toccarla apre il piano', async () => {
      const { c, fixture, root, titolo } = await monta();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      root.querySelector<HTMLElement>('ion-item.piano-dieta')!.click();
      fixture.detectChanges();

      expect(c.editingPlan?.id).toBe('pianoA');
      expect(titolo()).toBe('Giorno ON');
    });

    it('scorrendola compare "Elimina", in rosso, e toglie il piano', async () => {
      const { c, fixture, root } = await monta();
      c.vaAScheda('dieta');
      fixture.detectChanges();

      const opzione = root.querySelector<HTMLElement>('ion-list.piani ion-item-sliding ion-item-option.elimina')!;
      expect(opzione.textContent!.trim()).toBe('Elimina');
      opzione.click();
      fixture.detectChanges();
      expect(c.protocol!.diet).toEqual([]);
    });

    it('il riassunto conta al singolare e al plurale', async () => {
      const { c } = await monta();
      const piano = c.protocol!.diet[0];
      expect(c.riassuntoPiano(piano)).toBe('1 pasto · 2 alimenti');
      const soloPane = { ...piano.meals[0], combinations: [{ ...piano.meals[0].combinations[0], carb: { name: 'Pane', qty: '80 g' } }], alternatives: { carb: [], protein: [], fat: [] } };
      expect(c.riassuntoPiano({ ...piano, meals: [soloPane] })).toBe('1 pasto · 1 alimento');
      piano.meals.push(structuredClone(piano.meals[0]));
      expect(c.riassuntoPiano(piano)).toBe('2 pasti · 4 alimenti');
      expect(c.riassuntoPiano({ ...piano, meals: [] })).toBe('0 pasti · 0 alimenti');
    });

    it('"Rimuovi piano", da dentro il piano, lo toglie e torna all\'elenco', async () => {
      const { c, fixture, root, titolo } = await monta();
      c.vaAScheda('dieta');
      c.openPlan(c.protocol!.diet[0]);
      fixture.detectChanges();

      const rimuovi = root.querySelector<HTMLElement>('ion-list.azioni-piano ion-item.riga-distruttiva')!;
      expect(rimuovi.textContent!.trim()).toBe('Rimuovi piano');
      rimuovi.click();
      fixture.detectChanges();
      expect(c.protocol!.diet).toEqual([]);
      expect(c.editingPlan).toBeNull();
      expect(titolo()).toBe('Protocollo');
    });
  });

  /**
   * Il piano e il pasto come moduli di iOS: i pasti sono righe che si aprono
   * (non anteprime che ripetono il pasto), il pasto e' fatto di liste con i
   * campi dentro, le alternative sono righe che si aprono.
   */
  describe('la dieta come moduli di iOS', () => {
    async function conPiano() {
      const m = await monta();
      m.c.vaAScheda('dieta');
      m.c.openPlan(m.c.protocol!.diet[0]);
      m.fixture.detectChanges();
      return m;
    }
    async function conPasto() {
      const m = await conPiano();
      m.c.openMeal(m.c.protocol!.diet[0].meals[0]);
      m.fixture.detectChanges();
      return m;
    }
    const testo = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

    it('il nome del piano e\' una riga di modulo con la sua etichetta', async () => {
      const { root } = await conPiano();
      const nome = root.querySelector<HTMLElement & { label?: string; value?: string }>('ion-list.campi ion-input')!;
      expect(nome.label).toBe('Nome');
    });

    it('un pasto e\' una riga che si apre: il nome e il chevron, senza sottotitolo', async () => {
      const { c, fixture, root, titolo } = await conPiano();
      const righe = Array.from(root.querySelectorAll<HTMLElement & { button?: boolean; detail?: boolean }>('ion-item.pasto-riga'));
      expect(righe.length).toBe(1);
      expect(testo(righe[0].querySelector('h2'))).toBe('Colazione');
      // Gli alimenti si leggono aprendo il pasto: sotto il nome non c'e' altro.
      expect(righe[0].querySelector('ion-label p')).toBeNull();
      expect([righe[0].button, righe[0].detail]).toEqual([true, true]);
      // Niente anteprima che ripete il pasto: ne' combinazioni, ne' alternative, ne' cestini.
      expect(root.querySelector('.meal-preview-card, .variant-tabs, .altwrap-header, ion-button.delete-btn')).toBeNull();

      righe[0].click();
      fixture.detectChanges();
      expect(c.editingMeal?.id).toBe('pastoA');
      expect(titolo()).toBe('Colazione');
    });

    it('un pasto si elimina scorrendo la riga', async () => {
      const { c, fixture, root } = await conPiano();
      root.querySelector<HTMLElement>('ion-item-option.elimina')!.click();
      fixture.detectChanges();
      expect(c.editingPlan!.meals).toEqual([]);
      expect(root.querySelector('ion-item.pasto-riga')).toBeNull();
    });

    it('le combinazioni: il segmento c\'e\' da due in su e sceglie quella da scrivere', async () => {
      const { c, fixture, root } = await conPasto();
      expect(root.querySelector('ion-segment.combo-seg')).toBeNull();
      expect(root.querySelector('ion-item.riga-distruttiva')!.textContent).not.toContain('combinazione');

      c.addCombination(c.editingMeal!);
      fixture.detectChanges();
      const seg = root.querySelector<HTMLElement & { value?: string }>('ion-segment.combo-seg')!;
      expect(Array.from(seg.querySelectorAll('ion-segment-button')).map(b => testo(b))).toEqual(['Base', 'Alternativa 1']);
      expect(seg.value).toBe(c.editingMeal!.combinations[1].id);

      c.scegliCombinazione(c.editingMeal!, new CustomEvent('ionChange', { detail: { value: 'comboA' } }));
      fixture.detectChanges();
      expect(c.getActiveCombo(c.editingMeal!).id).toBe('comboA');
      expect(Array.from(root.querySelectorAll('ion-item.riga-distruttiva')).map(r => testo(r)))
        .toEqual(['Rimuovi questa combinazione', 'Rimuovi pasto']);
    });

    it('la quantita\' ha la sua etichetta visibile, non solo il segnaposto', async () => {
      const { root } = await conPasto();
      const qty = Array.from(root.querySelectorAll<HTMLElement & { label?: string }>('.slotdrop ion-input.alimento-qty'));
      expect(qty.map(q => q.label)).toEqual(['Quantità', 'Quantità', 'Quantità']);
    });

    it('le alternative di un alimento sono una riga che si apre, col loro conto', async () => {
      const { fixture, root } = await conPasto();
      const riga = root.querySelector<HTMLElement>('ion-list.macro ion-item.apri-alternative')!;
      expect(testo(riga.querySelector('ion-note'))).toBe('1');
      expect(riga.getAttribute('aria-expanded')).toBe('false');
      expect(root.querySelector('ion-item.alternativa')).toBeNull();

      riga.click();
      fixture.detectChanges();
      // ngModel scrive il valore nel campo un giro dopo.
      await fixture.whenStable();
      expect(riga.getAttribute('aria-expanded')).toBe('true');
      const alt = root.querySelector<HTMLElement & { value?: string }>('ion-item.alternativa ion-input.alimento-nome')!;
      expect(alt.value).toBe('Fette biscottate');
    });

    it('un alimento senza alternative ha solo "Aggiungi alternativa"; aggiungendola la riga si apre', async () => {
      const { c, fixture, root } = await conPasto();
      const macro = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.macro'));
      // Proteine e grassi sono caselle vuote: niente da cui partire, niente riga.
      expect(macro()[1].querySelector('ion-item.riga-azione')).toBeNull();
      expect(macro()[1].querySelector('ion-item.apri-alternative')).toBeNull();

      c.editingMeal!.combinations[0].protein!.name = 'Pollo';
      fixture.detectChanges();
      const aggiungi = macro()[1].querySelector<HTMLElement>('ion-item.riga-azione')!;
      expect(testo(aggiungi)).toBe('Aggiungi alternativa');
      aggiungi.click();
      fixture.detectChanges();

      expect(c.editingMeal!.combinations[0].protein!.alt).toEqual([{ name: '', qty: '' }]);
      expect(macro()[1].querySelector('ion-item.apri-alternative')!.getAttribute('aria-expanded')).toBe('true');
      expect(macro()[1].querySelectorAll('ion-item.alternativa').length).toBe(1);
    });

    it('le alternative del pasto: una riga che si apre, con i macro come divisori', async () => {
      const { fixture, root } = await conPasto();
      const riga = root.querySelector<HTMLElement>('ion-list.alt-pasto ion-item.apri-alternative')!;
      expect(testo(riga.querySelector('ion-note'))).toBe('1');
      riga.click();
      fixture.detectChanges();
      expect(Array.from(root.querySelectorAll('ion-list.alt-pasto ion-item-divider')).map(d => testo(d)))
        .toEqual(['Carboidrati', 'Proteine', 'Grassi']);
      expect(root.querySelectorAll('ion-list.alt-pasto ion-item.alimento').length).toBe(1);
    });

    it('"Fatto" e\' il segno di spunta della testata: in fondo resta solo "Rimuovi pasto", in rosso', async () => {
      const { c, fixture, root, titolo } = await conPasto();
      expect(Array.from(root.querySelectorAll('ion-button')).map(b => testo(b))).not.toContain('Fatto');
      const rimuovi = Array.from(root.querySelectorAll<HTMLElement>('ion-item.riga-distruttiva')).find(r => testo(r) === 'Rimuovi pasto')!;
      rimuovi.click();
      fixture.detectChanges();
      expect(c.editingMeal).toBeNull();
      expect(c.editingPlan!.meals).toEqual([]);
      expect(titolo()).toBe('Giorno ON');
    });
  });

  /**
   * Il resto del builder come moduli di iOS: i campi sono righe con
   * l'etichetta dentro (la prop label di Ionic), salvare un giorno o un
   * esercizio e' la spunta della testata, togliere e' una riga rossa.
   */
  describe('i campi come moduli di iOS', () => {
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const etichette = (root: HTMLElement, sel: string) => Array.from(root.querySelectorAll(sel)).map(e => e.getAttribute('label') ?? (e as any).label);

    it('il nome del protocollo e la data d\'inizio sono righe: l\'etichetta e\' nella riga', async () => {
      const { root } = await monta();
      expect(etichette(root, 'ion-list.campi ion-input')).toContain('Nome');
      expect(root.querySelector('.authfield')).toBeNull();
      const data = root.querySelector<HTMLInputElement>('ion-list.campi input.data-riga#prog-start')!;
      expect(data.type).toBe('date');
      expect(testo(root.querySelector('label[for="prog-start"]'))).toBe('Inizio del programma');
    });

    it('il giorno: Nome e Recupero come righe, niente "Salva giorno" (e\' la spunta), "Rimuovi giorno" in rosso', async () => {
      const { c, fixture, root } = await monta();
      c.openDay(c.protocol!.workout.days[0], 0);
      fixture.detectChanges();

      expect(etichette(root, 'ion-list.campi ion-input')).toEqual(['Nome', 'Recupero']);
      expect(Array.from(root.querySelectorAll('ion-button')).map(b => testo(b))).not.toContain('Salva giorno');
      const rimuovi = root.querySelector<HTMLElement>('ion-list.azioni-giorno ion-item.riga-distruttiva')!;
      expect(testo(rimuovi)).toBe('Rimuovi giorno');
      const spia = vi.spyOn(c, 'removeDay').mockImplementation(async () => {});
      rimuovi.click();
      expect(spia).toHaveBeenCalledWith(0);
    });

    it('l\'esercizio: le scelte sono righe con il valore a destra, niente "Salva esercizio", "Rimuovi esercizio" in rosso', async () => {
      const { c, fixture, root } = await monta();
      const giorno = c.protocol!.workout.days[0];
      c.openDay(giorno, 0);
      c.editExercise(giorno, giorno.ex[0]);
      fixture.detectChanges();

      expect(etichette(root, 'ion-list.campi ion-select')).toEqual(['Gruppo muscolare', 'Schema']);
      expect(etichette(root, 'ion-list.campi ion-input')).toContain('Nome');
      expect(etichette(root, 'ion-list.campi ion-input')).toContain('Nota');
      expect(Array.from(root.querySelectorAll('ion-button')).map(b => testo(b))).not.toContain('Salva esercizio');
      const rimuovi = root.querySelector<HTMLElement>('ion-list.azioni-esercizio ion-item.riga-distruttiva')!;
      expect(testo(rimuovi)).toBe('Rimuovi esercizio');
      const spia = vi.spyOn(c, 'removeExerciseFromEditor').mockImplementation(async () => {});
      rimuovi.click();
      expect(spia).toHaveBeenCalled();
    });

    it('l\'esercizio a onda: le ripetizioni di una settimana sono un testo, cosi\' "6-8" si legge e si scrive', async () => {
      const { c, fixture, root } = await monta();
      const giorno = c.protocol!.workout.days[0];
      giorno.ex[0].weekPlan = [{ sets: 3, reps: '6-8' }, { sets: 4, reps: 10 }];
      c.openDay(giorno, 0);
      c.editExercise(giorno, giorno.ex[0]);
      fixture.detectChanges();
      // ngModel scrive il valore nel campo in un secondo momento.
      await fixture.whenStable();
      fixture.detectChanges();

      const righe = Array.from(root.querySelectorAll<HTMLElement>('.weekplan-row'));
      expect(righe.length).toBe(2);
      const campi = (r: HTMLElement) => Array.from(r.querySelectorAll<HTMLElement & { value?: unknown; type?: string }>('ion-input'));
      expect(campi(righe[0]).map(i => i.type)).toEqual(['number', 'text']);
      expect(campi(righe[0])[1].value).toBe('6-8');
      expect(campi(righe[1])[1].value).toBe(10);
    });

    it('l\'esercizio fisso: Serie, Tipo di serie, Testo e Ripetizioni come righe', async () => {
      const { c, fixture, root } = await monta();
      const giorno = c.protocol!.workout.days[0];
      giorno.ex[0].scheme = 'plain';
      c.openDay(giorno, 0);
      c.editExercise(giorno, giorno.ex[0]);
      fixture.detectChanges();

      expect(etichette(root, 'ion-list.campi ion-select')).toEqual(['Gruppo muscolare', 'Schema', 'Tipo di serie']);
      expect(etichette(root, 'ion-list.campi ion-input')).toEqual(['Nome', 'Serie', 'Testo', 'Ripetizioni', 'Nota']);
      expect(root.querySelector('ion-input.a-destra[label="Serie"]')).toBeTruthy();
    });

    it('la corsa: Minuti (con l\'unita\') e Uscite come righe con il numero a destra', async () => {
      const { c, fixture, root } = await monta();
      c.vaAScheda('corsa');
      fixture.detectChanges();

      expect(etichette(root, 'ion-list.campi ion-input.a-destra')).toEqual(['Minuti', 'Uscite']);
      expect(testo(root.querySelector('ion-input[label="Minuti"] .unita'))).toBe('min');
    });

    it('"Elimina protocollo" sta in fondo alla scheda Info, chiede, elimina ed esce senza la domanda sulle modifiche', async () => {
      const { c, fixture, root, protocolSvc } = await monta();
      const nav = TestBed.inject(NavController);
      const indietro = vi.spyOn(nav, 'navigateBack').mockResolvedValue(true);
      c.vaAScheda('info');
      fixture.detectChanges();

      c.protocol!.name = 'Cambiato e non salvato';
      expect(c.haModificheNonSalvate()).toBe(true);

      const riga = root.querySelector<HTMLElement>('ion-list.azioni-protocollo ion-item.riga-distruttiva')!;
      expect(testo(riga)).toBe('Elimina protocollo');
      riga.click();
      await vi.waitFor(() => expect(indietro).toHaveBeenCalledWith(['/scheda/protocolli']));
      expect(TestBed.inject(ConfirmDialogService).confirm).toHaveBeenCalledWith('Eliminare il protocollo "Cambiato e non salvato"?');
      expect(protocolSvc.delete).toHaveBeenCalledWith('proto1');
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('senza conferma non elimina e resta', async () => {
      const { c, protocolSvc } = await monta();
      const nav = TestBed.inject(NavController);
      const indietro = vi.spyOn(nav, 'navigateBack').mockResolvedValue(true);
      vi.mocked(TestBed.inject(ConfirmDialogService).confirm).mockResolvedValueOnce(false);
      await c.eliminaProtocollo();
      expect(protocolSvc.delete).not.toHaveBeenCalled();
      expect(indietro).not.toHaveBeenCalled();
    });

    it('se l\'eliminazione fallisce lo dice e resta, con la guardia ancora accesa', async () => {
      const { c, protocolSvc } = await monta();
      const nav = TestBed.inject(NavController);
      const indietro = vi.spyOn(nav, 'navigateBack').mockResolvedValue(true);
      protocolSvc.delete.mockRejectedValueOnce(new Error('rete'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      c.protocol!.name = 'Cambiato';
      await c.eliminaProtocollo();
      expect(indietro).not.toHaveBeenCalled();
      expect(c.haModificheNonSalvate()).toBe(true);
    });
  });
});
