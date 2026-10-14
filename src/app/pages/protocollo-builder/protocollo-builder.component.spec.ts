import { vi } from 'vitest';

// pdfjs-dist tocca API browser (DOMMatrix, canvas) assenti nell'ambiente di test:
// stesso mock gia' usato in pdf-import.service.spec.ts, necessario qui perche'
// il componente importa PdfImportService (che a sua volta importa pdfjs-dist).
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

import { ProtocolloBuilderComponent } from './protocollo-builder.component';
import { ProtocolService } from '../../services/protocol.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { ProtocolBuilderStateService } from '../../services/protocol-builder-state.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { PdfImportService } from '../../services/pdf-import.service';
import { Protocol } from '../../models/protocol.model';


describe('ProtocolloBuilderComponent', () => {
  function buildProtocol(): Protocol {
    return {
      id: 'proto1',
      userId: 'user1',
      name: 'Protocollo test',
      status: 'draft',
      source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        // Aggregato "stale": flat 4x10, come se calcolato all'import PDF
        // prima che il coach correggesse manualmente l'esercizio sotto.
        weekPlan: [
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 }
        ],
        days: [{
          id: 'day1',
          label: 'Gambe',
          rec: '60-90"',
          ex: [{
            name: 'Squat',
            scheme: 'wave',
            sets: 4,
            muscle: 'Gambe',
            reps: ['10'],
            // Dato per-esercizio corretto, gia' sistemato dal coach nel builder:
            // diverge dall'aggregato stale sopra.
            weekPlan: [
              { sets: 4, reps: 10 },
              { sets: 4, reps: 10 },
              { sets: 4, reps: 8 },
              { sets: 4, reps: 8 }
            ]
          }]
        }]
      },
      diet: [],
      infoNote: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
  }

  it("save() ricalcola workout.weekPlan dai dati per-esercizio invece di salvare l'aggregato non aggiornato", async () => {
    const updateCalls: any[][] = [];
    const protocolSvc: any = {
      update: (...args: any[]) => { updateCalls.push(args); return Promise.resolve(); },
      get: () => Promise.resolve(buildProtocol()),
      activate: () => Promise.resolve()
    };

    const router: any = { navigateBack: () => {}, navigateForward: () => {} };
    const cdr: any = { detectChanges: () => {} };

    const component = new ProtocolloBuilderComponent(
      {} as any, // ActivatedRoute: non usato, non chiamiamo ngOnInit in questo test
      router,
      protocolSvc,
      new PdfImportService(),
      new WorkoutDataService(),
      cdr,
      new ProtocolBuilderStateService(),
      new ToastService(),
      new ConfirmDialogService({} as any, {} as any)
    );
    component.protocolId = 'proto1';
    component.protocol = buildProtocol();

    await component.save(false);

    expect(updateCalls.length).toBe(1);
    const savedPatch = updateCalls[0][1];
    expect(savedPatch.workout.weekPlan).toEqual([
      { sets: 4, reps: 10 },
      { sets: 4, reps: 10 },
      { sets: 4, reps: 8 },
      { sets: 4, reps: 8 }
    ]);
  });

  it("save() usa totalWeeks quando non ci sono esercizi wave", async () => {
    // Protocollo senza esercizi wave (tutti 'plain'): attiva il fallback
    const protocolNoWave: Protocol = {
      id: 'proto2',
      userId: 'user1',
      name: 'Protocollo no-wave',
      status: 'draft',
      source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        // weekPlan stale con lunghezza 4 (deliberatamente != 8, per catturare regressioni)
        weekPlan: [
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 },
          { sets: 4, reps: 10 }
        ],
        days: [{
          id: 'day1',
          label: 'Gambe',
          rec: '60-90"',
          ex: [{
            name: 'Leg Press',
            scheme: 'plain',  // NON wave
            sets: 4,
            muscle: 'Gambe',
            reps: ['10']
            // Nessun weekPlan per-esercizio: non avremo wave weekPlans
          }]
        }]
      },
      diet: [],
      infoNote: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const updateCalls: any[][] = [];
    const protocolSvc: any = {
      update: (...args: any[]) => { updateCalls.push(args); return Promise.resolve(); },
      get: () => Promise.resolve(protocolNoWave),
      activate: () => Promise.resolve()
    };

    const router: any = { navigateBack: () => {}, navigateForward: () => {} };
    const cdr: any = { detectChanges: () => {} };

    const component = new ProtocolloBuilderComponent(
      {} as any,
      router,
      protocolSvc,
      new PdfImportService(),
      new WorkoutDataService(),
      cdr,
      new ProtocolBuilderStateService(),
      new ToastService(),
      new ConfirmDialogService({} as any, {} as any)
    );
    component.protocolId = 'proto2';
    component.protocol = protocolNoWave;

    await component.save(false);

    expect(updateCalls.length).toBe(1);
    const savedPatch = updateCalls[0][1];

    // Il fallback usa totalWeeks (= length del weekPlan stale = 4) e genera
    // un array di 4 elementi, ognuno { sets: 4, reps: 10 }
    expect(savedPatch.workout.weekPlan.length).toBe(4);
    expect(savedPatch.workout.weekPlan).toEqual([
      { sets: 4, reps: 10 },
      { sets: 4, reps: 10 },
      { sets: 4, reps: 10 },
      { sets: 4, reps: 10 }
    ]);
  });

  /**
   * La scheda del coach mostrava tutti i giorni aperti uno sotto l'altro. Ora
   * fa come la vede il cliente: prima l'elenco, poi dentro il giorno.
   */
  describe('i giorni si aprono uno per volta', () => {
    function montaComponente(protocolSvc: any = { update: () => Promise.resolve(), get: () => Promise.resolve(buildProtocol()), activate: () => Promise.resolve() }) {
      const navigazioni: any[] = [];
      const conferme: boolean[] = [];
      const confirmStub: any = { confirm: () => Promise.resolve(conferme.shift() ?? true) };
      const component = new ProtocolloBuilderComponent(
        {} as any,
        { navigateBack: (...a: any[]) => { navigazioni.push(a); }, navigateForward: (...a: any[]) => { navigazioni.push(a); } } as any,
        protocolSvc,
        new PdfImportService(),
        new WorkoutDataService(),
        { detectChanges: () => {} } as any,
        new ProtocolBuilderStateService(),
        new ToastService(),
        confirmStub
      );
      component.protocolId = 'proto1';
      component.protocol = buildProtocol();
      return { component, navigazioni, conferme };
    }

    it('si parte dall\'elenco, non dentro un giorno', () => {
      const { component } = montaComponente();
      expect(component.editingDay).toBeNull();
    });

    /* Chi crea un giorno lo vuole riempire: farlo tornare all'elenco per
       riaprirlo sarebbe un tocco in piu' senza motivo. */
    it('aggiungere un giorno ci porta dentro', () => {
      const { component } = montaComponente();
      component.addDay();
      expect(component.protocol!.workout.days.length).toBe(2);
      expect(component.editingDay?.day.label).toBe('Giorno 2');
      expect(component.editingDay?.index).toBe(1);
    });

    it('chiudere il giorno torna all\'elenco senza toccare niente', () => {
      const { component } = montaComponente();
      component.addDay();
      component.closeDay();
      expect(component.editingDay).toBeNull();
      expect(component.protocol!.workout.days.length).toBe(2);
    });

    /* "Salva giorno" scrive e RESTA nel builder: save() invece chiude e torna
       al cliente, che a meta' scheda butterebbe fuori. */
    it('salvare il giorno scrive e riporta all\'elenco, senza uscire dal builder', async () => {
      const scritture: any[] = [];
      const { component, navigazioni } = montaComponente({
        update: (...a: any[]) => { scritture.push(a); return Promise.resolve(); },
        get: () => Promise.resolve(buildProtocol()),
        activate: () => Promise.resolve()
      });
      component.openDay(component.protocol!.workout.days[0], 0);

      await component.saveDay();

      expect(scritture.length).toBe(1);
      expect(component.editingDay).toBeNull();
      expect(navigazioni.length).toBe(0);
    });

    /* Se la scrittura fallisce si resta nel giorno: chiudere l'elenco
       farebbe credere che sia andata. */
    it('se il salvataggio fallisce il giorno resta aperto', async () => {
      const { component } = montaComponente({
        update: () => Promise.reject(new Error('rete assente')),
        get: () => Promise.resolve(buildProtocol()),
        activate: () => Promise.resolve()
      });
      component.openDay(component.protocol!.workout.days[0], 0);

      await component.saveDay();

      expect(component.editingDay).not.toBeNull();
      expect(component.saveMsg).toContain('rete assente');
    });

    it('rimuovere un giorno chiede conferma, poi lo toglie e chiude', async () => {
      const { component } = montaComponente();
      component.openDay(component.protocol!.workout.days[0], 0);

      await component.removeDay(0);

      expect(component.protocol!.workout.days.length).toBe(0);
      expect(component.editingDay).toBeNull();
    });

    it('rispondendo no il giorno resta dov\'e\'', async () => {
      const { component, conferme } = montaComponente();
      conferme.push(false);
      await component.removeDay(0);
      expect(component.protocol!.workout.days.length).toBe(1);
    });

    it('il conteggio degli esercizi si legge come una frase', () => {
      const { component } = montaComponente();
      const giorno = component.protocol!.workout.days[0];
      expect(component.dayCount(giorno)).toBe('1 esercizio');
      giorno.ex = [];
      expect(component.dayCount(giorno)).toBe('Nessun esercizio');
      giorno.ex = [{} as any, {} as any];
      expect(component.dayCount(giorno)).toBe('2 esercizi');
    });
  });
});

/**
 * Trascinare un alimento, fra tre posti che sono lo stesso posto.
 *
 * Un alimento puo' stare nella casella di un macro, fra le alternative del
 * pasto, o fra le alternative di un altro alimento. Spostarlo da uno
 * all'altro e' il mestiere del builder: promuovere un'alternativa a
 * principale, declassare il principale ad alternativa, correggere il macro
 * sotto cui e' finito. Prima si poteva fare solo cancellando e riscrivendo.
 *
 * Qui si prova la parte che decide, non il dito: il trascinamento lo fa la
 * CDK, e quello che arriva al componente e' sempre questa forma.
 */
describe('ProtocolloBuilderComponent — spostare un alimento', () => {
  function builder() {
    return new ProtocolloBuilderComponent(
      {} as any, {} as any, {} as any, new PdfImportService(), new WorkoutDataService(),
      { detectChanges: () => {} } as any,
      new ProtocolBuilderStateService(), new ToastService(), new ConfirmDialogService({} as any, {} as any)
    );
  }

  function combo(): any {
    return {
      id: 'c1', label: 'Base',
      carb: { name: 'Riso', qty: '100 g' },
      protein: { name: 'Pollo', qty: '150 g' },
      fat: null
    };
  }

  function trascina(da: any, a: any, daIdx = 0, aIdx = 0): any {
    return {
      previousContainer: { data: da }, container: { data: a },
      previousIndex: daIdx, currentIndex: aIdx
    };
  }

  const lista = (items: any[]) => ({ tipo: 'lista', items });
  const casella = (cat: string) => ({ tipo: 'casella', cat });

  it('riordina dentro la stessa lista', () => {
    const c = builder();
    const l = [{ name: 'Riso' }, { name: 'Pane' }, { name: 'Patate' }];
    const z = lista(l);
    c.spostaAlimento(combo(), trascina(z, z, 2, 0));
    expect(l.map(i => i.name)).toEqual(['Patate', 'Riso', 'Pane']);
  });

  it('lasciata dov\'era, non tocca niente', () => {
    const c = builder();
    const l = [{ name: 'Riso' }, { name: 'Pane' }];
    const z = lista(l);
    c.spostaAlimento(combo(), trascina(z, z, 1, 1));
    expect(l.map(i => i.name)).toEqual(['Riso', 'Pane']);
  });

  it('passa da una lista all\'altra', () => {
    const c = builder();
    const carb = [{ name: 'Riso' }, { name: 'Bresaola' }];
    const protein: any[] = [{ name: 'Pollo' }];
    c.spostaAlimento(combo(), trascina(lista(carb), lista(protein), 1, 0));
    expect(carb.map(i => i.name)).toEqual(['Riso']);
    expect(protein.map(i => i.name)).toEqual(['Bresaola', 'Pollo']);
  });

  it('passa dalle alternative di un alimento a quelle del pasto', () => {
    // Sono due liste e basta: il gestore non distingue di chi sono.
    const c = builder();
    const delPollo = [{ name: 'Tacchino', qty: '150 g' }];
    const delPasto: any[] = [];
    c.spostaAlimento(combo(), trascina(lista(delPollo), lista(delPasto), 0, 0));
    expect(delPollo).toEqual([]);
    expect(delPasto.map((i: any) => i.name)).toEqual(['Tacchino']);
  });

  it('due caselle si scambiano', () => {
    const c = builder();
    const k = combo();
    c.spostaAlimento(k, trascina(casella('protein'), casella('carb')));
    expect(k.carb.name).toBe('Pollo');
    expect(k.protein.name).toBe('Riso');
  });

  it('verso una casella vuota, la partenza resta vuota', () => {
    const c = builder();
    const k = combo();
    c.spostaAlimento(k, trascina(casella('protein'), casella('fat')));
    expect(k.fat.name).toBe('Pollo');
    expect(k.protein).toBeNull();
    expect(k.carb.name).toBe('Riso');
  });

  it('un\'alternativa diventa l\'alimento principale di un altro macro', () => {
    // La bresaola sta fra le alternative dei carboidrati e deve diventare la
    // proteina del pasto: il pollo che c'era prende il suo posto in lista.
    const c = builder();
    const k = combo();
    const altCarb = [{ name: 'Riso integrale' }, { name: 'Bresaola' }];
    c.spostaAlimento(k, trascina(lista(altCarb), casella('protein'), 1, 0));

    expect(k.protein.name).toBe('Bresaola');
    expect(altCarb.map(i => i.name)).toEqual(['Riso integrale', 'Pollo']);
  });

  it('promossa in una casella vuota, la lista perde solo lei', () => {
    const c = builder();
    const k = combo();
    const altFat = [{ name: 'Olio EVO' }, { name: 'Mandorle' }];
    c.spostaAlimento(k, trascina(lista(altFat), casella('fat'), 0, 0));
    expect(k.fat.name).toBe('Olio EVO');
    expect(altFat.map(i => i.name)).toEqual(['Mandorle']);
  });

  it('il principale si declassa ad alternativa', () => {
    const c = builder();
    const k = combo();
    const altCarb = [{ name: 'Pane' }];
    c.spostaAlimento(k, trascina(casella('carb'), lista(altCarb), 0, 1));
    expect(k.carb).toBeNull();
    expect(altCarb.map(i => i.name)).toEqual(['Pane', 'Riso']);
  });

  it('da una casella vuota non parte niente', () => {
    const c = builder();
    const k = combo();
    const l: any[] = [];
    c.spostaAlimento(k, trascina(casella('fat'), lista(l), 0, 0));
    expect(l).toEqual([]);
  });

  it('non si perde mai un alimento', () => {
    const c = builder();
    const k = combo();
    const alt = [{ name: 'Pane' }, { name: 'Bresaola' }];
    const tutti = () => [k.carb, k.protein, k.fat, ...alt].filter(Boolean).map((i: any) => i.name).sort();
    const prima = tutti();

    c.spostaAlimento(k, trascina(lista(alt), casella('carb'), 1, 0));
    expect(tutti()).toEqual(prima);

    c.spostaAlimento(k, trascina(casella('carb'), lista(alt), 0, 0));
    expect(tutti()).toEqual(prima);
  });

  it('aggiorna il macro scritto nell\'alimento, se c\'era', () => {
    // `category` serve a leggere i protocolli vecchi. Dopo lo spostamento
    // direbbe il falso.
    const c = builder();
    const k: any = { id: 'c1', label: 'Base', carb: null, protein: null, fat: null };
    const alt = [{ name: 'Bresaola', qty: '80 g', category: 'carb' }];
    c.spostaAlimento(k, trascina(lista(alt), casella('protein'), 0, 0));
    expect(k.protein.category).toBe('protein');
  });

  it('non lo aggiunge dove non c\'era', () => {
    const c = builder();
    const k: any = { id: 'c1', label: 'Base', carb: null, protein: null, fat: null };
    const alt = [{ name: 'Bresaola', qty: '80 g' }];
    c.spostaAlimento(k, trascina(lista(alt), casella('protein'), 0, 0));
    expect('category' in k.protein).toBe(false);
  });

  it('gli integratori restano una lista a parte', () => {
    // Non sono alimenti: si riordinano e basta, e il loro gestore e' un altro.
    const c = builder();
    const integratori = [{ name: 'Creatina', qty: '5 g' }, { name: 'Omega 3', qty: '2 cps' }];
    c.riordina(integratori, trascina(integratori, integratori, 1, 0));
    expect(integratori.map(i => i.name)).toEqual(['Omega 3', 'Creatina']);
  });

  it('la presa non aspetta: nessun ritardo, da nessuna parte', () => {
    // Un cdkDragStartDelay non fa aspettare: se il dito si muove oltre i 5px
    // PRIMA che sia scaduto, la CDK annulla la presa invece di rinviarla
    // (_endDragSequence, drag-drop.mjs). Col dito si muove quasi sempre
    // subito, quindi col ritardo non partiva niente e non si capiva perche'.
    // Senza il campo, un [cdkDragStartDelay]="ritardoPresa" rimesso nel
    // template non compila nemmeno.
    expect((builder() as any).ritardoPresa).toBeUndefined();
  });
});
