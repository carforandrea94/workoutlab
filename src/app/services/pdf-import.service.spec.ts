import { vi } from 'vitest';

// pdfjs-dist tocca API browser (DOMMatrix, canvas) assenti nell'ambiente di test:
// qui testiamo solo il parsing testuale, non l'estrazione reale dal PDF, quindi
// stubbiamo il modulo per poter importare il servizio senza side effect.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

import { PdfImportService } from './pdf-import.service';

// Testo ricostruito riga per riga come lo produrrebbe extractText() (con hasEOL corretto)
// a partire dal PDF "DIETA_ANDREA_CARFORA" (template Giorno ON/OFF, Dott. Luigi Iannotta).
// Include volutamente i casi limite osservati nel PDF reale:
// - alimento e marcatore "Alternative:" uniti sulla stessa riga ("Petto di pollo 200 g Alternative:")
// - "Alternative:" ripetuto dopo un'interruzione di pagina ("...Continua Cena")
// - il glitch di estrazione "Olio di oli 10 g va (media)" al posto di "Olio di oliva (media) 10 g"
// - "Verdure fresche" che non ha uno slot dedicato nel modello a 3 macro
// - "Giorno ON"/"Giorno OFF" ripetuto come intestazione di OGNI pagina (non solo a inizio
//   sezione): riapparire a meta' pasto, subito prima di "...Continua X", non deve azzerare
//   pasto/combinazione/alternative correnti (bug reale: causava la perdita di alimenti interi
//   e alternative dopo un'interruzione di pagina)
const SAMPLE_TEXT = `
Dott. Luigi Iannotta
Giorno ON
COLAZIONE
Uova di gallina - albume 200 g
Farina d'avena 5 Cucchiai 50 g
Burro d'arachidi 2 Cucchiaini 10 g
COLAZIONE ALTERNATIVA 1
Yogurt greco 0% bianco 200 g
Fiocchi d'avena 4 Cucchiai 40 g
Alternative:
Riso soffiato 4 Cucchiai 40 g
Fette biscottate integrali 4 Fette 40 g
Frutta secca e oleosa (media) 10 g
Alternative:
Semi di Chia 10 g
COLAZIONE ALTERNATIVA 2
Uova di gallina (media) 120 g
Pane tostato 2 Fette 50 g
Uova di gallina - albume 70 g
SPUNTINO MATTINA
Proteine Isolate - Myprotein 25 g Alternative:
Fesa di tacchino arrosto 80 g
Bresaola 70 g
Yogurt greco 0% bianco 200 g
Uova di gallina - albume 200 g
Pane di segale 2 Fette 60 g Alternative:
Gallette di riso 4 Fette 40 g
Pane azzimo 1 Panino 40 g
Giorno ON
...Continua Spuntino Mattina
Frutta fresca (media) 200 g
Farina d'avena 4 Cucchiai 40 g
Frutta secca e oleosa (media) 15 g
PRANZO
Riso 3 Cucchiai 60 g Alternative:
Pasta di semola integrale 1 Piatto 70 g
Patate (media) 280 g
Petto di pollo 200 g Alternative:
Tacchino petto 200 g
Merluzzo o nasello 250 g
Verdure fresche (media) 150 g
Olio di oli 10 g va (media)
CENA
Riso 1 Piatto e 1/4 100 g Alternative:
Pasta di semola integrale 1 Piatto e 1/4 100 g
Patate (media) 300 g
Giorno ON
...Continua Cena
Alternative:
Gnocchi 200 g
Cous Cous 90 g
Petto di pollo 200 g Alternative:
Tacchino petto 200 g
Verdure fresche (media) 150 g
Olio di oli 10 g va (media)
Giorno OFF
COLAZIONE
Uova di gallina - albume 200 g
Farina d'avena 5 Cucchiai 50 g
Burro d'arachidi 2 Cucchiaini 10 g
Consigli di base
Consigli di base
Bere almeno 2-3l di acqua naturale al giorno
Sgarro: consentito 1 volta ogni 2 settimane
`;

describe('PdfImportService', () => {
  let service: PdfImportService;

  beforeEach(() => {
    service = new PdfImportService();
  });

  it('riconosce entrambi i piani "Giorno ON" e "Giorno OFF"', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    expect(diet.map(p => p.name)).toEqual(['Giorno ON', 'Giorno OFF']);
  });

  it('crea le combinazioni Base + Alternativa 1 + Alternativa 2 per la Colazione', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const colazione = diet[0].meals.find(m => m.name === 'Colazione')!;
    expect(colazione.combinations.map(c => c.label)).toEqual(['Base', 'Alternativa 1', 'Alternativa 2']);

    const base = colazione.combinations[0];
    expect(base.protein?.name).toBe("Uova di gallina - albume");
    expect(base.protein?.qty).toBe('200 g');
    expect(base.carb?.name).toBe("Farina d'avena");
    expect(base.carb?.qty).toBe('5 Cucchiai · 50 g');
    expect(base.fat?.name).toBe("Burro d'arachidi");
    expect(base.fat?.qty).toBe('2 Cucchiaini · 10 g');

    const alt1 = colazione.combinations[1];
    expect(alt1.carb?.name).toBe("Fiocchi d'avena");
    expect(alt1.carb?.alt?.map(a => a.name)).toEqual(['Riso soffiato', 'Fette biscottate integrali']);
    expect(alt1.fat?.name).toBe('Frutta secca e oleosa (media)');
    expect(alt1.fat?.alt?.map(a => a.name)).toEqual(['Semi di Chia']);

    const alt2 = colazione.combinations[2];
    expect(alt2.fat?.name).toBe('Uova di gallina (media)'); // uovo intero -> grassi
    expect(alt2.carb?.name).toBe('Pane tostato');
    expect(alt2.protein?.name).toBe("Uova di gallina - albume");
  });

  it("gestisce il marcatore 'Alternative:' unito sulla stessa riga dell'alimento", () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const pranzo = diet[0].meals.find(m => m.name === 'Pranzo')!;
    const base = pranzo.combinations[0];
    expect(base.protein?.name).toBe('Petto di pollo');
    expect(base.protein?.alt?.map(a => a.name)).toEqual(['Tacchino petto', 'Merluzzo o nasello']);
  });

  it('accumula le alternative attraverso una interruzione di pagina ("...Continua")', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const spuntino = diet[0].meals.find(m => m.name === 'Spuntino Mattina')!;
    const base = spuntino.combinations[0];
    expect(base.carb?.name).toBe('Pane di segale');
    expect(base.carb?.alt?.map(a => a.name)).toEqual([
      'Gallette di riso', 'Pane azzimo', 'Frutta fresca (media)', "Farina d'avena"
    ]);
    // Il fat successivo (categoria diversa) non deve finire tra le alternative del carb
    expect(base.fat?.name).toBe('Frutta secca e oleosa (media)');
    expect(base.fat?.qty).toBe('15 g');
  });

  it('accumula le alternative anche quando "Alternative:" si ripete dopo "...Continua"', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const cena = diet[0].meals.find(m => m.name === 'Cena')!;
    const base = cena.combinations[0];
    expect(base.carb?.name).toBe('Riso');
    expect(base.carb?.alt?.map(a => a.name)).toEqual([
      'Pasta di semola integrale', 'Patate (media)', 'Gnocchi', 'Cous Cous'
    ]);
    // Bug reale: "Giorno ON" si ripete come intestazione di pagina subito prima di
    // "...Continua Cena" e azzerava combinazione/alimento corrente, perdendo
    // interi alimenti (non solo alternative) dopo l'interruzione di pagina.
    expect(base.protein?.name).toBe('Petto di pollo');
    expect(base.protein?.alt?.map(a => a.name)).toEqual(['Tacchino petto']);
    expect(base.fat?.name).toBe('Olio di oliva (media)');
  });

  it('non crea un piano duplicato quando "Giorno X" si ripete come intestazione di pagina', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    expect(diet.filter(p => p.name === 'Giorno ON').length).toBe(1);
  });

  it('corregge il glitch di estrazione "Olio di oli ... va (media)" e lo assegna ai grassi', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const pranzo = diet[0].meals.find(m => m.name === 'Pranzo')!;
    const base = pranzo.combinations[0];
    expect(base.fat?.name).toBe('Olio di oliva (media)');
    expect(base.fat?.qty).toBe('10 g');
  });

  it('non inserisce "Verdure fresche" in nessuno slot macro', () => {
    const diet = service.parseDietText(SAMPLE_TEXT);
    const pranzo = diet[0].meals.find(m => m.name === 'Pranzo')!;
    const values = pranzo.combinations.flatMap(c => [c.carb, c.protein, c.fat]);
    expect(values.some(v => v?.name.toLowerCase().includes('verdur'))).toBe(false);
  });

  it('estrae le verdure e i consigli di base come note libere', () => {
    const notes = service.extractDietNotes(SAMPLE_TEXT);
    expect(notes).toContain('Verdure fresche libere');
    expect(notes).toContain('150 g');
    expect(notes).toContain('Consigli di base:');
    expect(notes).toContain('Bere almeno 2-3l di acqua naturale al giorno');
    expect(notes).toContain('Sgarro: consentito 1 volta ogni 2 settimane');
  });

  it('ripiega sul parser generico per un testo che non segue il template "Giorno X"', () => {
    const genericText = `Colazione\nAvena 50 g\nPranzo\nPollo 200 g`;
    const diet = service.parseDietText(genericText);
    expect(diet.length).toBe(1);
    expect(diet[0].meals.map(m => m.name)).toEqual(['Colazione', 'Pranzo']);
  });

  // Bug #8: un'intestazione di pasto non prevista in MEAL_HEADER_DEFS (es. "SPUNTINO SERALE")
  // veniva lasciata cadere e i suoi alimenti confluivano nel pasto precedente, corrompendolo.
  it('apre un nuovo pasto per un\'intestazione non riconosciuta invece di fonderla nel precedente', () => {
    const text = `
Giorno ON
COLAZIONE
Uova di gallina - albume 200 g
SPUNTINO SERALE
Bresaola 70 g
PRANZO
Petto di pollo 200 g
`;
    const diet = service.parseDietText(text);
    const colazione = diet[0].meals.find(m => m.name === 'Colazione')!;
    // La Bresaola NON deve finire tra le alternative della proteina della Colazione
    expect(colazione.combinations[0].protein?.name).toBe('Uova di gallina - albume');
    expect(colazione.combinations[0].protein?.alt ?? []).toEqual([]);
    // Deve invece esistere un pasto a se' col testo grezzo come nome, che contiene la Bresaola
    const serale = diet[0].meals.find(m => m.name === 'SPUNTINO SERALE');
    expect(serale).toBeDefined();
    expect(serale!.combinations[0].protein?.name).toBe('Bresaola');
  });

  // Bug #17: la sezione "Consigli di base" non aveva un confine di chiusura e consumava ogni
  // riga fino a fine documento, trascinando dentro il contenuto delle sezioni successive.
  it('chiude i "Consigli di base" a una intestazione successiva ("Giorno X")', () => {
    const text = `
Giorno ON
Consigli di base
Bere molta acqua naturale
Giorno OFF
COLAZIONE
Segreto da non includere 999 g
`;
    const notes = service.extractDietNotes(text);
    expect(notes).toContain('Bere molta acqua naturale');
    expect(notes).not.toContain('Segreto da non includere');
  });

  // Bug #18: la misura singolare "cucchiaio" non era riconosciuta (solo "cucchiai"/"cucchiaino").
  it('riconosce la misura singolare "cucchiaio" come le altre misure', () => {
    const text = `
Giorno ON
COLAZIONE
Miele 1 cucchiaio 20 g
`;
    const diet = service.parseDietText(text);
    const colazione = diet[0].meals.find(m => m.name === 'Colazione')!;
    const values = colazione.combinations[0];
    const miele = [values.carb, values.protein, values.fat].find(v => v?.name === 'Miele');
    expect(miele).toBeDefined();
    expect(miele!.qty).toBe('1 cucchiaio · 20 g');
  });
});

// Testo ricostruito riga per riga come lo produrrebbe extractText() a partire dal PDF
// "ANDREA_CARFORA_SCHEDA" (template "DURATA N SETTIMANE" / "DAY N: Gruppo REC TRA X-Y" /
// "EX.N/Nome" + riga schema). Include i casi limite osservati nel PDF reale: progressione
// wave su 8 settimane, schemi a range ("10/12"), sequenze per-set ("12-10-8"), bodyweight
// ("MAX"), isometria ("2'"), drop-set con nota libera, schema a piu' segmenti ("2x8 1x20")
// e reps bilaterali ("12+12").
const SCHEDA_TEXT = `
DURATA 8 SETTIMANE
DAY 1 : PETTO-SPALLE-TRICIPITI REC TRA 60-90”
EX.1/SPINTE MANUBRI PANCA PIANA
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.2/DIPS MACHINE/PARALLELE
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.3/CHEST PRESS
3X12-10-8
EX.4/ALZATE LATERALI MANUBRI IN PIEDI
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.5/ALZATE MANUBRI CON PETTO SU PANCA A 45
3X10/12
EX.6/FRENCH PRESS MANUBRI SDRAITO
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.7/PUSH DOWN GIRATO DI SCHIENA AL PACCO PESI
3X8/12
EX.8/FLESSIONI DEL BUSTO AL CAVO OPPURE ALLA LAT MACHINE
4X12/15
EX.9/INVERSI SU PANCA
3XMAX
DAY 2: DORSO-DELT.POST-BICIPITI REC TRA 60-90”
EX.1/LAT MACHINE AVANTI
5X8
EX.2/T BAR
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.3/REMATORE MANUBRIO
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.4/LAT INVERSA
4X10/12
EX.5/CROCI AI CAVI INCROCIATI
3X12/15
EX.5/CURL BILANCIERE
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.6/CURL MANUBRI A MARTELLO
4X10+ ULTIMA IN STRIP MENO DEL 30%
EX.7/CRUNCH SU FITBALL
3X2’
EX.8/GINOCCHIA AL PETTO DA SEDUTO
3XMAX
DAY 3: GAMBE REC TRA 60-90”
EX.1/SQUAT AL M.POWER
4X10 4X10 4X8 4X8 5X6 5X6… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.2/LEG PRESS 45°
4X8/12
EX.3/SPLIT SQUAT AL M.POWER
3X12/15 con fermo in basso di 2”
EX.4/LEG EXTENSION UNILATERALE
2x8 1x20
EX.5/LEG CURL IN PIEDI
4x8/12
EX.6/HIP THRUST CON BILANCIERE+AFFONDI CAMMINANDO
3X12+12
`;

/**
 * Le righe qui sotto sono copiate parola per parola da "dieta Andrea Diet break"
 * (stesso template, stesso nutrizionista), dove l'importazione sbagliava:
 * intestazioni che diventavano pasti a se' invece di alternative, e una
 * precisazione stampata sotto un alimento che diventava anche lei un pasto.
 */
const TESTO_DIET_BREAK = `
Dott. Luigi Iannotta
Giorno ON
COLAZIONE ALTERNATIVA 3
Proteine Isolate - Myprotein 20 g
Cornflakes 8 Cucchiai 80 g
SENZA ZUCCHERI AGGIUNTI
Alternative:
Crusca di frumento 1 Bicchiere 100 g
PRANZO
Riso 1 Piatto e 1/2 120 g
Petto di pollo 200 g
PRANZO ALTERNATIVO 1 Nota: aggiungi 6gr di aminoacidi essenziali
Lenticchie decorticate 130 g
PRANZO ALTERNATIVO 2
Uova di gallina - albume 250 g
CENA
Riso 1 Bicchiere 150 g
SPUNTINO SERALE
Fiocchi d'avena 3 Cucchiai 30 g
`;

describe('PdfImportService - il template che concorda il genere e annota i titoli', () => {
  let service: PdfImportService;
  beforeEach(() => { service = new PdfImportService(); });

  const pasti = () => service.parseDietText(TESTO_DIET_BREAK)[0].meals;

  /* "PRANZO ALTERNATIVO 1" al maschile non combaciava, e finiva nel ramo delle
     intestazioni sconosciute: nella dieta del cliente compariva un pasto
     "PRANZO ALTERNATIVO 2" accanto al pranzo, invece di una combinazione. */
  it('l\'alternativa al maschile resta una combinazione del pranzo', () => {
    const nomi = pasti().map(m => m.name);
    expect(nomi).not.toContain('PRANZO ALTERNATIVO 1');
    expect(nomi).not.toContain('PRANZO ALTERNATIVO 2');

    const pranzo = pasti().find(m => m.name === 'Pranzo')!;
    expect(pranzo.combinations.map(c => c.label)).toEqual([
      'Base',
      'Alternativa 1 · Nota: aggiungi 6gr di aminoacidi essenziali',
      'Alternativa 2'
    ]);
  });

  /* La nota accanto al titolo rompeva l'ancora di fine riga: l'alternativa
     spariva e i suoi alimenti confluivano nella combinazione precedente. */
  it('la nota accanto al titolo non fa perdere l\'alternativa, e si conserva', () => {
    const pranzo = pasti().find(m => m.name === 'Pranzo')!;
    const conNota = pranzo.combinations.find(c => c.label.startsWith('Alternativa 1'))!;
    expect(conNota.label).toContain('aggiungi 6gr di aminoacidi essenziali');
    // In che macro finiscano le lenticchie non e' il punto: il punto e' che gli
    // alimenti dell'alternativa stanno nell'alternativa.
    const dentro = [conNota.carb, conNota.protein, conNota.fat].map(f => f?.name);
    expect(dentro).toContain('Lenticchie decorticate');
    // La base resta quella che era: nessun travaso.
    expect(pranzo.combinations[0].protein?.name).toBe('Petto di pollo');
  });

  /* "SENZA ZUCCHERI AGGIUNTI" e' stampato sotto i cornflakes, nella colonna
     degli alimenti: e' come si chiamano quei cornflakes, non un pasto. */
  it('la precisazione sotto un alimento entra nel suo nome, non diventa un pasto', () => {
    expect(pasti().map(m => m.name)).not.toContain('SENZA ZUCCHERI AGGIUNTI');

    const colazione = pasti().find(m => m.name === 'Colazione')!;
    const alt3 = colazione.combinations.find(c => c.label === 'Alternativa 3')!;
    expect(alt3.carb?.name).toBe('Cornflakes senza zuccheri aggiunti');
    // E le sue alternative restano attaccate a lui.
    expect(alt3.carb?.alt?.map(a => a.name)).toContain('Crusca di frumento');
  });

  /* Il filtro non deve chiudere la porta ai pasti che il template non prevede. */
  it('un pasto sconosciuto che si chiama pasto resta un pasto', () => {
    const spuntino = pasti().find(m => m.name === 'SPUNTINO SERALE');
    expect(spuntino).toBeTruthy();
    expect(spuntino!.combinations[0].carb?.name).toBe("Fiocchi d'avena");
  });

  /* "1 Bicchiere" non era fra le misure note: restava incollato al nome. */
  it('il bicchiere e\' una misura, non parte del nome', () => {
    const cena = pasti().find(m => m.name === 'Cena')!;
    expect(cena.combinations[0].carb?.name).toBe('Riso');
    expect(cena.combinations[0].carb?.qty).toBe('1 Bicchiere · 150 g');
  });
});

describe('PdfImportService - scheda allenamento', () => {
  let service: PdfImportService;

  beforeEach(() => {
    service = new PdfImportService();
  });

  it('rileva la durata del programma dichiarata nel PDF', () => {
    expect(service.detectProgramDurationWeeks(SCHEDA_TEXT)).toBe(8);
    expect(service.detectProgramDurationWeeks('nessuna durata qui')).toBe(8); // default
  });

  it('riconosce i 3 giorni con label e recupero', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    expect(days.length).toBe(3);
    expect(days.map(d => d.label)).toEqual(['Petto-Spalle-Tricipiti', 'Dorso-Delt.post-Bicipiti', 'Gambe']);
    expect(days.every(d => d.rec === '60-90"')).toBe(true);
  });

  it('costruisce una progressione wave su 8 settimane che ricomincia dal ciclo iniziale', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const ex1 = days[0].ex[0];
    expect(ex1.name).toBe('SPINTE MANUBRI PANCA PIANA');
    expect(ex1.scheme).toBe('wave');
    expect(ex1.weekPlan?.length).toBe(8);
    expect(ex1.weekPlan).toEqual([
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 },
      { sets: 4, reps: 8 }, { sets: 4, reps: 8 },
      { sets: 5, reps: 6 }, { sets: 5, reps: 6 },
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 } // settimane 7-8: "riprendi da 4x10"
    ]);
    expect(ex1.muscle).toBe('Petto');
  });

  it('deriva la progressione wave del protocollo dalla piu\' comune tra gli esercizi wave, invece di uno schema fisso', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const weekPlan = service.detectProtocolWeekPlan(days, 8);
    expect(weekPlan).toEqual([
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 },
      { sets: 4, reps: 8 }, { sets: 4, reps: 8 },
      { sets: 5, reps: 6 }, { sets: 5, reps: 6 },
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 }
    ]);
  });

  it('ripiega su uno schema fisso 4x10 quando non ci sono esercizi wave nel PDF', () => {
    const days = [{ id: 'day1', label: 'Giorno 1', rec: '60-90"', ex: [
      { name: 'Panca piana', scheme: 'plain' as const, sets: 3, muscle: 'Petto', reps: ['12', '12', '12'], text: '3x12' }
    ] }];
    const weekPlan = service.detectProtocolWeekPlan(days, 4);
    expect(weekPlan).toEqual([
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 }, { sets: 4, reps: 10 }, { sets: 4, reps: 10 }
    ]);
  });

  it('sceglie la progressione piu\' frequente quando gli esercizi wave hanno progressioni diverse tra loro', () => {
    const mixedText = `
DURATA 4 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/PANCA PIANA
4X10 4X8… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.2/CHEST PRESS
4X10 4X8… E RIPRENDI DA 4X10 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
EX.3/SQUAT
3X12 3X10… E RIPRENDI DA 3X12 AUMENTANDO IL CARICO RISPETTO ALL SETT.1 SCORSA
`;
    const days = service.parseWorkoutText(mixedText);
    const weekPlan = service.detectProtocolWeekPlan(days, 4);
    // 2 esercizi su 3 usano 4x10/4x8 (la piu' frequente), 1 solo usa 3x12/3x10.
    // La frase "…E RIPRENDI DA 4X10" ripete la prima coppia (stesso comportamento
    // gia' verificato sopra per SCHEDA_TEXT): il ciclo e' quindi [4x10,4x8,4x10],
    // non [4x10,4x8].
    expect(weekPlan).toEqual([
      { sets: 4, reps: 10 }, { sets: 4, reps: 8 },
      { sets: 4, reps: 10 }, { sets: 4, reps: 10 }
    ]);
  });

  it('interpreta gli schemi semplici (sequenza per-set, range, bodyweight, isometria)', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const day1ByName = (n: string) => days[0].ex.find(e => e.name === n)!;

    const chestPress = day1ByName('CHEST PRESS');
    expect(chestPress.scheme).toBe('plain');
    expect(chestPress.sets).toBe(3);
    expect(chestPress.reps).toEqual(['12', '10', '8']); // sequenza per-set

    const alzate45 = day1ByName('ALZATE MANUBRI CON PETTO SU PANCA A 45');
    expect(alzate45.sets).toBe(3);
    expect(alzate45.reps).toEqual(['10/12', '10/12', '10/12']); // range uniforme

    const inversi = day1ByName('INVERSI SU PANCA');
    expect(inversi.reps).toEqual(['MAX', 'MAX', 'MAX']);

    const day2ByName = (n: string) => days[1].ex.find(e => e.name === n)!;
    const crunch = day2ByName('CRUNCH SU FITBALL');
    expect(crunch.sets).toBe(3);
    expect(crunch.reps).toEqual(['2’', '2’', '2’']); // isometria
  });

  it('separa la nota libera (drop-set, tempo di recupero) dallo schema serie/ripetizioni', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const curlMartello = days[1].ex.find(e => e.name === 'CURL MANUBRI A MARTELLO')!;
    expect(curlMartello.sets).toBe(4);
    expect(curlMartello.reps).toEqual(['10', '10', '10', '10']);
    expect(curlMartello.note).toContain('ULTIMA IN STRIP MENO DEL 30%');

    const splitSquat = days[2].ex.find(e => e.name === 'SPLIT SQUAT AL M.POWER')!;
    expect(splitSquat.reps).toEqual(['12/15', '12/15', '12/15']);
    expect(splitSquat.note).toContain('fermo in basso di 2');
  });

  it('somma gli schemi a piu\' segmenti sulla stessa riga ("2x8 1x20")', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const legExt = days[2].ex.find(e => e.name === 'LEG EXTENSION UNILATERALE')!;
    expect(legExt.scheme).toBe('plain');
    expect(legExt.sets).toBe(3);
    expect(legExt.reps).toEqual(['8', '8', '20']);
  });

  it('mantiene le reps bilaterali ("12+12") come descrittore unico per set', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const hipThrust = days[2].ex.find(e => e.name.startsWith('HIP THRUST'))!;
    expect(hipThrust.sets).toBe(3);
    expect(hipThrust.reps).toEqual(['12+12', '12+12', '12+12']);
  });

  it('categorizza il gruppo muscolare dal nome esercizio, con fallback al giorno', () => {
    const days = service.parseWorkoutText(SCHEDA_TEXT);
    const byName = (dayIdx: number, n: string) => days[dayIdx].ex.find(e => e.name === n)!;

    expect(byName(0, 'DIPS MACHINE/PARALLELE').muscle).toBe('Tricipiti');
    expect(byName(0, 'ALZATE LATERALI MANUBRI IN PIEDI').muscle).toBe('Spalle');
    expect(byName(0, 'FLESSIONI DEL BUSTO AL CAVO OPPURE ALLA LAT MACHINE').muscle).toBe('Core'); // non Dorso, nonostante "LAT MACHINE"
    expect(byName(0, 'INVERSI SU PANCA').muscle).toBe('Core'); // non Petto, nonostante "PANCA"
    expect(byName(1, 'GINOCCHIA AL PETTO DA SEDUTO').muscle).toBe('Core'); // non Petto
    expect(byName(1, 'CROCI AI CAVI INCROCIATI').muscle).toBe('Petto');
    expect(byName(2, 'LEG CURL IN PIEDI').muscle).toBe('Gambe'); // non Bicipiti, nonostante "CURL"
  });

  it('ripiega sul parser generico per un testo che non segue il template "DAY N / EX.N"', () => {
    const genericText = `Giorno 1\nPanca piana 4x10\nSquat 3x8`;
    const days = service.parseWorkoutText(genericText);
    expect(days.length).toBe(1);
    expect(days[0].ex.map(e => e.name)).toEqual(['Panca piana', 'Squat']);
  });

  // Bug #5: "DAY N: ..." si ripete come intestazione di OGNI pagina, anche a meta' della lista
  // esercizi di un giorno. Senza guardia creava un secondo giorno duplicato e, se cadeva mentre
  // un esercizio era in sospeso, ne perdeva lo schema (finalizzato col default) e spezzava la lista.
  it('non duplica il giorno quando "DAY N" si ripete come intestazione di pagina a meta\' lista', () => {
    const text = `
DURATA 8 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/SPINTE MANUBRI PANCA PIANA
5X8
DAY 2: DORSO REC TRA 60-90”
EX.1/LAT MACHINE AVANTI
5X8
EX.2/T BAR
DAY 2: DORSO REC TRA 60-90”
4X10
EX.3/REMATORE MANUBRIO
4X8
`;
    const days = service.parseWorkoutText(text);
    // Un solo giorno "Dorso", non due
    expect(days.filter(d => d.label === 'Dorso').length).toBe(1);
    const day2 = days.find(d => d.label === 'Dorso')!;
    expect(day2.ex.map(e => e.name)).toEqual(['LAT MACHINE AVANTI', 'T BAR', 'REMATORE MANUBRIO']);
    // L'esercizio in sospeso all'interruzione di pagina (T BAR) riceve il suo schema reale
    // ("4X10"), non il default "schema non trovato".
    const tBar = day2.ex.find(e => e.name === 'T BAR')!;
    expect(tBar.sets).toBe(4);
    expect(tBar.reps).toEqual(['10', '10', '10', '10']);
    expect(tBar.note).toBeUndefined();
  });

  // Bug #6 + #7: il marcatore "...Continua" non era mai controllato nel parser scheda (veniva
  // letto come riga di schema fasulla) e il regex non riconosceva i puntini di sospensione veri.
  it('ignora la riga di continuazione pagina con puntini di sospensione veri (U+2026)', () => {
    const text = `
DURATA 8 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/SPINTE MANUBRI PANCA PIANA
…Continua Day 1
5X8
`;
    const days = service.parseWorkoutText(text);
    const ex1 = days[0].ex[0];
    expect(ex1.name).toBe('SPINTE MANUBRI PANCA PIANA');
    expect(ex1.sets).toBe(5);
    expect(ex1.reps).toEqual(['8', '8', '8', '8', '8']);
    expect(ex1.note).toBeUndefined();
  });

  it('ignora la riga di continuazione pagina anche con tre punti letterali ("...Continua")', () => {
    const text = `
DURATA 8 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/SPINTE MANUBRI PANCA PIANA
...Continua Day 1
5X8
`;
    const days = service.parseWorkoutText(text);
    const ex1 = days[0].ex[0];
    expect(ex1.sets).toBe(5);
    expect(ex1.reps).toEqual(['8', '8', '8', '8', '8']);
    expect(ex1.note).toBeUndefined();
  });

  // Bug #9: la progressione wave veniva riconosciuta solo col fraseggio "riprendi"/"aumentando";
  // un fraseggio alternativo di ripresa ciclo ("ricomincia dal ciclo 1") va comunque letto come wave.
  it('riconosce la progressione wave anche con un fraseggio di ripresa ciclo alternativo', () => {
    const text = `
DURATA 8 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/SPINTE MANUBRI PANCA PIANA
4X10 4X10 4X8 4X8 5X6 5X6… ricomincia dal ciclo 1
`;
    const days = service.parseWorkoutText(text);
    const ex1 = days[0].ex[0];
    expect(ex1.scheme).toBe('wave');
    expect(ex1.weekPlan?.length).toBe(8);
  });

  // Bug #19: un descrittore reps di piu' parole ("AL CEDIMENTO") veniva troncato alla prima
  // parola (reps="AL") e il resto finiva nella nota (nota="CEDIMENTO").
  it('cattura un descrittore reps di piu\' parole ("AL CEDIMENTO") senza spezzarlo nella nota', () => {
    const text = `
DURATA 8 SETTIMANE
DAY 1 : PETTO REC TRA 60-90”
EX.1/CROCI AI CAVI
3X AL CEDIMENTO
`;
    const days = service.parseWorkoutText(text);
    const ex1 = days[0].ex[0];
    expect(ex1.sets).toBe(3);
    expect(ex1.reps).toEqual(['AL CEDIMENTO', 'AL CEDIMENTO', 'AL CEDIMENTO']);
    expect(ex1.note).toBeUndefined();
  });
});

describe('PdfImportService - parseSupplementText', () => {
  let service: PdfImportService;

  beforeEach(() => {
    service = new PdfImportService();
  });

  const INTEGRAZIONE_TEXT = `INTEGRAZIONE
vitamina C+B: una dose a colazione
creatina: 5gr a colazione
Omega 3,6,9: dose giornaliera prevista da dividere tra pranzo
e cena
pre-workout: 30 minuti prima
arginina 3g
carnitina 2g
termogenico dosaggio consigliato
intra-workout
10gr durante l'allenamento da sorseggiare in 500/700ml
d'acqua
post-workout:
5 gr di creatina da assumere nel pasto
magnesio 400mg da assumere dopo cena
bromelina assumere la dose consigliata a pranzo e cena`;

  it('assegna le righe semplici (fuori sezione) ai pasti “always”, fondendo le righe spezzate a meta\' frase', () => {
    const result = service.parseSupplementText(INTEGRAZIONE_TEXT);

    expect(result.always['Colazione']).toEqual([
      { name: 'vitamina C+B', qty: 'una dose a colazione' },
      { name: 'creatina', qty: '5gr a colazione' }
    ]);
    // Omega finisce sia in Pranzo sia in Cena: la riga “...tra pranzo” + “e cena”
    // (spezzata dal PDF) deve essere fusa PRIMA di cercare le parole chiave.
    expect(result.always['Pranzo']).toEqual([
      { name: 'Omega 3,6,9', qty: 'dose giornaliera prevista da dividere tra pranzo e cena' },
      { name: 'bromelina', qty: 'assumere la dose consigliata a pranzo e cena' }
    ]);
    expect(result.always['Cena']).toEqual([
      { name: 'Omega 3,6,9', qty: 'dose giornaliera prevista da dividere tra pranzo e cena' },
      { name: 'magnesio', qty: '400mg da assumere dopo cena' },
      { name: 'bromelina', qty: 'assumere la dose consigliata a pranzo e cena' }
    ]);
  });

  it('assegna i blocchi pre/intra/post-workout a “onlyOn”, fondendo il blocco intra-workout spezzato su piu\' righe', () => {
    const result = service.parseSupplementText(INTEGRAZIONE_TEXT);

    expect(result.onlyOn['Merenda']).toEqual([
      { name: 'arginina', qty: '3g' },
      { name: 'carnitina', qty: '2g' },
      { name: 'termogenico', qty: 'dosaggio consigliato' }
    ]);
    expect(result.onlyOn['Intra-Workout']).toEqual([
      { name: 'Intra-workout', qty: '10gr durante l\'allenamento da sorseggiare in 500/700ml d\'acqua' }
    ]);
    // Creatina post-workout: voce INDIPENDENTE da quella di Colazione (always),
    // nessuna fusione/deduplicazione per nome.
    expect(result.onlyOn['Cena']).toEqual([
      { name: 'creatina', qty: '5 gr' }
    ]);
  });
});

/**
 * Il secondo template di scheda, quello senza "REC TRA" nell'intestazione.
 *
 * Il testo e' quello vero, estratto da un PDF del coach con lo stesso pdfjs
 * che usa l'app: i ritorni a capo, le virgolette tipografiche e i nomi
 * spezzati a meta' riga sono i suoi, non una semplificazione.
 */
const SCHEDA_SENZA_REC_TRA = `DAY 1 : ADDUTTORI-TRICIPITI-ADDOME-LAVORO AEROBICO RISCALDAMENTO 3’
TAPPETO O CYCLET
EX.1/MACCHINA ADDUTTORI
4X12+10 REC 1’
EX.2/CAMMINATA LATERALE CON FASCIA (3 PASSI A SX E 3 PASSI A DX
RESTANDO BASSA IN POSIZIONE SQUAT = 1 MOVIMENTO)
6X10 REC 50”
EX.3/STACCHI SUMO CON BILANCIERE
5X12 REC 1’
EX.4/PUSH DOWN
5X15 REC 1’
EX.5/DOWN UP
3X15 REC 1’
EX.6/CRUNCH SU PANCA+CRUNCH INVERSO SU PANCA
5X20+5X15 REC 40”
EX.7/TAPPETO, CYCLET O ELLITTICA POST WORKOUT
12/15’ VELOCITÀ 5,5 KM
DAY 2 : GLUTEI-FEMORALI-DORSALI-ADDOME-LAVORO AEROBICO
EX.1/MACCHINA GLUTEI
5X12 ISOMETRIA 2” REC 1’
EX.2/STACCHI GLUTEI
4X12+10 DOPPIO CARICO REC 80”
EX.3/SPINTE 90 GLUTEI DA TERRA CON FASCIA
6X15+12 PAUSA 5” E RIPARTI CON LO STESSO GLUTEO PER LE 12
EX.4/STACCHI FEMORALI GAMBA TESA
6X12 REC 50”
EX.5/LAT MACHINE
5X12 REC 1’
EX.6/ADDOME TRASVERSO A TERRA
6X12 REC 40”
EX.7/TAPPETO, CYCLET O ELLITTICA
10/12’ VELOCITÀ 5,5 KM
DAY 3 : GLUTEI-GAMBE-LOMBARI-LAVORO AEROBICO RISCALDAMENTO 5’
TAPPETO, CYCLET O ELLITTICA
EX.1/SWING CON KETTLEBELL
6X15 PESO DA 6 O 8 REC 1’
EX.2/SALTI SUMO CON KETTLEBELL
5X12 REC 50”
EX.3/APERTURE LATERALI CON SPINTA DEI GLUTEI VERSO IL BASSO CON
KETTLEBELL
5X12 PER GAMBA REC 1’
EX.4/AFFONDO CON KETTLEBELL CON ROTAZIONE DI 45° DEL PIEDE VERSO
L’INTERNO 
4X12 PER GAMBA REC 1’
EX.5/HYPEREXTENSION CORPO LIBERO
5X10 REC 50”
EX.6/BURPEES
4X10 REC 50”
EX.7/DEFATICAMENTO TAPPETO, CYCLET O ELLITTICA
7/8’ MAX VELOCITÀ 5 KM`;

describe('parseWorkoutText — il template senza "REC TRA"', () => {
  const giorni = () => new PdfImportService().parseWorkoutText(SCHEDA_SENZA_REC_TRA);

  it('legge i tre giorni, e il riscaldamento non e\' un muscolo', () => {
    const d = giorni();
    expect(d.length).toBe(3);
    // Nell'intestazione c'e' "...LAVORO AEROBICO RISCALDAMENTO 3’": il
    // riscaldamento esce dall'elenco dei gruppi muscolari.
    expect(d[0].label).toBe('Adduttori-Tricipiti-Addome-Lavoro aerobico');
    expect(d[1].label).toBe('Glutei-Femorali-Dorsali-Addome-Lavoro aerobico');
    expect(d[2].label).toBe('Glutei-Gambe-Lombari-Lavoro aerobico');
  });

  it('il recupero del giorno lo ricava dagli esercizi', () => {
    // L'intestazione non lo dichiara, ma ogni esercizio ha il suo ("REC 1’",
    // "REC 50”"): si tiene il piu' frequente, che qui e' un minuto.
    expect(giorni().every(d => d.rec === '60"')).toBe(true);
  });

  it('sette esercizi per giorno, nell\'ordine del PDF', () => {
    const d = giorni();
    expect(d.map(g => g.ex.length)).toEqual([7, 7, 7]);
    expect(d[0].ex[0].name).toBe('MACCHINA ADDUTTORI');
    expect(d[0].ex[2].name).toBe('STACCHI SUMO CON BILANCIERE');
  });

  it('un nome che va a capo resta un nome solo', () => {
    // "EX.2/CAMMINATA LATERALE CON FASCIA (3 PASSI A SX E 3 PASSI A DX" e
    // sotto "RESTANDO BASSA IN POSIZIONE SQUAT = 1 MOVIMENTO)". Prima la
    // seconda riga veniva letta come schema, e lo schema vero si perdeva.
    const ex = giorni()[0].ex[1];
    expect(ex.name).toBe(
      'CAMMINATA LATERALE CON FASCIA (3 PASSI A SX E 3 PASSI A DX RESTANDO BASSA IN POSIZIONE SQUAT = 1 MOVIMENTO)'
    );
    expect(ex.sets).toBe(6);
    expect(ex.reps).toEqual(['10', '10', '10', '10', '10', '10']);
  });

  it('il recupero del singolo esercizio resta scritto', () => {
    expect(giorni()[0].ex[1].note).toBe('REC 50”');
  });

  it('"6X15+12 PAUSA 5”" e\' una serie a cluster', () => {
    const ex = giorni()[1].ex[2];
    expect(ex.name).toBe('SPINTE 90 GLUTEI DA TERRA CON FASCIA');
    expect(ex.sets).toBe(6);
    expect(ex.cluster).toEqual({ blocks: [15, 12], restSec: 5, end: 'fixed' });
    // Il resto della riga e' un'istruzione per chi si allena, non per il parser.
    expect(ex.note).toBe('E RIPARTI CON LO STESSO GLUTEO PER LE 12');
  });

  it('senza una pausa scritta non si inventa un cluster', () => {
    // "4X12+10 REC 1’" puo' essere un doppio carico o uno stripping: dargli
    // una pausa vorrebbe dire far partire un conto che nessuno ha chiesto.
    const ex = giorni()[0].ex[0];
    expect(ex.cluster).toBeUndefined();
    expect(ex.sets).toBe(4);
  });

  it('il lavoro aerobico si conta in minuti, non in serie', () => {
    const ex = giorni()[0].ex[6];
    expect(ex.name).toBe('TAPPETO, CYCLET O ELLITTICA POST WORKOUT');
    expect(ex.sets).toBe(1);
    expect(ex.reps).toEqual(['12/15’']);
    expect(ex.note).toBe('VELOCITÀ 5,5 KM');
  });

  it('due schemi sulla stessa riga restano due blocchi di serie', () => {
    // "5X20+5X15 REC 40”" sul superset dei crunch: cinque da 20 e cinque da 15.
    const ex = giorni()[0].ex[5];
    expect(ex.sets).toBe(10);
    expect(ex.reps).toEqual(['20', '20', '20', '20', '20', '15', '15', '15', '15', '15']);
  });
});
