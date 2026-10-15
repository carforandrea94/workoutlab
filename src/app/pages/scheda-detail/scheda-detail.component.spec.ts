import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedaDetailComponent } from './scheda-detail.component';

/**
 * Copre una regola sola: la scheda si compila solo a sessione avviata.
 *
 * Il componente si costruisce a mano con stub (come protocollo-builder)
 * invece di montarlo: qui interessa la regola, non il rendering. Serve pero'
 * un contesto di iniezione, perche' il costruttore registra un effect().
 */
function makeComponent(opts: { sessionSuQuestoGiorno: boolean; inPausa?: boolean; host?: any; conferma?: boolean }) {
  const startRestTimer = vi.fn();
  const stopRestTimer = vi.fn();
  const patchField = vi.fn(() => Promise.resolve());

  const sessionState = {
    matchesDay: () => opts.sessionSuQuestoGiorno,
    isPaused: () => opts.inPausa ?? false,
    activeSession: () => (opts.sessionSuQuestoGiorno ? { dayId: 'day1' } : null),
    cancel: vi.fn(),
    finish: vi.fn()
  } as any;

  const prossimaSerie = signal<any>(null);
  const state = { viewMode: () => 'list', saveStatus: () => 'idle', startRestTimer, stopRestTimer, prossimaSerie } as any;

  const component = TestBed.runInInjectionContext(() => new SchedaDetailComponent(
    {} as any,                       // ActivatedRoute: ngOnInit non viene chiamato
    {} as any,                       // NavController
    {} as any,                       // WorkoutDataService
    state,
    { patchField } as any,           // AppStateService
    {} as any,                       // WorkoutSessionsService
    { confirm: vi.fn(async () => opts.conferma ?? true) } as any,   // ConfirmDialogService
    { detectChanges: () => {} } as any,
    {} as any,                       // ToastService
    sessionState,
    opts.host ?? null
  ));

  component.day = { id: 'day1', label: 'Petto', rec: '90"', ex: [] } as any;
  return { component, startRestTimer, stopRestTimer, patchField, sessionState, state };
}

function makeVm() {
  return {
    ex: { name: 'Panca piana', muscle: 'Petto', scheme: 'fisso' },
    rows: [{ reps: '', load: '', done: false, ripPlaceholder: '10', loadPlaceholder: '36' }],
    open: true, insightVisible: false, insight: null, restSeconds: 90, isFirst: true, warmup: null
  } as any;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SchedaDetailComponent — scheda bloccata finche\' la sessione non parte', () => {

  it('senza sessione avviata i campi sono bloccati', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: false });
    expect(component.setsLocked).toBe(true);
  });

  it('con la sessione avviata su questo giorno i campi si sbloccano', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    expect(component.setsLocked).toBe(false);
  });

  it('in pausa restano sbloccati: una sessione in pausa e\' comunque avviata', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true, inPausa: true });
    expect(component.setsLocked).toBe(false);
  });

  it('una sessione aperta su un ALTRO giorno non sblocca questo', () => {
    // matchesDay risponde false: quei numeri appartengono all'altro allenamento.
    const { component } = makeComponent({ sessionSuQuestoGiorno: false });
    expect(component.setsLocked).toBe(true);
  });

  it('a scheda bloccata spuntare una serie non fa niente', () => {
    const { component, startRestTimer, patchField } = makeComponent({ sessionSuQuestoGiorno: false });
    const vm = makeVm();

    component.onSetCheck(vm, 0);
    vi.runAllTimers();

    // Ne' la spunta, ne' i valori suggeriti, ne' il recupero, ne' la bozza.
    expect(vm.rows[0].done).toBe(false);
    expect(vm.rows[0].reps).toBe('');
    expect(vm.rows[0].load).toBe('');
    expect(startRestTimer).not.toHaveBeenCalled();
    expect(patchField).not.toHaveBeenCalled();
  });

  it('a scheda sbloccata spuntare una serie funziona come prima', () => {
    const { component, startRestTimer, patchField } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();

    component.onSetCheck(vm, 0);
    vi.runAllTimers();

    expect(vm.rows[0].done).toBe(true);
    // I suggerimenti del protocollo diventano valori veri solo alla spunta.
    expect(vm.rows[0].reps).toBe('10');
    expect(vm.rows[0].load).toBe('36');
    // Nome ed esercizio viaggiano separati: il nome lo mostra la fascia del
    // recupero, il giorno le serve per spegnersi quando si cambia allenamento.
    expect(startRestTimer).toHaveBeenCalledWith(90, 'Panca piana', 'day1');
    expect(patchField).toHaveBeenCalled();
  });
});

/**
 * La pausa dentro una serie a cluster. Il numero scende fino a zero e li' si
 * ferma: che la pausa del coach sia un minimo lo dice la scritta sotto, non un
 * numero che continua a salire mentre si e' sotto il bilanciere.
 */
describe('SchedaDetailComponent — la pausa dentro il cluster', () => {
  function conCluster(restSec: number) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    // Il componente delega la formattazione a WorkoutSessionStateService, che
    // qui e' uno stub: gli si presta la stessa funzione del servizio vero,
    // cosi' il testo controllato e' quello che si legge davvero a schermo.
    (component as any).sessionState.formatDuration = (sec: number) =>
      `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
    const vm = makeVm();
    vm.cluster = { blocks: [8, 8], restSec, end: 'fixed' };
    (component as any).startPause(vm, 0);
    return { component, vm };
  }

  it('parte dal minimo e scende', () => {
    const { component, vm } = conCluster(30);
    expect(component.pauseText(vm)).toBe('0:30');

    vi.advanceTimersByTime(10_000);
    expect(component.pauseText(vm)).toBe('0:20');
  });

  it('arrivata a zero si ferma, e non va sotto', () => {
    const { component, vm } = conCluster(30);

    vi.advanceTimersByTime(30_000);
    expect(component.pauseText(vm)).toBe('0:00');

    // Un minuto dopo e' ancora zero: prima saliva con il "+".
    vi.advanceTimersByTime(60_000);
    expect(component.pauseText(vm)).toBe('0:00');
  });

  /* Il riquadro resta a schermo: la pausa non e' finita, e' passato il minimo. */
  it('a zero la pausa resta aperta e dice che si puo\' ripartire', () => {
    const { component, vm } = conCluster(30);
    vi.advanceTimersByTime(45_000);

    expect(component.isPausing(vm, 0)).toBe(true);
    expect(component.pauseOver(vm)).toBe(true);
  });

  /* Un intervallo che continua a girare per il resto della serie e' solo
     batteria: a zero non c'e' piu' niente da contare. */
  it('a zero il ticker si spegne', () => {
    const { component, vm } = conCluster(30);
    vi.advanceTimersByTime(30_000);
    expect(vi.getTimerCount()).toBe(0);

    // E prima di zero invece gira.
    const secondo = conCluster(30);
    vi.advanceTimersByTime(5_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(secondo.component.pauseText(secondo.vm)).toBe('0:25');
  });

  it('prima di arrivare a zero non dice ancora che e\' passata', () => {
    const { component, vm } = conCluster(30);
    vi.advanceTimersByTime(29_000);
    expect(component.pauseOver(vm)).toBe(false);
    expect(component.pauseText(vm)).toBe('0:01');
  });
});

/**
 * Il massimale stimato dentro la sessione. Il numero da solo non vuol dire
 * niente: queste formule presumono una serie tirata vicino al cedimento, e qui
 * il carico lo prescrive il coach, quindi accanto alla stima ci deve sempre
 * essere la serie da cui viene - e' l'unico modo per capire quanto crederci.
 */
describe('SchedaDetailComponent — il massimale stimato per esercizio', () => {
  /** Una sessione con le serie indicate su "Panca piana". */
  function sessione(date: string, sets: any[]) {
    return { id: date, session: { date, exercises: [{ name: 'Panca piana', sets }] } };
  }

  function insightDopo(sessioni: any[]) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    component.exercises = [vm];
    (component as any).loadInsights(sessioni);
    return vm.insight;
  }

  it('mostra la stima dell\'ultima sessione con la serie da cui viene', () => {
    // 80 x 6 con Brzycki: 80 * 36 / (37 - 6) = 92,9 -> 93 kg.
    const insight = insightDopo([sessione('2026-09-24', [{ load: '80', reps: '6' }])]);
    expect(insight.oneRmText).toContain('<b>93 kg</b>');
    expect(insight.oneRmText).toContain('80 × 6');
    expect(insight.oneRmText).toContain('del 24/09');
  });

  it('prende la serie col massimale piu\' alto, non quella col carico piu\' alto', () => {
    // 90 x 3 fa 95,3; 100 x 1 fa 100 esatti - una singola E' il massimale.
    const insight = insightDopo([sessione('2026-09-24', [
      { load: '90', reps: '3' }, { load: '100', reps: '1' }
    ])]);
    expect(insight.oneRmText).toContain('100 × 1');
    expect(insight.oneRmText).toContain('<b>100 kg</b>');
  });

  it('confronta con la sessione precedente e mostra la differenza', () => {
    const insight = insightDopo([
      sessione('2026-09-17', [{ load: '75', reps: '6' }]),   // 87
      sessione('2026-09-24', [{ load: '80', reps: '6' }])    // 93
    ]);
    expect(insight.oneRmText).toContain('+6 kg');
  });

  it('a parita\' di stima non scrive nessuna differenza', () => {
    const insight = insightDopo([
      sessione('2026-09-17', [{ load: '80', reps: '6' }]),
      sessione('2026-09-24', [{ load: '80', reps: '6' }])
    ]);
    expect(insight.oneRmText).not.toContain('kg ·');
  });

  it('ignora le serie a cluster: il loro carico e\' un intervallo, non un numero', () => {
    // "62,5-55" x "5+5+3" letto come numero darebbe 62 x 5, una serie che non
    // e' mai esistita. Deve contare solo la serie dritta.
    const insight = insightDopo([sessione('2026-09-24', [
      { load: '62,5-55', reps: '5+5+3', blocks: [{ load: '62,5' }, { load: '55' }] },
      { load: '70', reps: '5' }
    ])]);
    expect(insight.oneRmText).toContain('70 × 5');
  });

  it('con sole serie a cluster non stima niente', () => {
    const insight = insightDopo([sessione('2026-09-24', [
      { load: '62,5-55', reps: '5+5+3', blocks: [{ load: '62,5' }, { load: '55' }] }
    ])]);
    expect(insight.oneRmText).toBeNull();
  });

  it('con la stima non ripete l\'ultima sessione: peso e data stanno gia\' li\'', () => {
    // "Ultimo (24/09): 80 kg" e "... 80 x 6 del 24/09" dicono la stessa cosa.
    const insight = insightDopo([sessione('2026-09-24', [{ load: '80', reps: '6' }])]);
    expect(insight.oneRmText).toContain('80 × 6');
    expect(insight.lastText).toBe('');
  });

  it('oltre le dodici ripetizioni non stima, ma l\'ultima sessione si vede ancora', () => {
    const insight = insightDopo([sessione('2026-09-24', [{ load: '40', reps: '20' }])]);
    expect(insight.oneRmText).toBeNull();
    expect(insight.lastText).toBe('Ultimo (24/09): 40 kg');
  });
});

/**
 * La tabella dei carichi per ripetizione, dentro la sessione. Il massimale da
 * solo non dice che peso mettere sul bilanciere oggi: la tabella traduce.
 */
describe('SchedaDetailComponent — la tabella dei massimali per esercizio', () => {
  function conSessione(sets: any[]) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    component.exercises = [vm];
    (component as any).loadInsights([
      { id: 'a', session: { date: '2026-09-24', exercises: [{ name: 'Panca piana', sets }] } }
    ]);
    return { component, vm };
  }

  it('porta il carico per ogni ripetizione da 1 a 15', () => {
    const { vm } = conSessione([{ load: '80', reps: '6' }]);
    expect(vm.insight.rmRows.length).toBe(15);
    expect(vm.insight.rmRows[0].reps).toBe(1);
    expect(vm.insight.rmRows[14].reps).toBe(15);
  });

  it('la riga di una ripetizione coincide col massimale mostrato sopra', () => {
    const { vm } = conSessione([{ load: '80', reps: '6' }]);
    expect(vm.insight.oneRmText).toContain('<b>93 kg</b>');
    expect(vm.insight.rmRows[0].load).toBe(93);
  });

  it('alla riga delle ripetizioni fatte ritrova il peso sollevato', () => {
    // Chi ha appena fatto 80 x 6 deve leggere 80 alla riga "6 rip", altrimenti
    // la tabella lo smentisce con il bilanciere ancora in mano.
    const { vm } = conSessione([{ load: '80', reps: '6' }]);
    expect(vm.insight.rmRows.find((r: any) => r.reps === 6).load).toBe(80);
  });

  it('senza stima non c\'e\' tabella', () => {
    const { vm } = conSessione([{ load: '40', reps: '20' }]);
    expect(vm.insight.oneRmText).toBeNull();
    expect(vm.insight.rmRows).toBeNull();
  });

  it('il menu parte dalle ripetizioni previste oggi', () => {
    // Il protocollo di prova chiede 10 ripetizioni: la domanda che ci si fa
    // per prima ha gia' la risposta, senza toccare niente.
    const { component, vm } = conSessione([{ load: '80', reps: '6' }]);
    expect(vm.rmPick).toBe(10);
    expect(component.rmLoad(vm)).toBe('70');     // 75% di 93
    expect(component.rmRow(vm)!.percent).toBe(75);
  });

  it('cambiando le ripetizioni cambia il peso', () => {
    const { component, vm } = conSessione([{ load: '80', reps: '6' }]);
    vm.rmPick = 1;
    expect(component.rmLoad(vm)).toBe('93');     // la riga "1" E' il massimale
    vm.rmPick = 6;
    expect(component.rmLoad(vm)).toBe('80');     // il peso davvero sollevato
    vm.rmPick = 3;
    expect(component.rmLoad(vm)).toBe('88');
  });

  it('senza stima il menu non ha niente da dire', () => {
    const { component, vm } = conSessione([{ load: '40', reps: '20' }]);
    expect(component.rmRow(vm)).toBeNull();
    expect(component.rmLoad(vm)).toBe('—');
  });
});

/**
 * La stessa schermata, in modalita' storico.
 *
 * Il dettaglio di una seduta salvata non e' piu' una pagina sua: e' questa,
 * con le serie lette dal documento invece che dal protocollo. Quello che segue
 * copre le differenze fra le due modalita', perche' sono le uniche cose che
 * possono rompersi: tutto il resto e' lo stesso codice gia' coperto sopra.
 */
function makeStorico(opts: {
  seduta?: any;
  giorni?: any[];
  esitoMove?: 'ok' | 'collision' | 'error';
  eliminaOk?: boolean;
} = {}) {
  const seduta = opts.seduta === undefined ? {
    dayId: 'day1', dayLabel: 'Petto', date: '2026-10-01', durationSec: 3600,
    exercises: [{ name: 'Panca piana', sets: [
      { load: '80', reps: '10', done: true },
      { load: '85', reps: '8', done: true }
    ] }]
  } : opts.seduta;

  const get = vi.fn(() => Promise.resolve(seduta));
  const moveSession = vi.fn(() => Promise.resolve(opts.esitoMove ?? 'ok'));
  const cancella = vi.fn(() => Promise.resolve(opts.eliminaOk ?? true));
  const sessionId = (dayId: string, data: string) => `${dayId}_${data}`;
  const startRestTimer = vi.fn();
  const navigateBack = vi.fn();
  const navigateForward = vi.fn();
  const confirm = vi.fn(() => Promise.resolve(true));

  const component = TestBed.runInInjectionContext(() => new SchedaDetailComponent(
    // ActivatedRoute: la modalita' viene da data.modo della rotta.
    { snapshot: { data: { modo: 'storico' } }, paramMap: { subscribe: () => null } } as any,
    { navigateBack, navigateForward } as any,
    { days: opts.giorni ?? [], MUSCLES: {} } as any,
    { viewMode: () => 'list', saveStatus: () => 'idle', startRestTimer, prossimaSerie: signal<any>(null) } as any,
    { patchField: vi.fn(() => Promise.resolve()) } as any,
    { get, moveSession, delete: cancella, sessionId } as any,
    { confirm } as any,
    { detectChanges: () => {} } as any,
    { success: vi.fn(), error: vi.fn() } as any,
    { matchesDay: () => true, isPaused: () => false, activeSession: () => ({ dayId: 'day1' }) } as any
  ));

  component.ngOnInit();
  component.sessionKey = 'day1_2026-10-01';
  return { component, get, moveSession, cancella, navigateBack, navigateForward, confirm, startRestTimer };
}

async function apri(opts: Parameters<typeof makeStorico>[0] = {}) {
  const tutto = makeStorico(opts);
  await (tutto.component as any).loadStorico();
  return tutto;
}

describe('SchedaDetailComponent — storico: la seduta salvata nella stessa schermata', () => {
  it('la rotta decide la modalita\'', () => {
    const { component } = makeStorico();
    expect(component.modo).toBe('storico');
    expect(component.isStorico).toBe(true);
  });

  it('le serie arrivano dal documento, non dal protocollo', async () => {
    const { component } = await apri();
    expect(component.exercises.length).toBe(1);
    expect(component.exercises[0].rows.map(r => `${r.reps}x${r.load}`)).toEqual(['10x80', '8x85']);
    expect(component.exercises[0].rows.every(r => r.done)).toBe(true);
  });

  it('le righe partono chiuse: una seduta salvata prima si legge', async () => {
    const { component } = await apri();
    expect(component.exercises[0].activeRow).toBeNull();
    expect(component.rowSummary(component.exercises[0].rows[0])).toBe('10 × 80 kg');
  });

  it('i campi sono sempre aperti: la seduta si corregge senza avviare niente', async () => {
    const { component } = await apri();
    expect(component.setsLocked).toBe(false);
  });

  it('una sessione aperta sullo stesso giorno non trasforma lo storico in allenamento', async () => {
    // matchesDay risponde true: senza la guardia comparirebbero la barra della
    // sessione e la card che chiude e salva, sopra una seduta di settembre.
    const { component } = await apri();
    expect(component.isSessionOnThisDay).toBe(false);
    expect(component.slideCount).toBe(1);
  });

  it('il muscolo e la forma del cluster vengono dal protocollo', async () => {
    const { component } = await apri({ giorni: [{
      id: 'day1', label: 'Petto', rec: '90', ex: [{ name: 'Panca piana', muscle: 'Petto', scheme: 'plain', sets: 2 }]
    }] });
    expect(component.exercises[0].ex.muscle).toBe('Petto');
  });

  it('un esercizio che il protocollo non ha piu\' resta leggibile', async () => {
    const { component } = await apri({ giorni: [] });
    expect(component.exercises[0].ex.name).toBe('Panca piana');
    expect(component.exercises[0].ex.muscle).toBe('');
  });

  it('la seduta che non c\'e\' lo dice, e non e\' un errore di rete', async () => {
    const { component } = await apri({ seduta: null });
    expect(component.notFound).toBe(true);
    expect(component.errorMsg).toBe('');
  });

  it('la durata resta quella misurata allora', async () => {
    const { component } = await apri();
    expect(component.sedutaDurata).toBe(3600);
  });
});

describe('SchedaDetailComponent — storico: le correzioni si salvano da sole', () => {
  it('correggere un carico scrive la seduta mezzo secondo dopo', async () => {
    const { component, moveSession } = await apri();
    component.setLoad(component.exercises[0], 0, 82.5);
    expect(moveSession).not.toHaveBeenCalled();

    vi.runAllTimers();
    await Promise.resolve();

    expect(moveSession).toHaveBeenCalledTimes(1);
    const [seduta, vecchioId, data] = moveSession.mock.calls[0] as any[];
    expect(vecchioId).toBe('day1_2026-10-01');
    expect(data).toBe('2026-10-01');
    expect(seduta.exercises[0].sets[0].load).toBe('82,5');
    // Quello che non si e' toccato resta com'era.
    expect(seduta.exercises[0].sets[1].load).toBe('85');
    expect(seduta.durationSec).toBe(3600);
  });

  it('spuntare una serie nello storico non fa partire nessun recupero', async () => {
    const { component, startRestTimer } = await apri();
    component.onSetCheck(component.exercises[0], 0);
    vi.runAllTimers();
    expect(startRestTimer).not.toHaveBeenCalled();
  });

  it('si puo\' aggiungere la serie dimenticata, e si puo\' togliere', async () => {
    const { component } = await apri();
    const vm = component.exercises[0];

    component.addSet(vm);
    expect(vm.rows.length).toBe(3);
    expect(vm.rows[2].extra).toBe(true);
    // Nasce sul modello dell'ultima: una serie in piu' e' "ancora una come quella".
    expect(vm.rows[2].loadPlaceholder).toBe('85');

    // Le serie salvate invece restano: sono lavoro registrato.
    expect(component.canRemove(vm, 0)).toBe(false);
    expect(component.canRemove(vm, 2)).toBe(true);
  });

  it('cambiare data sposta la seduta, e l\'indirizzo la segue', async () => {
    const { component, moveSession, navigateForward } = await apri();
    component.storicoDate = '2026-10-02';
    component.onDateChange();
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(moveSession).toHaveBeenCalledWith(expect.anything(), 'day1_2026-10-01', '2026-10-02');
    expect(navigateForward).toHaveBeenCalledWith(['/scheda/storico', 'day1_2026-10-02'], { replaceUrl: true });
  });

  it('una data futura non si salva e lo dice', async () => {
    const { component, moveSession } = await apri();
    component.storicoDate = '2099-01-01';
    component.onDateChange();
    vi.runAllTimers();

    expect(moveSession).not.toHaveBeenCalled();
    expect(component.statoSalvataggio).toBe('errore');
    expect(component.testoSalvataggio).toContain('Data non valida');
  });

  it('se nella data nuova c\'e\' gia\' una seduta, il campo torna a dire la verita\'', async () => {
    const { component } = await apri({ esitoMove: 'collision' });
    component.storicoDate = '2026-10-02';
    component.onDateChange();
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.storicoDate).toBe('2026-10-01');
    expect(component.statoSalvataggio).toBe('errore');
  });

  it('un errore di rete non cancella la correzione dallo schermo', async () => {
    const { component } = await apri({ esitoMove: 'error' });
    component.setLoad(component.exercises[0], 0, 82.5);
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.statoSalvataggio).toBe('errore');
    expect(component.exercises[0].rows[0].load).toBe('82,5');
  });

  it('uscendo dalla pagina la correzione in attesa si scrive subito', async () => {
    const { component, moveSession } = await apri();
    component.setLoad(component.exercises[0], 0, 82.5);
    component.ngOnDestroy();

    await Promise.resolve();
    expect(moveSession).toHaveBeenCalledTimes(1);
  });

  it('eliminare la seduta riporta allo storico', async () => {
    const { component, cancella, navigateBack } = await apri();
    await component.deleteSession();
    expect(cancella).toHaveBeenCalledWith('day1_2026-10-01');
    expect(navigateBack).toHaveBeenCalledWith(['/scheda/storico']);
  });

  it('se l\'eliminazione non va, non si va via', async () => {
    const { component, navigateBack } = await apri({ eliminaOk: false });
    await component.deleteSession();
    expect(navigateBack).not.toHaveBeenCalled();
    expect(component.statoSalvataggio).toBe('errore');
  });
});

/**
 * Le serie a cluster di una seduta salvata: i blocchi tornano come sono stati
 * fatti. La forma la detta il protocollo, e quando il protocollo e' cambiato
 * sotto i piedi la si ricava da loro, altrimenti i blocchi resterebbero a
 * schermo senza nessun comando per toccarli.
 */
describe('SchedaDetailComponent — storico: i cluster salvati', () => {
  const SEDUTA_CLUSTER = {
    dayId: 'day1', dayLabel: 'Petto', date: '2026-10-01',
    exercises: [{ name: 'Panca piana', sets: [{
      load: '62,5-55', reps: '5+5+3', done: true,
      blocks: [
        { load: '62,5', reps: '5', done: true },
        { load: '62,5', reps: '5', done: true },
        { load: '55', reps: '3', done: true }
      ]
    }] }]
  };

  it('i blocchi tornano con dentro quello che e\' stato fatto', async () => {
    const { component } = await apri({ seduta: SEDUTA_CLUSTER, giorni: [{
      id: 'day1', label: 'Petto', rec: '90', ex: [{
        name: 'Panca piana', muscle: 'Petto', scheme: 'plain', sets: 1,
        cluster: { blocks: [5, 5, 5], restSec: 20, end: 'fixed' }
      }]
    }] });
    const vm = component.exercises[0];
    expect(component.isCluster(vm, vm.rows[0])).toBe(true);
    expect(vm.rows[0].blocks!.map(b => `${b.reps}x${b.load}`)).toEqual(['5x62,5', '5x62,5', '3x55']);
  });

  it('senza il cluster nel protocollo la forma si ricava dai blocchi salvati', async () => {
    const { component } = await apri({ seduta: SEDUTA_CLUSTER, giorni: [] });
    const vm = component.exercises[0];
    expect(component.isCluster(vm, vm.rows[0])).toBe(true);
    expect(vm.cluster!.blocks).toEqual([5, 5, 3]);
  });

  it('correggere un blocco non fa partire la pausa dentro la serie', async () => {
    const { component } = await apri({ seduta: SEDUTA_CLUSTER, giorni: [] });
    const vm = component.exercises[0];
    component.undoBlock(vm, 0, 2);
    component.doneBlock(vm, 0);
    expect(component.isPausing(vm, 0)).toBe(false);
  });
});

/**
 * La percentuale fissa del programma.
 *
 * Si sceglie una volta in Impostazioni e vale su ogni esercizio: quanto pesa
 * quella percentuale del SUO massimale stimato. Non tocca il campo del peso -
 * li' resta il suggerimento dell'ultima volta - perche' una percentuale sola
 * non puo' sapere cosa chiede il protocollo oggi.
 */
describe('SchedaDetailComponent — la percentuale del massimale', () => {
  function conPercentuale(percentuale: number | null, sets: any[] = [{ load: '85', reps: '6' }]) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    component.exercises = [vm];
    (component as any).percentualeProgramma = percentuale;
    (component as any).loadInsights([
      { id: 'a', session: { date: '2026-10-01', exercises: [{ name: 'Panca piana', sets }] } }
    ]);
    return { component, vm };
  }

  it('prende la percentuale secca del massimale stimato', () => {
    // 85 x 6 -> massimale 98,5. L'80% di 98,5 e' 79 kg.
    const { vm } = conPercentuale(80);
    expect(vm.insight.programLoad).toEqual({ percent: 80, load: 79, reps: 8 });
  });

  it('spenta, non dice niente', () => {
    const { vm } = conPercentuale(null);
    expect(vm.insight.programLoad).toBeNull();
    // Il resto dei consigli resta dov'era.
    expect(vm.insight.rmRows.length).toBe(15);
  });

  it('senza massimale stimato non inventa un peso', () => {
    // Venti ripetizioni: oltre il limite di attendibilita', nessuna stima.
    const { vm } = conPercentuale(80, [{ load: '40', reps: '20' }]);
    expect(vm.insight.programLoad).toBeNull();
  });

  it('non tocca il peso suggerito nel campo', () => {
    // Quello viene dall'ultima volta, e deve restare quello: e' l'unico
    // numero che e' stato davvero sollevato.
    const { vm } = conPercentuale(80);
    expect(vm.rows[0].loadPlaceholder).toBe('85');
  });

  it('avverte quando la percentuale e il piano del giorno non coincidono', () => {
    // Il protocollo di prova chiede 10 ripetizioni; l'80% e' un peso da 8.
    const { component, vm } = conPercentuale(80);
    expect(component.notaScostamento(vm)).toBe(
      'Oggi il piano ne chiede 10: a questo peso ne escono circa 8.'
    );
  });

  it('tace quando vanno d\'accordo', () => {
    // Il 75% E' la riga delle dieci ripetizioni: niente da segnalare.
    const { component, vm } = conPercentuale(75);
    expect(vm.insight.programLoad.reps).toBe(10);
    expect(component.notaScostamento(vm)).toBeNull();
  });

  it('tace per una ripetizione di scarto: e\' dentro l\'errore della stima', () => {
    const { component, vm } = conPercentuale(77.5);
    expect(vm.insight.programLoad.reps).toBe(9);
    expect(component.notaScostamento(vm)).toBeNull();
  });

  it('su un cluster non si pronuncia', () => {
    // "8+8" non e' una serie dritta: nessuna di queste formule la legge, e
    // infatti dalla stima resta fuori.
    const { component, vm } = conPercentuale(80);
    vm.cluster = { blocks: [8, 8], restSec: 20, end: 'fixed' };
    expect(component.notaScostamento(vm)).toBeNull();
  });
});

/**
 * Gli esercizi a cluster non hanno un massimale da cui dedurre il carico.
 *
 * "5 ripetizioni, 30 secondi di pausa, a esaurimento" non e' una serie
 * dritta: fra un blocco e l'altro si riposa, e nessuna delle formule sa
 * leggerlo. Un numero messo li' in mezzo si legge come se invece lo sapesse.
 */
describe('SchedaDetailComponent — niente stime sui cluster', () => {
  function conCluster(sets: any[]) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    vm.cluster = { blocks: [5], restSec: 30, end: 'open' };
    component.exercises = [vm];
    (component as any).percentualeProgramma = 85;
    (component as any).loadInsights([
      { id: 'a', session: { date: '2026-09-21', exercises: [{ name: 'Panca piana', sets }] } }
    ]);
    return { component, vm };
  }

  it('non stima niente, nemmeno quando trova una coppia pulita', () => {
    // E' il caso visto a schermo: un 3 x 5 rimasto in una seduta vecchia
    // diventava "massimale stimato 3,5 kg" sotto un esercizio caricato a 30.
    const { vm } = conCluster([{ load: '3', reps: '5', done: true }]);
    expect(vm.insight.oneRmText).toBeNull();
    expect(vm.insight.rmRows).toBeNull();
    expect(vm.insight.programLoad).toBeNull();
  });

  it('l\'ultima volta resta: quella e\' un fatto', () => {
    const { vm } = conCluster([{ load: '30', reps: '5', done: true }]);
    expect(vm.insight.lastText).toBe('Ultimo (21/09): 30 kg');
  });

  it('su una serie dritta la stima torna', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    component.exercises = [vm];
    (component as any).loadInsights([
      { id: 'a', session: { date: '2026-09-21', exercises: [{ name: 'Panca piana', sets: [{ load: '80', reps: '6' }] }] } }
    ]);
    expect(vm.insight.oneRmText).toContain('93 kg');
  });
});

/**
 * I riassunti non sono numeri. Vale anche quando i blocchi non ci sono -
 * una seduta vecchia, o salvata a meta' - ed e' li' che prima passavano.
 */
describe('SchedaDetailComponent — un riassunto non e\' una misura', () => {
  function senzaBlocchi(sets: any[]) {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const vm = makeVm();
    component.exercises = [vm];
    (component as any).loadInsights([
      { id: 'a', session: { date: '2026-09-21', exercises: [{ name: 'Panca piana', sets }] } }
    ]);
    return vm;
  }

  it('"5+5+3" non vale 5 ripetizioni', () => {
    const vm = senzaBlocchi([{ load: '30', reps: '5+5+3', done: true }]);
    expect(vm.insight.oneRmText).toBeNull();
  });

  it('"62,5-55" non vale 62,5 kg', () => {
    const vm = senzaBlocchi([{ load: '62,5-55', reps: '5', done: true }]);
    expect(vm.insight.oneRmText).toBeNull();
  });

  it('una serie dritta nella stessa seduta si legge lo stesso', () => {
    const vm = senzaBlocchi([
      { load: '62,5-55', reps: '5+5+3', done: true },
      { load: '70', reps: '5', done: true }
    ]);
    expect(vm.insight.oneRmText).toContain('70 × 5');
  });
});

/**
 * Finito l'ultimo set di un esercizio la pagina porta da sola al successivo, o
 * alla chiusura dopo l'ultimo: in piedi, con le mani sporche, scorrere a mano
 * per trovare la serie dopo era la parte piu' lenta dell'allenamento.
 */
describe('SchedaDetailComponent — dopo l\'ultima serie di un esercizio', () => {
  const riga = (done = false) => ({ reps: '', load: '', done, ripPlaceholder: '10', loadPlaceholder: '' }) as any;
  const esercizio = (nome: string, righe: any[]) => ({
    ex: { name: nome, muscle: '', scheme: 'plain' }, rows: righe, open: true, activeRow: 0,
    insightVisible: false, insight: null, restSeconds: 90, isFirst: false, warmup: null, cluster: null, rmPick: 1
  }) as any;

  function conEsercizi(righePerEsercizio: number[], opts: { host?: any } = {}) {
    const m = makeComponent({ sessionSuQuestoGiorno: true, host: opts.host });
    const vms = righePerEsercizio.map((n, i) => esercizio(`Es ${i + 1}`, Array.from({ length: n }, () => riga())));
    m.component.exercises = vms;
    const vai = vi.spyOn(m.component, 'vaAllaSlide').mockImplementation(() => {});
    return { ...m, vms, vai };
  }

  it('segnata l\'ultima serie, dopo un respiro va al prossimo esercizio', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);

    component.confirmSet(vms[0], 0);
    vi.advanceTimersByTime(100);
    expect(vai).not.toHaveBeenCalled(); // prima si vede la spunta, l'anello che si chiude

    vi.advanceTimersByTime(400);
    expect(vai).toHaveBeenCalledWith(1);
  });

  it('con ancora serie da fare non si muove', () => {
    const { component, vms, vai } = conEsercizi([2, 1]);

    component.confirmSet(vms[0], 0);
    vi.advanceTimersByTime(2000);

    expect(vai).not.toHaveBeenCalled();
  });

  it('dopo l\'ultimo esercizio porta alla chiusura: l\'indice e\' quello oltre l\'ultimo', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);

    component.confirmSet(vms[1], 0);
    vi.advanceTimersByTime(500);

    expect(vai).toHaveBeenCalledWith(2);
  });

  it('se si toglie la spunta nel frattempo resta dov\'e\'', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);

    component.confirmSet(vms[0], 0);
    vi.advanceTimersByTime(200);
    component.undoSet(vms[0], 0);
    vi.advanceTimersByTime(2000);

    expect(vai).not.toHaveBeenCalled();
  });

  it('lasciare la pagina annulla lo spostamento in attesa', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);

    component.confirmSet(vms[0], 0);
    component.ngOnDestroy();
    vi.advanceTimersByTime(2000);

    expect(vai).not.toHaveBeenCalled();
  });

  it('nello storico (si corregge una seduta passata) non porta da nessuna parte', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);
    component.modo = 'storico';

    component.confirmSet(vms[0], 0);
    vi.advanceTimersByTime(2000);

    expect(vai).not.toHaveBeenCalled();
  });

  it('una serie a cluster chiusa vale come serie fatta: anche lei porta avanti', () => {
    const { component, vms, vai } = conEsercizi([1, 1]);
    vms[0].cluster = { blocks: [5], restSec: 30, end: 'open' };
    vms[0].rows[0].blocks = [{ reps: '5', load: '60', done: true, ripPlaceholder: '', loadPlaceholder: '' }];

    component.closeClusterSet(vms[0], 0);
    vi.advanceTimersByTime(500);

    expect(vai).toHaveBeenCalledWith(1);
  });
});

describe('SchedaDetailComponent — portare in vista l\'esercizio dopo', () => {
  const elemento = () => ({ scrollIntoView: vi.fn() });

  function conHost(viewMode: 'list' | 'slider') {
    const esercizi = [elemento(), elemento()];
    const chiusura = elemento();
    const host = {
      nativeElement: {
        querySelectorAll: (sel: string) => (sel === '.exlist > .ex' ? esercizi : []),
        querySelector: (sel: string) => (sel === '.closing' ? chiusura : null)
      }
    };
    const m = makeComponent({ sessionSuQuestoGiorno: true, host });
    m.component.exercises = [{}, {}] as any;
    (m.component as any).state.viewMode = () => viewMode;
    return { ...m, esercizi, chiusura };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('nell\'elenco scorre fino alla card dell\'esercizio, in modo morbido', () => {
    const { component, esercizi } = conHost('list');

    component.vaAllaSlide(1);

    expect(esercizi[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(esercizi[0].scrollIntoView).not.toHaveBeenCalled();
  });

  it('oltre l\'ultimo esercizio scorre fino alla chiusura', () => {
    const { component, chiusura } = conHost('list');

    component.vaAllaSlide(2);

    expect(chiusura.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('con "riduci movimento" attivo salta senza scorrere piano', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { component, esercizi } = conHost('list');

    component.vaAllaSlide(1);

    expect(esercizi[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('nello slider passa per lo scorrimento dello slider', () => {
    const { component } = conHost('slider');
    const slide = vi.spyOn(component, 'scrollToIndex').mockImplementation(() => {});

    component.vaAllaSlide(1);

    expect(slide).toHaveBeenCalledWith(1);
  });

  it('senza un host (spec costruiti a mano) non fa niente e non si rompe', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    component.exercises = [{}] as any;
    expect(() => component.vaAllaSlide(1)).not.toThrow();
  });
});

describe('SchedaDetailComponent — una serie confermata si sente', () => {
  const riga = () => ({ reps: '', load: '', done: false, ripPlaceholder: '10', loadPlaceholder: '' }) as any;
  const vm = () => ({
    ex: { name: 'Panca', muscle: '', scheme: 'plain' }, rows: [riga()], open: true, activeRow: 0,
    insightVisible: false, insight: null, restSeconds: 90, isFirst: false, warmup: null, cluster: null, rmPick: 1
  }) as any;
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  });
  afterEach(() => { delete (navigator as any).vibrate; });

  it('segnare la serie fa il tocco breve', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    component.onSetCheck(vm(), 0);
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it('togliere la spunta no: non e\' una conferma', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    const v = vm();
    component.onSetCheck(v, 0);
    vibrate.mockClear();

    component.onSetCheck(v, 0);

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('a scheda bloccata (sessione non avviata) non registra niente e non vibra', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: false });
    component.onSetCheck(vm(), 0);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('nello storico (correzione) non vibra', () => {
    const { component } = makeComponent({ sessionSuQuestoGiorno: true });
    component.modo = 'storico';
    component.onSetCheck(vm(), 0);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('SchedaDetailComponent — il recupero non sopravvive alla sessione', () => {
  it('buttando via la sessione si spegne anche il recupero, o il "Vai" riapparirebbe alla prossima', async () => {
    const { component, stopRestTimer, sessionState } = makeComponent({ sessionSuQuestoGiorno: true, conferma: true });
    component.exercises = [];

    await component.cancelSession();

    expect(sessionState.cancel).toHaveBeenCalled();
    expect(stopRestTimer).toHaveBeenCalled();
  });

  it('se non si conferma non si tocca niente', async () => {
    const { component, stopRestTimer, sessionState } = makeComponent({ sessionSuQuestoGiorno: true, conferma: false });

    await component.cancelSession();

    expect(sessionState.cancel).not.toHaveBeenCalled();
    expect(stopRestTimer).not.toHaveBeenCalled();
  });
});

/**
 * A riposo la fascia in fondo dice quale serie viene dopo. La pagina del giorno
 * la pubblica nello stato condiviso a ogni modifica alle serie: la fascia vive
 * fuori da questa pagina e non ha altro modo di saperlo.
 */
describe('SchedaDetailComponent — la prossima serie, per la fascia in fondo', () => {
  const riga = (parti: object = {}) =>
    ({ reps: '', load: '', done: false, ripPlaceholder: '10', loadPlaceholder: '55', extra: false, ...parti }) as any;
  const esercizio = (nome: string, righe: any[], cluster: any = null) =>
    ({ ex: { name: nome, muscle: '', scheme: 'plain' }, rows: righe, open: true, activeRow: 0,
       insightVisible: false, insight: null, restSeconds: 90, isFirst: false, warmup: null, cluster, rmPick: 1 }) as any;

  function conEsercizi(opts: { sessione?: boolean } = {}) {
    const m = makeComponent({ sessionSuQuestoGiorno: opts.sessione ?? true });
    const panca = esercizio('Panca piana', [riga(), riga(), riga()]);
    const croci = esercizio('Croci', [riga({ ripPlaceholder: '12', loadPlaceholder: '20' }), riga({ ripPlaceholder: '12', loadPlaceholder: '20' })]);
    m.component.exercises = [panca, croci];
    return { ...m, panca, croci, serie: () => m.state.prossimaSerie() };
  }

  it('prima di toccare niente non pubblica: si pubblica quando le serie cambiano', () => {
    const { serie } = conEsercizi();
    expect(serie()).toBeNull();
  });

  it('segnata una serie, la prossima e\' quella dopo, coi valori previsti', () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    expect(serie()).toEqual({ esercizio: 'Panca piana', numero: 2, totale: 3, reps: 10, carico: 55, cluster: false });
  });

  it('i valori sono quelli scelti sulla ruota, non solo il suggerito', () => {
    const { component, panca, serie } = conEsercizi();
    panca.rows[1].reps = '8';
    panca.rows[1].load = '57,5';
    component.onSetCheck(panca, 0);
    expect(serie()).toEqual(expect.objectContaining({ numero: 2, reps: 8, carico: 57.5 }));
  });

  it('finite le serie di un esercizio passa al successivo', () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    component.onSetCheck(panca, 1);
    component.onSetCheck(panca, 2);
    expect(serie()).toEqual({ esercizio: 'Croci', numero: 1, totale: 2, reps: 12, carico: 20, cluster: false });
  });

  it('si parte da dove si e\' lavorato, non dal primo esercizio che ha ancora serie', () => {
    // Si fa prima il secondo esercizio: la fascia non deve rimandare al primo.
    const { component, croci, serie } = conEsercizi();
    component.onSetCheck(croci, 0);
    expect(serie()).toEqual(expect.objectContaining({ esercizio: 'Croci', numero: 2 }));
  });

  it('finito l\'ultimo esercizio torna a quelli rimasti indietro', () => {
    const { component, panca, croci, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    component.onSetCheck(croci, 0);
    component.onSetCheck(croci, 1);
    expect(serie()).toEqual(expect.objectContaining({ esercizio: 'Panca piana', numero: 2 }));
  });

  it('a tutto fatto non c\'e\' piu\' una prossima serie', () => {
    const { component, panca, croci, serie } = conEsercizi();
    for (const j of [0, 1, 2]) component.onSetCheck(panca, j);
    for (const j of [0, 1]) component.onSetCheck(croci, j);
    expect(serie()).toBeNull();
  });

  it('togliendo una spunta la serie torna ad essere la prossima', () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    component.onSetCheck(panca, 1);
    expect(serie()).toEqual(expect.objectContaining({ numero: 3 }));
    component.onSetCheck(panca, 1);
    expect(serie()).toEqual(expect.objectContaining({ numero: 2 }));
  });

  it('una serie a cluster non porta valori: ogni blocco ha i suoi', () => {
    const m = makeComponent({ sessionSuQuestoGiorno: true });
    const squat = esercizio('Squat', [
      riga({ blocks: [{ reps: '5', load: '100', done: true, ripPlaceholder: '', loadPlaceholder: '' }] }), riga()
    ], { blocks: [5, 5], restSec: 30, end: 'fixed' });
    m.component.exercises = [squat];
    m.component.closeClusterSet(squat, 0);
    expect(m.state.prossimaSerie()).toEqual({
      esercizio: 'Squat', numero: 2, totale: 2, reps: 10, carico: 55, cluster: true
    });
  });

  it('a sessione non avviata su questo giorno non pubblica niente', () => {
    const { component, panca, serie } = conEsercizi({ sessione: false });
    component.setLoad(panca, 0, 60); // setsLocked: nessun effetto
    component.onSetCheck(panca, 0);
    expect(serie()).toBeNull();
  });

  it('uscendo dalla pagina la fascia non resta con una serie che non e\' piu\' sotto gli occhi', () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    expect(serie()).not.toBeNull();
    component.ngOnDestroy();
    expect(serie()).toBeNull();
  });

  it('buttare via la sessione la toglie', async () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    await component.cancelSession();
    expect(serie()).toBeNull();
  });

  it('modificare il carico di una serie ancora da fare aggiorna il valore detto', () => {
    const { component, panca, serie } = conEsercizi();
    component.onSetCheck(panca, 0);
    component.setLoad(panca, 1, 60);
    expect(serie()).toEqual(expect.objectContaining({ numero: 2, carico: 60 }));
  });
});
