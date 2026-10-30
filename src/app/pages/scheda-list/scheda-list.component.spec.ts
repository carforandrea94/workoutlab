import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { SchedaListComponent } from './scheda-list.component';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService } from '../../services/app-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';

/**
 * La scheda non lega i giorni ai giorni della settimana: "oggi" non esiste, esiste
 * "il prossimo". L'elenco lo dice con il numero pieno sul primo giorno non ancora
 * fatto questa settimana, e con "In corso" sul giorno della sessione.
 */
describe('SchedaListComponent — da dove si parte', () => {
  const giorni = [
    { id: 'd1', label: 'Petto e tricipiti', rec: '90"', ex: [{}, {}] },
    { id: 'd2', label: 'Schiena e bicipiti', rec: '90"', ex: [{}] },
    { id: 'd3', label: 'Gambe', rec: '120"', ex: [{}, {}, {}] }
  ];

  function monta(opzioni: { fatti?: string[]; sessioneSu?: string | null; bozze?: string[]; giorni?: any[]; settimane?: any[] } = {}) {
    const fatti = new Set(opzioni.fatti ?? []);
    const attiva = signal<any>(opzioni.sessioneSu ? { dayId: opzioni.sessioneSu } : null);
    TestBed.configureTestingModule({
      imports: [SchedaListComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutDataService, useValue: { days: opzioni.giorni ?? giorni, WEEK_PLAN: opzioni.settimane ?? [{ sets: 4, reps: 10 }], hasCustomProtocol: false, protocolName: '' } },
        { provide: WorkoutStateService, useValue: { currentWeek: 1 } },
        { provide: AppStateService, useValue: { load: async () => ({ workoutDrafts: Object.fromEntries((opzioni.bozze ?? []).map(d => [d, {}])) }) } },
        { provide: WeeklyProgressService, useValue: { refresh: vi.fn(), isDone: (id: string) => fatti.has(id), sedute: () => [] } },
        { provide: WorkoutSessionStateService, useValue: { activeSession: attiva, isActiveForDay: (id: string) => attiva()?.dayId === id } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaListComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.scheda-giorni ion-item'));
    const badgePieni = () => righe().map(r => r.querySelector('ion-avatar.giorno-num')!.classList.contains('prossimo'));
    const tag = (i: number) => Array.from(righe()[i].querySelectorAll('ion-badge.stato')).map(t => t.textContent!.trim());
    return { fixture, root, righe, badgePieni, tag };
  }

  it('a inizio settimana il primo giorno e\' il prossimo: numero pieno e la parola', () => {
    const { badgePieni, tag } = monta();
    expect(badgePieni()).toEqual([true, false, false]);
    expect(tag(0)).toEqual(['Prossimo']);
    expect(tag(1)).toEqual([]);
  });

  it('la spunta del giorno fatto si legge: e\' un\'immagine col suo nome, non uno span muto', () => {
    const { righe } = monta({ fatti: ['d1'] });
    const spunta = righe()[0].querySelector('.giorno-fatto')!;
    expect(spunta.getAttribute('role')).toBe('img');
    expect(spunta.getAttribute('aria-label')).toBe('Allenamento già fatto questa settimana');
    expect(righe()[1].querySelector('.giorno-fatto')).toBeNull();
  });

  it('i giorni gia\' fatti non sono il prossimo: tocca il primo che manca', () => {
    const { badgePieni, tag } = monta({ fatti: ['d1'] });
    expect(badgePieni()).toEqual([false, true, false]);
    expect(tag(1)).toEqual(['Prossimo']);
    expect(tag(0)).toEqual([]);
  });

  it('salta anche un giorno non fatto in mezzo: conta l\'ordine del protocollo, non quello in cui si e\' allenato', () => {
    const { badgePieni } = monta({ fatti: ['d1', 'd3'] });
    expect(badgePieni()).toEqual([false, true, false]);
  });

  it('con tutti i giorni fatti non c\'e\' nessun prossimo', () => {
    const { badgePieni, tag } = monta({ fatti: ['d1', 'd2', 'd3'] });
    expect(badgePieni()).toEqual([false, false, false]);
    expect([0, 1, 2].flatMap(tag)).toEqual([]);
  });

  it('con una sessione in corso il segno e\' suo, e il prossimo sparisce: un solo giorno pieno', () => {
    const { badgePieni, tag } = monta({ sessioneSu: 'd2' });
    expect(badgePieni()).toEqual([false, true, false]);
    expect(tag(1)).toEqual(['In corso']);
    expect(tag(0)).toEqual([]);
  });

  it('una bozza si vede anche sul giorno che tocca', async () => {
    const { tag, fixture } = monta({ bozze: ['d1'] });
    // le bozze arrivano dall'account, dopo il primo disegno
    await vi.waitFor(() => expect(fixture.componentInstance.hasDraft('d1')).toBe(true));
    fixture.detectChanges();
    expect(tag(0)).toEqual(['Prossimo', 'Bozza']);
  });
});

/**
 * La riga sotto il nome della scheda diceva sempre "WAVE LOADING — S8", anche con
 * un protocollo a serie fisse, e ripeteva la settimana gia' scritta sopra.
 */
describe('SchedaListComponent — la testata della settimana', () => {
  const conScheme = (...schemi: string[]) => [
    { id: 'd1', label: 'Petto', rec: '90"', ex: schemi.map(scheme => ({ scheme })) }
  ];
  const pulisci = (el: Element | null) => el?.textContent!.replace(/\s+/g, ' ').trim() ?? null;
  const testata = (root: HTMLElement) => ({
    // La riga della settimana del programma; sotto c'e' quella delle settimane di fila.
    label: pulisci(root.querySelector('ion-list.scheda-settimana ion-item:not(.costanza) ion-label h2')),
    sub: pulisci(root.querySelector('ion-list.scheda-settimana ion-item:not(.costanza) ion-label p')) ?? '',
    giorno: pulisci(root.querySelector('ion-list.scheda-settimana ion-item:not(.costanza) ion-note')),
    barra: root.querySelector<HTMLElement & { value?: number }>('ion-list.scheda-settimana ion-progress-bar')
  });

  function monta(giorni: any[], settimane: any[] = [{ sets: 3, reps: 10 }], settimana = 1) {
    TestBed.configureTestingModule({
      imports: [SchedaListComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutDataService, useValue: { days: giorni, WEEK_PLAN: settimane, hasCustomProtocol: false, protocolName: '' } },
        { provide: WorkoutStateService, useValue: { currentWeek: settimana } },
        { provide: AppStateService, useValue: { load: async () => ({ workoutDrafts: {} }) } },
        { provide: WeeklyProgressService, useValue: { refresh: vi.fn(), isDone: () => false, sedute: () => [] } },
        { provide: WorkoutSessionStateService, useValue: { activeSession: signal<any>(null), isActiveForDay: () => false } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaListComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('il metodo c\'e\' solo se il protocollo ha esercizi a onda', () => {
    expect(testata(monta(conScheme('wave', 'plain'))).sub).toMatch(/ · Wave loading$/);
  });

  it('con serie fisse la riga dice solo lo schema, senza inventare un metodo', () => {
    const { sub } = testata(monta(conScheme('plain', 'plain')));
    expect(sub).toBe('3×10 rip.');
    expect(sub).not.toMatch(/wave/i);
  });

  it('non ripete la settimana, che sta gia\' sopra', () => {
    const { sub } = testata(monta(conScheme('wave')));
    expect(sub).not.toMatch(/\bS1\b/);
  });

  it('le ripetizioni si chiamano "rip.", come nel resto dell\'app', () => {
    const { label, sub } = testata(monta(conScheme('wave'), [{ sets: 3, reps: 10 }]));
    expect(label).toBe('Settimana 1 di 1');
    expect(sub).toBe('3×10 rip. · Wave loading');
    expect(sub).not.toMatch(/reps/);
  });

  it('il giorno della settimana sta a destra, come una nota di riga iOS', () => {
    const giorno = new Date().toLocaleDateString('it-IT', { weekday: 'long' });
    expect(testata(monta(conScheme('plain'))).giorno).toBe(giorno.charAt(0).toUpperCase() + giorno.slice(1));
  });

  it('la barra dice quanto del programma e\' passato, e lo dice anche a parole', () => {
    const settimane = Array.from({ length: 8 }, () => ({ sets: 4, reps: 10 }));
    const { barra, label } = testata(monta(conScheme('plain'), settimane, 7));
    expect(label).toBe('Settimana 7 di 8');
    expect(barra?.value).toBe(7 / 8);
    expect(barra?.getAttribute('aria-label')).toBe('Settimane del programma');
    expect(barra?.getAttribute('aria-valuetext')).toBe('Settimana 7 di 8');
  });

  it('una settimana oltre il piano non sfora la barra, e senza schema la riga sotto non c\'e\'', () => {
    const { barra, sub } = testata(monta(conScheme('plain'), [{ sets: 3, reps: 10 }], 3));
    expect(barra?.value).toBe(1);
    expect(sub).toBe('');
  });
});

/**
 * Le settimane di fila: sotto la settimana del programma, quante settimane con
 * la scheda completa e cosa manca per la prossima. Mai cosa si e' perso.
 */
describe('SchedaListComponent — le settimane di fila', () => {
  const giorni = [
    { id: 'd1', label: 'Petto', rec: '90"', ex: [{}] },
    { id: 'd2', label: 'Schiena', rec: '90"', ex: [{}] },
    { id: 'd3', label: 'Gambe', rec: '90"', ex: [{}] }
  ];
  const seduta = (dayId: string, date: string) => ({ dayId, date });
  const completa = (lun: string, mer: string, ven: string) => [seduta('d1', lun), seduta('d2', mer), seduta('d3', ven)];

  afterEach(() => vi.useRealTimers());

  function monta(oggi: string, sedute: { dayId: string; date: string }[], days = giorni, programma?: { inizio: string; settimane: number }) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(oggi + 'T10:00:00'));
    TestBed.configureTestingModule({
      imports: [SchedaListComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutDataService, useValue: {
          days, hasCustomProtocol: false, protocolName: '',
          WEEK_PLAN: Array.from({ length: programma?.settimane ?? 1 }, () => ({ sets: 3, reps: 10 })),
          DEFAULT_PROGRAM_START: programma?.inizio
        } },
        { provide: WorkoutStateService, useValue: { currentWeek: 1 } },
        { provide: AppStateService, useValue: { load: async () => ({ workoutDrafts: {} }) } },
        { provide: WeeklyProgressService, useValue: { refresh: vi.fn(), isDone: () => false, sedute: () => sedute } },
        { provide: WorkoutSessionStateService, useValue: { activeSession: signal<any>(null), isActiveForDay: () => false } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaListComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const riga = root.querySelector<HTMLElement>('ion-list.scheda-settimana ion-item.costanza');
    const testo = (sel: string) => riga?.querySelector(sel)?.textContent!.replace(/\s+/g, ' ').trim() ?? null;
    const pallini = () => Array.from(riga?.querySelectorAll<HTMLElement>('.settimane .settimana') ?? [])
      .map(p => p.classList.contains('completa') ? 'piena' : p.classList.contains('in-corso') ? 'anello' : p.classList.contains('futura') ? 'futura' : 'spenta');
    // Quanto di ogni casella e' riempito (--pieno), arrotondato al centesimo.
    const pieni = () => Array.from(riga?.querySelectorAll<HTMLElement>('.settimane .settimana') ?? [])
      .map(p => Math.round(parseFloat(p.style.getPropertyValue('--pieno')) * 100) / 100);
    return { root, riga, titolo: testo('h2'), frase: testo('p'), pallini, pieni, striscia: riga?.querySelector<HTMLElement>('.settimane') ?? null };
  }

  it('settimane complete di fila, e cosa manca per la prossima', () => {
    // Mercoledi' 21 ottobre: la settimana del 19 e' aperta, con un giorno fatto.
    const { titolo, frase, pallini, striscia } = monta('2026-10-21', [
      ...completa('2026-10-05', '2026-10-07', '2026-10-09'),
      ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
      seduta('d1', '2026-10-19')
    ]);
    expect(titolo).toBe('2 settimane di fila');
    expect(frase).toBe('Ancora 2 allenamenti');
    expect(pallini()).toEqual(['piena', 'piena', 'anello']);
    expect(striscia!.getAttribute('role')).toBe('img');
    expect(striscia!.getAttribute('aria-label')).toBe('Costanza: 2 su 3 settimane complete, questa settimana 1 su 3 allenamenti');
  });

  it('con un allenamento solo da fare, il singolare', () => {
    const { frase } = monta('2026-10-21', [
      ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
      seduta('d1', '2026-10-19'), seduta('d2', '2026-10-20')
    ]);
    expect(frase).toBe('Ancora 1 allenamento');
  });

  it('la conta degli allenamenti fatti non si ripete: c\'e\' gia\' nei pallini', () => {
    const { riga, frase } = monta('2026-10-21', [
      ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
      seduta('d1', '2026-10-19')
    ]);
    expect(frase).not.toMatch(/\d di \d|entro domenica/);
    expect(riga!.textContent).not.toMatch(/\d di \d|entro domenica/);
  });

  it('la settimana completata entra nel conto, il suo pallino si riempie e non c\'e\' altro da dire', () => {
    const { riga, titolo, frase, pallini } = monta('2026-10-23', [
      ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
      ...completa('2026-10-19', '2026-10-21', '2026-10-23')
    ]);
    expect(titolo).toBe('2 settimane di fila');
    expect(frase).toBeNull();
    expect(riga!.querySelector('p')).toBeNull();
    expect(pallini()).toEqual(['piena', 'piena']);
  });

  it('una settimana completa sola si dice al singolare', () => {
    const { titolo, frase } = monta('2026-10-23', completa('2026-10-19', '2026-10-21', '2026-10-23'));
    expect(titolo).toBe('1 settimana completa');
    expect(frase).toBeNull();
  });

  it('dopo una settimana saltata non si dice cosa si e\' perso: si riparte da questa, solo con i pallini', () => {
    const { riga, titolo, frase, pallini } = monta('2026-10-20', [
      ...completa('2026-09-28', '2026-09-30', '2026-10-02'),
      seduta('d1', '2026-10-05')
    ]);
    expect(titolo).toBe('Costanza');
    expect(frase).toBeNull();
    expect(riga!.textContent).not.toMatch(/pers|salt|spezz/);
    expect(pallini()).toEqual(['piena', 'spenta', 'spenta', 'anello']);
  });

  it('quando non c\'e\' piu\' tempo per completarla, niente conti: resta la fila', () => {
    // Sabato, con un giorno fatto su quattro: ne mancano tre e restano due giorni.
    const quattro = [...giorni, { id: 'd4', label: 'Spalle', rec: '90"', ex: [{}] }];
    const { titolo, frase } = monta('2026-10-24', [
      seduta('d1', '2026-10-12'), seduta('d2', '2026-10-13'), seduta('d3', '2026-10-14'), seduta('d4', '2026-10-15'),
      seduta('d1', '2026-10-20')
    ], quattro);
    expect(titolo).toBe('1 settimana completa');
    expect(frase).toBeNull();
  });

  describe('nel programma attuale', () => {
    it('un programma nuovo non eredita le settimane del vecchio: una casella in corso e le altre da venire', () => {
      // Programma iniziato mercoledi' 28 (la sua settimana parte lunedi' 26): il primo
      // giorno fatto lunedi'. Le settimane del programma vecchio, con gli stessi
      // giorni, erano complete: non devono comparire.
      const { riga, titolo, frase, pallini, pieni, striscia } = monta('2026-10-28', [
        ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
        ...completa('2026-10-19', '2026-10-21', '2026-10-23'),
        seduta('d1', '2026-10-26')
      ], giorni, { inizio: '2026-10-28', settimane: 4 });
      expect(riga).not.toBeNull();
      expect(titolo).toBe('Costanza');
      expect(frase).toBeNull();
      expect(pallini()).toEqual(['anello', 'futura', 'futura', 'futura']);
      expect(pieni()).toEqual([0.33, 0, 0, 0]);
      expect(striscia!.getAttribute('aria-label')).toBe('Costanza: 0 su 4 settimane complete, questa settimana 1 su 3 allenamenti');
    });

    it('le settimane passate: piena se completa, riempita in proporzione se no, spenta se vuota', () => {
      // Lunedi' 9 novembre, terza settimana: la prima completa, la seconda a due giorni su tre.
      const { titolo, frase, pallini, pieni } = monta('2026-11-09', [
        ...completa('2026-10-26', '2026-10-28', '2026-10-30'),
        seduta('d1', '2026-11-02'), seduta('d2', '2026-11-04')
      ], giorni, { inizio: '2026-10-26', settimane: 5 });
      expect(pallini()).toEqual(['piena', 'spenta', 'anello', 'futura', 'futura']);
      expect(pieni()).toEqual([1, 0.67, 0, 0, 0]);
      // La seconda non e' completa e la fila riparte: niente da dire.
      expect(titolo).toBe('Costanza');
      expect(frase).toBeNull();
    });

    it('con la fila: il titolo la dice e la frase dice cosa manca', () => {
      const { titolo, frase, pallini } = monta('2026-11-04', [
        ...completa('2026-10-26', '2026-10-28', '2026-10-30'),
        seduta('d1', '2026-11-02')
      ], giorni, { inizio: '2026-10-26', settimane: 4 });
      expect(titolo).toBe('1 settimana completa');
      expect(frase).toBe('Ancora 2 allenamenti');
      expect(pallini()).toEqual(['piena', 'anello', 'futura', 'futura']);
    });

    it('una casella non si riempie oltre il pieno, nemmeno con un giorno che il programma non ha piu\'', () => {
      // Quattro giorni diversi in una settimana da tre: completa, e piena e basta.
      const { pallini, pieni } = monta('2026-10-30', [
        ...completa('2026-10-26', '2026-10-27', '2026-10-28'), seduta('d9', '2026-10-29')
      ], giorni, { inizio: '2026-10-26', settimane: 2 });
      expect(pallini()).toEqual(['piena', 'futura']);
      expect(pieni()[0]).toBe(1);
    });

    it('le caselle sono torte sul fondo spento, l\'anello e\' vuoto e le settimane da venire solo contorno (CSS)', async () => {
      const nome = 'node:fs';
      const fs = await import(/* @vite-ignore */ nome);
      const css: string = fs.readFileSync('src/styles.css', 'utf8');
      expect(css).toContain('.liste-ios ion-item.costanza .settimana{width:10px;height:10px;border-radius:50%;flex:none;background:conic-gradient(var(--accent) calc(var(--pieno,0) * 1turn), var(--restbar-off) 0);}');
      expect(css).toContain('.liste-ios ion-item.costanza .settimana.in-corso:not(.completa){background:conic-gradient(var(--accent) calc(var(--pieno,0) * 1turn), transparent 0);box-shadow:inset 0 0 0 1.5px var(--accent);}');
      expect(css).toContain('.liste-ios ion-item.costanza .settimana.futura{background:transparent;box-shadow:inset 0 0 0 1.5px var(--restbar-off);}');
    });

    it('la riga c\'e\' dal primo giorno, anche senza nessuna seduta', () => {
      const { riga, pallini, pieni } = monta('2026-10-26', [], giorni, { inizio: '2026-10-26', settimane: 3 });
      expect(riga).not.toBeNull();
      expect(pallini()).toEqual(['anello', 'futura', 'futura']);
      expect(pieni()).toEqual([0, 0, 0]);
    });
  });

  it('se il tempo basta giusto, la frase c\'e\': domenica, con un allenamento ancora da fare', () => {
    const { frase } = monta('2026-10-25', [
      ...completa('2026-10-12', '2026-10-14', '2026-10-16'),
      seduta('d1', '2026-10-19'), seduta('d2', '2026-10-21')
    ]);
    expect(frase).toBe('Ancora 1 allenamento');
  });

  it('senza una fila ma con due settimane da mostrare, la riga c\'e\' coi suoi pallini', () => {
    const { riga, titolo, frase, pallini } = monta('2026-10-21', [seduta('d1', '2026-10-13'), seduta('d1', '2026-10-19')]);
    expect(riga).not.toBeNull();
    expect(titolo).toBe('Costanza');
    expect(frase).toBeNull();
    expect(pallini()).toEqual(['spenta', 'anello']);
  });

  it('chi non ha ancora una fila e ha una settimana sola non vede la riga: sarebbe solo un titolo', () => {
    expect(monta('2026-10-21', []).riga).toBeNull();
    TestBed.resetTestingModule();
    expect(monta('2026-10-21', [seduta('d1', '2026-10-19')]).riga).toBeNull();
  });

  it('senza la riga, la settimana del programma non ha separatore sotto', () => {
    const { root } = monta('2026-10-21', []);
    const prima = root.querySelector('ion-list.scheda-settimana ion-item')!;
    expect((prima as HTMLElement & { lines?: string }).lines).toBe('none');
  });

  it('con la riga sotto, la settimana del programma ha il suo separatore', () => {
    const { root } = monta('2026-10-21', [...completa('2026-10-12', '2026-10-14', '2026-10-16')]);
    const prima = root.querySelector('ion-list.scheda-settimana ion-item:not(.costanza)')!;
    expect((prima as HTMLElement & { lines?: string }).lines).toBe('inset');
  });
});


/**
 * A mezzanotte, con la Scheda aperta e senza toccarla: era "Domenica" con la
 * settimana vecchia finche' non la si toccava (l'app non ha zone.js).
 */
describe('SchedaListComponent — a mezzanotte', () => {
  afterEach(() => vi.useRealTimers());

  it('da domenica a lunedi\' da sola: giorno e settimane di fila', () => {
    // Domenica 25 ottobre, mezzo minuto prima di mezzanotte, la settimana fatta tutta.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 25, 23, 59, 30));
    const sedute = [{ dayId: 'd1', date: '2026-10-19' }, { dayId: 'd2', date: '2026-10-21' }, { dayId: 'd3', date: '2026-10-23' }];
    TestBed.configureTestingModule({
      imports: [SchedaListComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutDataService, useValue: { days: [{ id: 'd1', label: 'Petto', rec: '90"', ex: [{}] }, { id: 'd2', label: 'Schiena', rec: '90"', ex: [{}] }, { id: 'd3', label: 'Gambe', rec: '90"', ex: [{}] }], WEEK_PLAN: [{ sets: 3, reps: 10 }], hasCustomProtocol: false, protocolName: '' } },
        { provide: WorkoutStateService, useValue: { currentWeek: 1 } },
        { provide: AppStateService, useValue: { load: async () => ({ workoutDrafts: {} }) } },
        { provide: WeeklyProgressService, useValue: { refresh: vi.fn(), isDone: () => false, sedute: () => sedute } },
        { provide: WorkoutSessionStateService, useValue: { activeSession: signal<any>(null), isActiveForDay: () => false } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaListComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const testo = (sel: string) => root.querySelector(sel)?.textContent!.replace(/\s+/g, ' ').trim() ?? null;
    const giorno = () => testo('ion-list.scheda-settimana ion-item:not(.costanza) ion-note');
    const frase = () => testo('ion-list.scheda-settimana ion-item.costanza p');
    expect(giorno()).toBe('Domenica');
    expect(frase()).toBeNull();

    // Nessun tocco e nessun detectChanges: ci pensa l'orologio del giorno.
    vi.advanceTimersByTime(31_000);
    expect(giorno()).toBe('Lunedì');
    expect(frase()).toBe('Ancora 3 allenamenti');
  });
});
