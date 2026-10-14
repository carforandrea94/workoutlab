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
});
