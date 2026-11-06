import { vi } from 'vitest';

// pdfjs-dist tocca API browser assenti nell'ambiente di test: stesso mock gia' usato
// in pdf-import.service.spec.ts e in protocollo-builder.component.spec.ts.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

import { ProtocolloImportComponent } from './protocollo-import.component';
import { PdfImportService, ParsedSupplements } from '../../services/pdf-import.service';
import { ProtocolService } from '../../services/protocol.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { AuthService } from '../../core/services/auth.service';
import { Diet } from '../../models/diet.model';

describe('ProtocolloImportComponent', () => {
  function emptyAlternatives() {
    return { carb: [], protein: [], fat: [] };
  }

  function buildDiet(): Diet {
    return [
      {
        id: 'plan-on', name: 'Giorno ON', meals: [
          { id: 'm1', name: 'Colazione', combinations: [], alternatives: emptyAlternatives() },
          { id: 'm2', name: 'Cena', combinations: [], alternatives: emptyAlternatives() }
        ]
      },
      {
        id: 'plan-off', name: 'Giorno OFF', meals: [
          { id: 'm3', name: 'Colazione', combinations: [], alternatives: emptyAlternatives() },
          { id: 'm4', name: 'Cena', combinations: [], alternatives: emptyAlternatives() }
        ]
      }
    ];
  }

  function buildComponent(): ProtocolloImportComponent {
    return new ProtocolloImportComponent(
      {} as any, // ActivatedRoute: non usato, non chiamiamo ngOnInit
      {} as any, // NavController
      new PdfImportService(),
      {} as any, // ProtocolService
      {} as any, // ConfirmDialogService
      { detectChanges: () => {} } as any // ChangeDetectorRef
    );
  }

  it('applica "always" a tutti i piani e "onlyOn" (con creazione pasto mancante) solo ai piani con "on" nel nome', () => {
    const component = buildComponent();
    const diet = buildDiet();
    const parsed: ParsedSupplements = {
      always: {
        Colazione: [{ name: 'Vitamina C+B', qty: '1 dose' }],
        Cena: [{ name: 'Magnesio', qty: '400 mg' }]
      },
      onlyOn: {
        Cena: [{ name: 'Creatina', qty: '5 g' }],
        'Intra-Workout': [{ name: 'Intra-workout', qty: '10 g' }]
      }
    };

    (component as any).applyParsedSupplements(diet, parsed);

    const onPlan = diet.find(p => p.name === 'Giorno ON')!;
    const offPlan = diet.find(p => p.name === 'Giorno OFF')!;

    expect(onPlan.meals.find(m => m.name === 'Colazione')!.supplements)
      .toEqual([{ name: 'Vitamina C+B', qty: '1 dose' }]);
    // Cena nel piano ON: Magnesio (always) + Creatina (onlyOn) insieme, non sostituiti.
    expect(onPlan.meals.find(m => m.name === 'Cena')!.supplements)
      .toEqual([{ name: 'Magnesio', qty: '400 mg' }, { name: 'Creatina', qty: '5 g' }]);
    // Pasto mancante creato solo per Intra-Workout, solo nel piano ON.
    const intraWorkout = onPlan.meals.find(m => m.name === 'Intra-Workout');
    expect(intraWorkout).toBeTruthy();
    expect(intraWorkout!.supplements).toEqual([{ name: 'Intra-workout', qty: '10 g' }]);

    // Piano OFF: solo le voci "always", nessuna Creatina, nessun pasto Intra-Workout creato.
    expect(offPlan.meals.find(m => m.name === 'Colazione')!.supplements)
      .toEqual([{ name: 'Vitamina C+B', qty: '1 dose' }]);
    expect(offPlan.meals.find(m => m.name === 'Cena')!.supplements)
      .toEqual([{ name: 'Magnesio', qty: '400 mg' }]);
    expect(offPlan.meals.find(m => m.name === 'Intra-Workout')).toBeUndefined();
  });

  it('non duplica le voci "onlyOn" (Merenda e Intra-Workout) se il PDF integrazione viene ricaricato piu\' volte', () => {
    const component = buildComponent();
    const diet = buildDiet();
    const parsed: ParsedSupplements = {
      always: {
        Colazione: [{ name: 'Vitamina C+B', qty: '1 dose' }],
        Cena: [{ name: 'Magnesio', qty: '400 mg' }]
      },
      onlyOn: {
        Merenda: [
          { name: 'Arginina', qty: '2 g' },
          { name: 'Carnitina', qty: '1 g' },
          { name: 'Termogenico', qty: '1 dose' }
        ],
        Cena: [{ name: 'Creatina', qty: '5 g' }],
        'Intra-Workout': [{ name: 'Intra-workout', qty: '10 g' }]
      }
    };
    // Il piano ON di questo fixture non ha un pasto "Merenda" predefinito: lo aggiungiamo
    // qui per poter verificare che una scrittura "onlyOn" su un pasto gia' esistente non
    // venga duplicata al secondo ricaricamento (lo stesso identico bug che colpisce
    // Merenda nel PDF integrazione reale).
    const onPlan = diet.find(p => p.name === 'Giorno ON')!;
    onPlan.meals.push({ id: 'm-merenda', name: 'Merenda', combinations: [], alternatives: emptyAlternatives() });

    (component as any).applyParsedSupplements(diet, parsed);
    (component as any).applyParsedSupplements(diet, parsed);

    const merenda = onPlan.meals.find(m => m.name === 'Merenda')!;
    expect(merenda.supplements).toEqual([
      { name: 'Arginina', qty: '2 g' },
      { name: 'Carnitina', qty: '1 g' },
      { name: 'Termogenico', qty: '1 dose' }
    ]);

    const intraWorkout = onPlan.meals.filter(m => m.name === 'Intra-Workout');
    expect(intraWorkout.length).toBe(1);
    expect(intraWorkout[0].supplements).toEqual([{ name: 'Intra-workout', qty: '10 g' }]);

    // Cena riceve sia "always" sia "onlyOn": deve comunque avere entrambe le voci una
    // sola volta ciascuna (non quadruplicate dopo due chiamate).
    expect(onPlan.meals.find(m => m.name === 'Cena')!.supplements)
      .toEqual([{ name: 'Magnesio', qty: '400 mg' }, { name: 'Creatina', qty: '5 g' }]);
  });

  /**
   * Il PDF della dieta e' opzionale.
   *
   * Per molti clienti il coach la dieta la scrive a mano nel builder, e
   * chiedere un PDF che non esiste bloccava la creazione del protocollo. La
   * scheda invece resta obbligatoria: senza, non c'e' un protocollo.
   */
  describe('la dieta e\' opzionale', () => {
    const finto = (nome: string) => new File(['x'], nome, { type: 'application/pdf' });

    // "aggiornamento" vuol dire che c'e' gia' un protocollo: lo dice
    // protocolId, da cui isUpdateMode si ricava.
    function inCreazione() {
      const c = buildComponent();
      c.protocolId = '';
      return c;
    }

    it('con la sola scheda si puo\' procedere', () => {
      const c = inCreazione();
      c.schedaFile = finto('scheda.pdf');
      expect(c.canProcess).toBe(true);
    });

    it('senza scheda no, nemmeno con la dieta', () => {
      const c = inCreazione();
      c.dietaFile = finto('dieta.pdf');
      expect(c.canProcess).toBe(false);
    });

    it('a mani vuote no', () => {
      expect(inCreazione().canProcess).toBe(false);
    });

    it('mentre elabora, no', () => {
      const c = inCreazione();
      c.schedaFile = finto('scheda.pdf');
      c.processing = true;
      expect(c.canProcess).toBe(false);
    });

    it('in aggiornamento basta ancora uno qualsiasi dei tre', () => {
      const c = buildComponent();
      c.protocolId = 'proto1';
      c.loadingExisting = false;
      c.dietaFile = finto('dieta.pdf');
      expect(c.canProcess).toBe(true);
    });
  });
  /**
   * Il piano del coach arriva spesso in chat, come testo: ogni voce (scheda,
   * dieta, integrazione) si puo' dare come PDF o come testo incollato, e il
   * parser lavora comunque sul testo. Una voce ha una sola fonte alla volta.
   */
  describe('testo incollato', () => {
    const finto = (nome: string) => new File(['x'], nome, { type: 'application/pdf' });
    const GIORNO = { id: 'd1', label: 'Lunedi', rec: '90"', ex: [{}] };

    function conServizi(over: { days?: unknown[]; protocollo?: Record<string, unknown> } = {}) {
      const pdfSvc = {
        extractText: vi.fn(async (f: File) => `testo di ${f.name}`),
        parseWorkoutText: vi.fn((_t: string) => over.days ?? [GIORNO]),
        parseDietText: vi.fn((_t: string) => [] as unknown[]),
        parseSupplementText: vi.fn((_t: string) => ({ always: {}, onlyOn: {} })),
        detectProgramDurationWeeks: vi.fn((_t: string) => 4),
        detectProtocolWeekPlan: vi.fn((_d: unknown, _w: number) => []),
        extractDietNotes: vi.fn((_t: string) => '')
      };
      const protocolSvc = {
        create: vi.fn(async () => 'nuovo1'),
        update: vi.fn(async (_id: string, _patch: unknown) => undefined),
        delete: vi.fn(async (_id: string) => undefined)
      };
      const nav = { navigateBack: vi.fn() };
      const confirm = { confirm: vi.fn(async (_m: string, _o?: unknown) => true) };
      const c = new ProtocolloImportComponent(
        {} as any, nav as any, pdfSvc as any, protocolSvc as any, confirm as any,
        { detectChanges: () => {} } as any
      );
      c.protocolId = '';
      return { c, pdfSvc, protocolSvc, nav, confirm };
    }

    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('il testo incollato e\' una fonte: con la sola scheda scritta si puo\' procedere', () => {
      const { c } = conServizi();
      c.onTesto('scheda', 'Lunedi\nPanca 4x8');
      expect(c.haFonte('scheda')).toBe(true);
      expect(c.canProcess).toBe(true);
    });

    it('il testo di sole spaziature non e\' una fonte', () => {
      const { c } = conServizi();
      c.onTesto('scheda', ' \n\t \n');
      expect(c.haFonte('scheda')).toBe(false);
      expect(c.canProcess).toBe(false);
    });

    it('la dieta scritta senza la scheda non basta, in creazione; in aggiornamento si', () => {
      const { c } = conServizi();
      c.onTesto('dieta', 'Colazione: 100 g di avena');
      expect(c.canProcess).toBe(false);
      c.protocolId = 'p1';
      c.loadingExisting = false;
      expect(c.canProcess).toBe(true);
    });

    it('scrivere il testo toglie il PDF scelto prima e ne svuota il campo, per poterlo riscegliere', () => {
      const { c } = conServizi();
      const campo = { value: 'C:\\fakepath\\scheda.pdf' } as HTMLInputElement;
      (c as any).pdfScheda = { nativeElement: campo };
      c.schedaFile = finto('scheda.pdf');
      c.onTesto('scheda', 'Panca 4x8');
      expect(c.schedaFile).toBeNull();
      expect(campo.value).toBe('');
      expect(c.haFonte('scheda')).toBe(true);
    });

    it('svuotare il testo non riporta indietro il PDF e non tocca il campo file', () => {
      const { c } = conServizi();
      const campo = { value: 'x' } as HTMLInputElement;
      (c as any).pdfDieta = { nativeElement: campo };
      c.dietaFile = finto('dieta.pdf');
      c.onTesto('dieta', '   ');
      expect(c.dietaFile).not.toBeNull();
      expect(campo.value).toBe('x');
    });

    it('scegliere un PDF toglie il testo incollato per quella voce e chiude il campo', () => {
      const { c } = conServizi();
      c.testi.scheda = 'Panca 4x8';
      c.testi.dieta = 'Colazione';
      c.aperto = 'scheda';
      const pdf = finto('scheda.pdf');
      c.onFile({ target: { files: [pdf] } } as unknown as Event, 'scheda');
      expect(c.schedaFile).toBe(pdf);
      expect(c.testi.scheda).toBe('');
      expect(c.aperto).toBeNull();
      // Le altre voci restano come stanno.
      expect(c.testi.dieta).toBe('Colazione');
    });

    it('annullare il selettore (nessun file) non cancella il testo gia\' scritto', () => {
      const { c } = conServizi();
      c.testi.scheda = 'Panca 4x8';
      c.aperto = 'scheda';
      c.onFile({ target: { files: [] } } as unknown as Event, 'scheda');
      expect(c.testi.scheda).toBe('Panca 4x8');
      expect(c.aperto).toBe('scheda');
    });

    it('i ritorni a capo di Windows e Mac diventano uno solo', () => {
      const { c } = conServizi();
      c.onTesto('scheda', 'a\r\nb\rc\nd');
      expect(c.testi.scheda).toBe('a\nb\nc\nd');
    });

    it('"Incolla" apre il campo, un altro tocco lo chiude, un\'altra voce lo sposta', () => {
      const { c } = conServizi();
      c.incolla('dieta');
      expect(c.aperto).toBe('dieta');
      c.incolla('scheda');
      expect(c.aperto).toBe('scheda');
      c.incolla('scheda');
      expect(c.aperto).toBeNull();
    });

    it('aprire il campo ci mette il cursore dentro, subito; chiuderlo no', () => {
      const { c } = conServizi();
      const fuochi = [vi.fn(async () => undefined), vi.fn(async () => undefined), vi.fn(async () => undefined)];
      const disegna = vi.fn();
      (c as any).campiTesto = { toArray: () => fuochi.map(setFocus => ({ setFocus })) };
      (c as any).cdr = { detectChanges: disegna };
      c.incolla('dieta');
      expect(disegna).toHaveBeenCalledTimes(1);
      // Solo il campo della sua riga (la dieta e' la seconda), e dopo averlo mostrato.
      expect(fuochi.map(f => f.mock.calls.length)).toEqual([0, 1, 0]);
      expect(disegna.mock.invocationCallOrder[0]).toBeLessThan(fuochi[1].mock.invocationCallOrder[0]);
      c.incolla('dieta');
      expect(fuochi.map(f => f.mock.calls.length)).toEqual([0, 1, 0]);
      expect(c.aperto).toBeNull();
      c.incolla('integrazione');
      expect(fuochi.map(f => f.mock.calls.length)).toEqual([0, 1, 1]);
    });

    it('il sottotitolo dice cosa e\' stato dato: testo (con le righe vere), file, o a cosa serve', () => {
      const { c } = conServizi();
      const riga = { id: 'scheda' as const, nome: 'Scheda allenamento', nota: 'Obbligatoria' };
      expect(c.sottotitolo(riga)).toBe('Obbligatoria');
      c.schedaFile = finto('scheda-ottobre.pdf');
      expect(c.sottotitolo(riga)).toBe('scheda-ottobre.pdf');
      c.onTesto('scheda', 'Lunedi\n\nPanca 4x8\n  \nSquat 3x10');
      expect(c.sottotitolo(riga)).toBe('Testo incollato · 3 righe');
      c.onTesto('scheda', 'Panca 4x8');
      expect(c.sottotitolo(riga)).toBe('Testo incollato · 1 riga');
    });

    it('la scheda incollata si legge come testo: niente PDF da aprire, il parser riceve il testo senza spazi attorno', async () => {
      const { c, pdfSvc, protocolSvc, nav } = conServizi();
      c.onTesto('scheda', '\n  Lunedi\nPanca 4x8  \n');
      await c.process();
      expect(pdfSvc.extractText).not.toHaveBeenCalled();
      expect(pdfSvc.parseWorkoutText).toHaveBeenCalledWith('Lunedi\nPanca 4x8');
      expect(protocolSvc.update).toHaveBeenCalledTimes(1);
      const patch = protocolSvc.update.mock.calls[0][1] as { workout: { days: unknown[] }; source: string };
      expect(patch.workout.days).toEqual([GIORNO]);
      expect(patch.source).toBe('pdf');
      expect(nav.navigateBack).toHaveBeenCalledWith(['/scheda/protocolli']);
      expect(c.errorMsg).toBe('');
    });

    it('PDF e testo si mescolano fra le voci: la scheda dal PDF, la dieta incollata', async () => {
      const { c, pdfSvc } = conServizi();
      c.schedaFile = finto('scheda.pdf');
      c.onTesto('dieta', 'Colazione: avena');
      await c.process();
      expect(pdfSvc.extractText).toHaveBeenCalledTimes(1);
      expect((pdfSvc.extractText.mock.calls[0] as unknown as [File])[0].name).toBe('scheda.pdf');
      expect(pdfSvc.parseWorkoutText).toHaveBeenCalledWith('testo di scheda.pdf');
      expect(pdfSvc.parseDietText).toHaveBeenCalledWith('Colazione: avena');
    });

    it('un testo senza esercizi non crea un protocollo vuoto: la bozza appena nata si toglie e si spiega', async () => {
      const { c, protocolSvc, nav } = conServizi({ days: [] });
      c.onTesto('scheda', 'Ciao! Ecco il piano, a presto');
      await c.process();
      expect(protocolSvc.create).toHaveBeenCalledTimes(1);
      expect(protocolSvc.delete).toHaveBeenCalledWith('nuovo1');
      expect(protocolSvc.update).not.toHaveBeenCalled();
      expect(nav.navigateBack).not.toHaveBeenCalled();
      expect(c.errorMsg).toBe('Non ho trovato nessun esercizio nella scheda. Controlla di aver dato la scheda giusta, o scrivila a mano.');
      expect(c.processing).toBe(false);
    });

    it('se anche togliere la bozza vuota fallisce, l\'errore resta quello utile', async () => {
      const { c, protocolSvc } = conServizi({ days: [] });
      protocolSvc.delete.mockRejectedValueOnce(new Error('offline'));
      c.onTesto('scheda', 'niente');
      await c.process();
      expect(c.errorMsg).toContain('Non ho trovato nessun esercizio');
    });

    it('in aggiornamento una scheda senza esercizi non riscrive niente: i giorni di oggi restano', async () => {
      const { c, protocolSvc, nav } = conServizi({ days: [] });
      c.protocolId = 'p1';
      c.loadingExisting = false;
      (c as any).existingProtocol = { id: 'p1', workout: { days: [GIORNO], weekPlan: [] } } as any;
      c.onTesto('scheda', 'testo sbagliato');
      await c.process();
      expect(protocolSvc.update).not.toHaveBeenCalled();
      expect(nav.navigateBack).not.toHaveBeenCalled();
      expect(c.errorMsg).toContain('Non ho trovato nessun esercizio');
    });

    it('in aggiornamento la dieta incollata aggiorna solo la dieta, senza toccare i giorni, e riporta al builder', async () => {
      const { c, protocolSvc, nav, pdfSvc } = conServizi();
      c.protocolId = 'p1';
      c.loadingExisting = false;
      (c as any).existingProtocol = { id: 'p1', workout: { days: [GIORNO], weekPlan: [] }, diet: [] } as any;
      c.onTesto('dieta', 'Colazione: avena');
      await c.process();
      expect(pdfSvc.parseWorkoutText).not.toHaveBeenCalled();
      expect(protocolSvc.update).toHaveBeenCalledTimes(1);
      const [id, patch] = protocolSvc.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('p1');
      expect(Object.keys(patch)).not.toContain('workout');
      expect(Object.keys(patch)).toContain('diet');
      expect(nav.navigateBack).toHaveBeenCalledWith(['/scheda/protocolli/builder', 'p1']);
    });

    it('in aggiornamento il riepilogo della conferma conta anche i testi incollati', async () => {
      const { c, confirm } = conServizi();
      c.protocolId = 'p1';
      c.loadingExisting = false;
      (c as any).existingProtocol = { id: 'p1', workout: { days: [GIORNO], weekPlan: [] }, diet: [] } as any;
      c.onTesto('dieta', 'Colazione: avena');
      c.onTesto('integrazione', 'Creatina 5 g');
      await c.process();
      expect(confirm.confirm.mock.calls[0][0]).toBe('Verranno aggiornati: dieta e note, note integrazione. Continuare?');
    });
  });
});
