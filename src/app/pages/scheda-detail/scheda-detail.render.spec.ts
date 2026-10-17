import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { beforeAll, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { SchedaDetailComponent } from './scheda-detail.component';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService } from '../../services/app-state.service';
import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ToastService } from '../../services/toast.service';
import { NavController } from '@ionic/angular';

/**
 * Le testate degli esercizi sono UN template (#exHeader) usato da due viste.
 * Nell'elenco il nome apre l'esercizio, quindi e' un controllo da tastiera;
 * nello slider il nome non apre niente e non deve fingere di farlo. Gli
 * step in cima allo slider (un numero per esercizio) portano alla slide.
 */
describe('SchedaDetailComponent — accessibilita\' delle testate (disegno vero)', () => {
  const giorno = {
    id: 'day1', label: 'Petto', rec: '90"',
    ex: [
      { name: 'Panca piana', muscle: 'Petto', scheme: 'plain', sets: 2, note: 'PICCO 2″' },
      { name: 'Croci', muscle: 'Petto', scheme: 'plain', sets: 2 },
      { name: 'Dip', muscle: 'Tricipiti', scheme: 'plain', sets: 2 }
    ]
  };

  // Le ruote numeriche si portano sul valore con scrollTo() e lo slider sulla
  // slide con scrollIntoView(): l'ambiente di test non ha ne' l'uno ne' l'altro.
  // Non si ripristinano: il componente li chiama anche da timer che scattano
  // dopo l'ultimo test, e ogni file di test ha il suo ambiente.
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollTop = o?.top ?? 0; } as any;
    HTMLElement.prototype.scrollIntoView = function () {} as any;
  });

  async function monta(vista: 'list' | 'slider', sessioneAvviata = false, altraSessione = false, bozze?: unknown[],
    patchField: (...a: any[]) => Promise<void> = async () => {}, storia: unknown[] = [], loadPercent: number | null = null) {
    const start = vi.fn();
    const startRestTimer = vi.fn();
    const viewMode = signal<'list' | 'slider'>(vista);
    const restTimer = signal<any>({ show: false, finished: false });
    const inPausa = signal(false);
    TestBed.configureTestingModule({
      imports: [SchedaDetailComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} }, paramMap: of(convertToParamMap({ n: '0' })) } },
        { provide: WorkoutDataService, useValue: {
          days: [giorno], MUSCLES: {},
          getExSetsReps: () => ({ sets: 2, reps: ['10', '10'] })
        } },
        { provide: WorkoutStateService, useValue: {
          viewMode, setViewMode: (m: 'list' | 'slider') => viewMode.set(m),
          saveStatus: signal('idle'), currentWeek: 1,
          restTimer, stopRestTimer: () => restTimer.set({ show: false, finished: false }), startRestTimer,
          prossimaSerie: signal(null)
        } },
        { provide: AppStateService, useValue: {
          load: async () => ({ restOverrides: {}, loadPercent, workoutDrafts: bozze ? { day1: bozze } : {} }),
          patchField
        } },
        { provide: WorkoutSessionsService, useValue: { listForDay: async () => storia } },
        { provide: ConfirmDialogService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: WorkoutSessionStateService, useValue: {
          matchesDay: () => sessioneAvviata, isPaused: () => inPausa(), togglePause: () => inPausa.set(!inPausa()),
          activeSession: () => (sessioneAvviata ? { dayId: 'day1', dayLabel: 'Petto' }
            : altraSessione ? { dayId: 'altro', dayLabel: 'Gambe' } : null),
          elapsedSec: signal(0), formatDuration: (s: number) => `${s}`, start
        } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaDetailComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const nomi = () => Array.from(root.querySelectorAll<HTMLElement>('.ex-name'));
    const passi = () => Array.from(root.querySelectorAll<HTMLElement>('ion-segment.passi ion-segment-button'));
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => tutti(sel).map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    // Come fa il componente stesso (l'app non usa zone.js).
    const aggiorna = () => { (fixture.componentInstance as any).cdr.detectChanges(); fixture.detectChanges(); };
    const tasto = (el: HTMLElement, key: string) => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };
    return { fixture, c: fixture.componentInstance, root, nomi, passi, tutti, testo, aggiorna, tasto, start, startRestTimer, restTimer, viewMode, inPausa };
  }

  describe('vista elenco', () => {
    it('ogni nome e\' un pulsante che dichiara se l\'esercizio e\' aperto', async () => {
      const { nomi } = await monta('list');
      expect(nomi().length).toBe(3);
      for (const n of nomi()) {
        expect(n.getAttribute('role')).toBe('button');
        expect(n.getAttribute('tabindex')).toBe('0');
        expect(n.getAttribute('aria-expanded')).toBe('true');
      }
    });

    it('Invio sul nome chiude l\'esercizio e aria-expanded segue', async () => {
      const { fixture, root, nomi, tasto } = await monta('list');
      const primo = nomi()[0];
      const ex = primo.closest('.ex') as HTMLElement;
      expect(ex.classList.contains('open')).toBe(true);

      const ev = tasto(primo, 'Enter');
      fixture.detectChanges();

      expect(ev.defaultPrevented).toBe(true);
      expect(ex.classList.contains('open')).toBe(false);
      expect(nomi()[0].getAttribute('aria-expanded')).toBe('false');
      // Gli altri non si sono mossi.
      expect(nomi()[1].getAttribute('aria-expanded')).toBe('true');
      expect(root.querySelectorAll('.ex.open').length).toBe(2);
    });

    it('Spazio fa lo stesso e il contenitore non e\' un secondo pulsante', async () => {
      const { fixture, root, nomi, tasto } = await monta('list');
      tasto(nomi()[1], ' ');
      fixture.detectChanges();

      expect(nomi()[1].getAttribute('aria-expanded')).toBe('false');
      // Il ruolo sta sul titolo: la riga che lo contiene (col chip del
      // recupero dentro) resterebbe un pulsante dentro un pulsante.
      for (const riga of Array.from(root.querySelectorAll<HTMLElement>('.ex-summary'))) {
        expect(riga.getAttribute('role')).toBeNull();
        expect(riga.getAttribute('tabindex')).toBeNull();
      }
    });

    it('un tasto premuto sul chip del recupero non apre ne\' chiude l\'esercizio', async () => {
      const { fixture, root, tasto } = await monta('list');
      const chip = root.querySelector<HTMLElement>('.ex-chip.rest')!;
      expect(chip).toBeTruthy();

      tasto(chip, 'Enter');
      fixture.detectChanges();

      expect(root.querySelectorAll('.ex.open').length).toBe(3);
    });

    it('nell\'elenco non ci sono step: i numeri li hanno gia\' le card', async () => {
      const { passi } = await monta('list');
      expect(passi().length).toBe(0);
    });
  });

  describe('vista slider', () => {
    it('il nome non apre niente, quindi non e\' un controllo', async () => {
      const { nomi } = await monta('slider');
      expect(nomi().length).toBe(3);
      for (const n of nomi()) {
        expect(n.getAttribute('role')).toBeNull();
        expect(n.getAttribute('tabindex')).toBeNull();
        expect(n.getAttribute('aria-expanded')).toBeNull();
        expect(n.classList.contains('tasto')).toBe(false);
      }
    });

    it('uno step per esercizio: il numero, e il nome per chi non lo vede', async () => {
      const { passi, testo, tutti } = await monta('slider');
      expect(passi().length).toBe(3);
      expect(testo('ion-segment.passi ion-segment-button')).toEqual(['1: Panca piana', '2: Croci', '3: Dip']);
      expect(tutti('ion-segment.passi')[0].getAttribute('aria-label')).toBe('Esercizi di oggi');
    });

    it('lo step scelto e\' la slide che si sta guardando', async () => {
      const { c, tutti } = await monta('slider');
      expect((tutti('ion-segment.passi')[0] as any).value).toBe('p0');
      c.sliderIndex = 2;
      (c as any).cdr.detectChanges();
      expect((tutti('ion-segment.passi')[0] as any).value).toBe('p2');
    });

    it('scegliere uno step porta a quella slide; uno che non c\'e\' non fa niente', async () => {
      const { c } = await monta('slider');
      const vai = vi.spyOn(c, 'scrollToIndex').mockImplementation(() => {});
      c.vaiAlPasso('p2');
      expect(vai).toHaveBeenCalledWith(2);
      expect(c.sliderIndex).toBe(2);
      c.vaiAlPasso('p9');
      c.vaiAlPasso(undefined);
      expect(vai).toHaveBeenCalledTimes(1);
    });

    it('a sessione avviata c\'e\' la bandiera della chiusura, col suo nome', async () => {
      const { passi, testo } = await monta('slider', true);
      expect(passi().length).toBe(4);
      expect(testo('ion-segment.passi ion-segment-button')[3]).toBe('Chiusura dell\'allenamento');
    });

    it('senza sessione la bandiera della chiusura non c\'e\'', async () => {
      const { passi } = await monta('slider', false);
      expect(passi().length).toBe(3);
    });

    it('un esercizio finito ha la spunta, e lo dice a parole', async () => {
      const { c, testo, aggiorna } = await monta('slider', true);
      c.exercises[1].rows.forEach((r: any) => r.done = true);
      aggiorna();
      expect(testo('ion-segment.passi ion-segment-button')[1]).toBe('2: Croci, finito');
      expect(testo('ion-segment.passi lucide-icon.passo-tick').length).toBe(1);
    });
  });

  /**
   * La sessione e gli esercizi stanno in una card sola: il tempo, quanti
   * esercizi sono finiti, la pausa, e sotto gli step.
   */
  describe('la card della sessione', () => {
    it('c\'e\' solo se la sessione e\' su questo giorno, e conta gli esercizi finiti', async () => {
      expect((await monta('slider', false)).root.querySelector('.sessione-card')).toBeNull();
      TestBed.resetTestingModule();
      const { c, testo, aggiorna } = await monta('slider', true);
      expect(testo('.sessione-conto')).toEqual(['0 di 3 esercizi']);
      c.exercises[0].rows.forEach((r: any) => r.done = true);
      aggiorna();
      expect(testo('.sessione-conto')).toEqual(['1 di 3 esercizi']);
    });

    it('gli step stanno dentro la card, nello slider; nell\'elenco la card ha solo il tempo', async () => {
      const slider = await monta('slider', true);
      expect(slider.root.querySelector('.sessione-card ion-segment.passi')).not.toBeNull();
      TestBed.resetTestingModule();
      const elenco = await monta('list', true);
      expect(elenco.root.querySelector('.sessione-card')).not.toBeNull();
      expect(elenco.root.querySelector('ion-segment.passi')).toBeNull();
    });

    it('in corsa la pausa e\' un contorno; in pausa "riprendi" e\' il tasto pieno e lo si legge', async () => {
      const { tutti, testo, aggiorna, inPausa } = await monta('slider', true);
      const tasto = () => tutti('.sessione-card .session-bar-btn')[0];
      expect(tasto().classList.contains('ghost')).toBe(true);
      expect(tasto().getAttribute('aria-label')).toBe('Metti in pausa la sessione');
      expect(testo('.sessione-pausa')).toEqual([]);

      inPausa.set(true);
      aggiorna();
      expect(tasto().classList.contains('ghost')).toBe(false);
      expect(tasto().getAttribute('aria-label')).toBe('Riprendi la sessione');
      expect(testo('.sessione-pausa')).toEqual(['In pausa']);
      expect(tutti('.sessione-card')[0].classList.contains('in-pausa')).toBe(true);
    });

    it('una sessione su un altro giorno ha la sua barra, che porta li\'', async () => {
      const { root } = await monta('list', false, true);
      expect(root.querySelector('.sessione-card')).toBeNull();
      expect(root.querySelector('.session-bar')).not.toBeNull();
      expect(root.querySelector('.session-bar-btn')).toBeNull();
    });
  });

  /**
   * Il titolo e' il nome del giorno; la testata dell'esercizio ha il muscolo
   * come etichetta sobria; la nota del coach si legge.
   */
  describe('la testata', () => {
    it('il titolo e\' il nome del giorno, non "Giorno 1"', async () => {
      const { testo } = await monta('slider');
      expect(testo('ion-title .navtitle')).toEqual(['Petto']);
    });

    it('il muscolo e\' un pallino col suo colore e il nome, non una pastiglia colorata', async () => {
      const { tutti } = await monta('slider');
      const muscolo = tutti('.ex-muscle')[0];
      expect(muscolo.textContent!.trim()).toBe('Petto');
      expect(muscolo.style.background).toBe('');
      expect(muscolo.querySelector<HTMLElement>('.ex-muscle-dot')!.style.background).not.toBe('');
      // Anche il numero dell'esercizio: niente piu' fondo del colore del muscolo.
      expect(tutti('.ex-icon.ex-num')[0].style.background).toBe('');
    });

    it('la nota del coach ha un nome e si legge, solo dove c\'e\'', async () => {
      const { testo } = await monta('slider');
      expect(testo('.coach-nota')).toEqual(['Nota del coach: PICCO 2″']);
    });
  });

  /**
   * Prima dell'avvio la card e' da leggere: il programma, non dei comandi spenti.
   */
  describe('prima dell\'avvio', () => {
    it('niente ruote ne\' "Fatta" spenti: c\'e\' il programma, serie per serie', async () => {
      const { tutti, testo } = await monta('slider', false);
      expect(tutti('app-number-wheel').length).toBe(0);
      expect(tutti('ion-button.setdone:not(.avvio-btn)').length).toBe(0);
      expect(tutti('.setslocked-hint').length).toBe(0);
      expect(testo('.exslide')[0]).toContain('10 rip.');
      expect(tutti('.exslide')[0].querySelectorAll('.piano-riga[role="row"]').length).toBe(2);
    });

    it('con la storia dice da dove vengono i pesi', async () => {
      const storia = [{ id: 's1', session: { date: '2026-10-03', exercises: [{ name: 'Panca piana', sets: [{ load: '33', reps: '10' }, { load: '33', reps: '10' }] }] } }];
      const { tutti, testo } = await monta('slider', false, false, undefined, undefined, storia);
      const card = tutti('.exslide')[0];
      expect(Array.from(card.querySelectorAll('.piano-riga span[role="cell"]')).map(e => e.textContent!.trim())).toEqual(['10 × 33 kg', '10 × 33 kg']);
      expect(testo('.exslide .piano-fonte')[0]).toBe('Pesi dell\'ultima volta, 03/10');
    });

    it('avviata la sessione, tornano le serie coi comandi', async () => {
      const { tutti } = await monta('slider', true);
      expect(tutti('.piano').length).toBe(0);
      expect(tutti('app-number-wheel').length).toBeGreaterThan(0);
    });
  });

  /**
   * Nello slider, ad allenamento avviato, il comando della serie sta in basso,
   * sotto il pollice; durante il recupero gli da' il cambio la fascia.
   */
  describe('il tasto in basso', () => {
    const tasti = (testo: (s: string) => string[]) => testo('ion-footer.salva-footer ion-button');

    it('nello slider "Fatta" sta in basso, con la serie; nella card non c\'e\' piu\'', async () => {
      const { testo, tutti } = await monta('slider', true);
      expect(tasti(testo)).toEqual(['Fatta · serie 1 di 2']);
      expect(tutti('.exslide ion-button.setdone').length).toBe(0);
    });

    it('nell\'elenco e senza sessione non c\'e\'; nell\'elenco "Fatta" resta nella card', async () => {
      const elenco = await monta('list', true);
      expect(elenco.root.querySelector('ion-footer.salva-footer')).toBeNull();
      expect(elenco.tutti('.ex ion-button.setdone').length).toBe(3);
      TestBed.resetTestingModule();
      expect((await monta('slider', false)).root.querySelector('ion-footer.salva-footer')).toBeNull();
    });

    it('toccarlo segna la serie della card e fa partire il recupero', async () => {
      const { c, tutti, aggiorna, startRestTimer } = await monta('slider', true);
      tutti('ion-footer.salva-footer ion-button')[0].click();
      aggiorna();
      expect(c.exercises[0].rows[0].done).toBe(true);
      expect(startRestTimer).toHaveBeenCalledWith(90, 'Panca piana', 'day1');
    });

    it('durante il recupero non c\'e\' (c\'e\' la fascia); a recupero finito torna, con la riga sopra', async () => {
      const { testo, tutti, aggiorna, restTimer, root } = await monta('slider', true);
      restTimer.set({ show: true, finished: false, remaining: 40 });
      aggiorna();
      expect(root.querySelector('ion-footer.salva-footer')).toBeNull();

      restTimer.set({ show: true, finished: true, remaining: 0 });
      aggiorna();
      expect(tasti(testo)).toEqual(['Fatta · serie 1 di 2']);
      expect(testo('.fine-recupero')).toEqual(['Recupero finito']);
      // La fascia, che lo annunciava, se ne va: lo annuncia la pagina.
      const annuncio = tutti('[aria-live="polite"]').map(e => e.textContent!.trim());
      expect(annuncio).toContain('Recupero finito: vai con la serie successiva.');
    });

    it('su una serie fatta riaperta porta alla serie da fare', async () => {
      const { c, testo, tutti, aggiorna } = await monta('slider', true);
      const vm = c.exercises[0];
      vm.rows[0].done = true;
      vm.activeRow = 0;
      aggiorna();
      expect(tasti(testo)).toEqual(['Torna alla serie 2']);
      expect(testo('.exslide .setcard-hint.fatta')[0]).toBe('fatta');
      tutti('ion-footer.salva-footer ion-button')[0].click();
      aggiorna();
      expect(vm.activeRow).toBe(1);
      expect(tasti(testo)).toEqual(['Fatta · serie 2 di 2']);
    });

    it('con l\'esercizio finito porta avanti; sull\'ultimo, alla chiusura', async () => {
      const { c, testo, tutti, aggiorna } = await monta('slider', true);
      const vai = vi.spyOn(c, 'scrollToIndex').mockImplementation(() => {});
      c.exercises[0].rows.forEach((r: any) => r.done = true);
      c.exercises[0].activeRow = null;
      aggiorna();
      expect(tasti(testo)).toEqual(['Prossimo esercizio']);
      tutti('ion-footer.salva-footer ion-button')[0].click();
      expect(vai).toHaveBeenCalledWith(1);

      c.exercises[2].rows.forEach((r: any) => r.done = true);
      c.exercises[2].activeRow = null;
      c.sliderIndex = 2;
      aggiorna();
      expect(tasti(testo)).toEqual(['Vai alla chiusura']);
    });

    it('sulla card della chiusura non c\'e\'', async () => {
      const { c, root, aggiorna } = await monta('slider', true);
      c.sliderIndex = 3;
      aggiorna();
      expect(root.querySelector('ion-footer.salva-footer')).toBeNull();
    });

    it('le serie da fare dicono il programma; quelle fatte hanno la spunta e la matita', async () => {
      const { c, testo, tutti, aggiorna } = await monta('slider', true);
      expect(testo('.exslide .setline .setline-val')[0]).toBe('10 rip.');
      c.exercises[0].rows[0].done = true;
      c.exercises[0].rows[0].reps = '10';
      c.exercises[0].activeRow = 1;
      aggiorna();
      const fatta = tutti('.exslide')[0].querySelector('.setline.done')!;
      expect(fatta.querySelector('.setline-tick')).not.toBeNull();
      expect(fatta.querySelector('.setline-edit')).not.toBeNull();
    });
  });

  /**
   * Che peso metto: la riga in cima alla serie dice da dove viene il numero
   * nella ruota, e apre le altre fonti.
   */
  describe('che peso metto', () => {
    const storia = [{ id: 's1', session: { date: '2026-10-03', exercises: [{ name: 'Panca piana', sets: [{ load: '80', reps: '6' }, { load: '80', reps: '6' }] }] } }];

    it('la serie dice da dove viene il peso, e con piu\' fonti e\' un tasto', async () => {
      const { tutti } = await monta('slider', true, false, undefined, undefined, storia);
      const fonte = tutti('.exslide')[0].querySelector<HTMLElement>('button.setcard-fonte')!;
      expect(fonte.textContent!.trim()).toBe('come il 03/10');
      expect(fonte.getAttribute('aria-label')).toBe('Carico: come il 03/10. Scegli da dove partire');
    });

    it('senza storia non c\'e\' niente da dire', async () => {
      const { tutti } = await monta('slider', true);
      expect(tutti('.exslide')[0].querySelector('.setcard-fonte')).toBeNull();
    });

    it('il foglio ha le fonti col loro peso; sceglierne una lo mette nella ruota', async () => {
      const { c, tutti, aggiorna } = await monta('slider', true, false, undefined, undefined, storia, 85);
      const vm = c.exercises[0];
      tutti('.exslide')[0].querySelector<HTMLElement>('button.setcard-fonte')!.click();
      aggiorna();
      expect(c.foglioCaricoAperto).toBe(true);
      expect(c.opzioniCarico(vm, 0).map((o: any) => o.chiave)).toEqual(['ultima', 'rm', 'programma']);
      expect(c.sceltaCarico(c.foglioCarico!)).toBe('ultima');

      c.scegliCarico(c.foglioCarico!, 'programma');
      aggiorna();
      expect(vm.rows[0].load).toBe('79');
      expect(c.foglioCaricoAperto).toBe(false);
      expect(tutti('.exslide')[0].querySelector('button.setcard-fonte')!.textContent!.trim()).toBe('programma 85%');
    });

    it('con le frecce si sceglie senza chiudere il foglio', async () => {
      const { c, aggiorna } = await monta('slider', true, false, undefined, undefined, storia);
      c.apriCarico(c.exercises[0], 0);
      aggiorna();
      c.scegliCarico(c.foglioCarico!, 'rm', new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(c.foglioCaricoAperto).toBe(true);
    });

    it('a sessione non avviata il foglio non si apre', async () => {
      const { c } = await monta('slider', false, false, undefined, undefined, storia);
      c.apriCarico(c.exercises[0], 0);
      expect(c.foglioCaricoAperto).toBe(false);
    });
  });

  /**
   * Il comando principale della pagina sta in basso, sotto il pollice. Finche'
   * non c'e' una sessione la scheda e' spenta: l'avvio non deve essere un tondo
   * piccolo da cercare in alto a destra.
   */
  describe('avvio dell\'allenamento', () => {
    const footer = (root: HTMLElement) => root.querySelector<HTMLElement>('ion-footer.avvio-footer');
    const pulsante = (root: HTMLElement) => footer(root)?.querySelector<HTMLElement>('ion-button.avvio-btn') ?? null;

    it('senza sessione in fondo c\'e\' "Inizia allenamento"', async () => {
      const { root } = await monta('list');
      expect(pulsante(root)?.textContent?.trim()).toBe('Inizia allenamento');
    });

    it('toccarlo avvia la sessione di questo giorno', async () => {
      const { root, start } = await monta('list');
      pulsante(root)!.click();
      expect(start).toHaveBeenCalledWith('day1', 'Petto');
    });

    it('c\'e\' anche nello slider', async () => {
      const { root } = await monta('slider');
      expect(pulsante(root)).not.toBeNull();
    });

    it('a sessione avviata sparisce: il suo posto lo prende la fascia del recupero', async () => {
      const { root } = await monta('list', true);
      expect(footer(root)).toBeNull();
    });

    it('se la sessione e\' su un altro giorno non si puo\' avviarne una seconda', async () => {
      const { root } = await monta('list', false, true);
      expect(footer(root)).toBeNull();
    });
  });

  /**
   * "Seduta non trovata." era un vicolo cieco: un testo e basta. Succede aprendo
   * una seduta che nel frattempo e' stata cancellata (da un altro dispositivo, o
   * dal link di una notifica).
   */
  describe('seduta non trovata', () => {
    it('ha una via d\'uscita: torna allo storico', async () => {
      const { fixture, root } = await monta('list');
      const c = fixture.componentInstance;
      const naviga = vi.spyOn(TestBed.inject(NavController), 'navigateBack').mockResolvedValue(true as any);
      c.notFound = true;
      // Come fa il componente stesso (l'app non usa zone.js): senza, il disegno resta com'era.
      (c as any).cdr.detectChanges();

      const vuoto = Array.from(root.querySelectorAll<HTMLElement>('.history-empty')).find(e => /Seduta non trovata/.test(e.textContent ?? ''))!;
      expect(vuoto).toBeTruthy();
      const bottone = vuoto.querySelector<HTMLElement>('ion-button')!;
      expect(bottone.textContent!.trim()).toBe('Torna allo storico');

      bottone.click();
      expect(naviga).toHaveBeenCalledWith(['/scheda/storico']);
    });
  });

  describe('le bozze dopo un riordino del giorno nel builder', () => {
    const serie = (reps: string, load: string) => ({ reps, load, done: true });
    const bozzaDi = (name: string | undefined, load: string) =>
      ({ ...(name === undefined ? {} : { name }), rows: [serie('8', load), serie('8', load)] });
    const caricoDi = (c: any) => c.exercises.map((vm: any) => vm.rows[0].load);

    it('i chili scritti restano sul loro esercizio anche se l\'ordine e\' cambiato', async () => {
      // Salvata quando il giorno era Dip, Panca piana, Croci; ora e' Panca piana, Croci, Dip.
      const { fixture } = await monta('list', true, false, [bozzaDi('Dip', '30'), bozzaDi('Panca piana', '60'), bozzaDi('Croci', '20')]);
      expect(caricoDi(fixture.componentInstance)).toEqual(['60', '20', '30']);
    });

    it('le bozze di prima, senza nome, valgono per posizione come sempre', async () => {
      const { fixture } = await monta('list', true, false, [bozzaDi(undefined, '1'), bozzaDi(undefined, '2'), bozzaDi(undefined, '3')]);
      expect(caricoDi(fixture.componentInstance)).toEqual(['1', '2', '3']);
    });

    it('salvando la bozza scrive il nome di ogni esercizio, perche\' possa ritrovarlo', async () => {
      const patch = vi.fn(async () => {});
      const { fixture } = await monta('list', true, false, undefined, patch);
      (fixture.componentInstance as any).saveDraft();
      const chiamata = (patch.mock.calls as any[][]).find(c => c[0] === 'workoutDrafts.day1');
      expect(chiamata).toBeTruthy();
      expect((chiamata![1] as any[]).map(d => d.name)).toEqual(['Panca piana', 'Croci', 'Dip']);
    });
  });
});
