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
import { buildSessionSummary } from '../../core/utils/session-summary.util';

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
    const avviata = signal(sessioneAvviata);
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
          matchesDay: () => avviata(), isPaused: () => inPausa(), togglePause: () => inPausa.set(!inPausa()),
          activeSession: () => (avviata() ? { dayId: 'day1', dayLabel: 'Petto' }
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
    return { fixture, c: fixture.componentInstance, root, nomi, passi, tutti, testo, aggiorna, tasto, start, startRestTimer, restTimer, viewMode, inPausa, avviata };
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

    it('saltando al terzo esercizio lo step resta sulla meta mentre lo slider passa sul secondo', async () => {
      const { c, root } = await monta('slider');
      const slider = root.querySelector<HTMLElement>('.exslider')!;
      Array.from(slider.children).forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 393 }));
      let x = 0;
      Object.defineProperty(slider, 'scrollLeft', { get: () => x, configurable: true });
      const scorri = async (v: number) => { x = v; c.onSliderScroll(); await new Promise(r => setTimeout(r, 40)); };

      c.vaiAlPasso('p2');
      // Prima lo step tornava al primo e passava dal secondo prima di arrivare.
      await scorri(30);
      expect(c.sliderIndex).toBe(2);
      await scorri(393);
      expect(c.sliderIndex).toBe(2);
      await scorri(786);
      expect(c.sliderIndex).toBe(2);
      // Arrivati, lo slider torna a comandare: il dito porta al secondo.
      await scorri(393);
      expect(c.sliderIndex).toBe(1);
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
      expect(testo('ion-segment.passi app-icona.passo-tick').length).toBe(1);
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

    it('durante il recupero cede il posto alla fascia: resta, dissolta e intoccabile; a recupero finito torna la stessa, con la riga sopra', async () => {
      const { testo, tutti, aggiorna, restTimer, root } = await monta('slider', true);
      const barra = root.querySelector<HTMLElement>('ion-footer.salva-footer')!;
      expect(barra.classList.contains('ceduta')).toBe(false);
      restTimer.set({ show: true, finished: false, remaining: 40 });
      aggiorna();
      // Non esce e rientra (prima spariva, e finito il recupero risaliva dal fondo): si dissolve sul posto.
      expect(root.querySelector('ion-footer.salva-footer')).toBe(barra);
      expect(barra.classList.contains('ceduta')).toBe(true);
      expect(barra.hasAttribute('inert')).toBe(true);

      restTimer.set({ show: true, finished: true, remaining: 0 });
      aggiorna();
      expect(root.querySelector('ion-footer.salva-footer')).toBe(barra);
      expect(barra.classList.contains('ceduta')).toBe(false);
      expect(barra.hasAttribute('inert')).toBe(false);
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
   * Il massimale stimato e i pesi che ne vengono stanno nel foglio del
   * massimale, come il recupero nel suo: lo apre il bilanciere nella testata
   * di ogni esercizio. Nella card occupavano mezza schermata sotto le serie.
   */
  describe('il bilanciere e il foglio del massimale', () => {
    const storia = [
      { id: 's0', session: { date: '2026-09-26', exercises: [{ name: 'Panca piana', sets: [{ load: '75', reps: '6' }] }] } },
      { id: 's1', session: { date: '2026-10-03', exercises: [{ name: 'Panca piana', sets: [{ load: '80', reps: '6' }, { load: '80', reps: '6' }] }] } }
    ];
    const pulito = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    // Il foglio e' un ion-modal: Ionic lo disegna quando si apre.
    const foglio = () => Array.from(document.querySelectorAll<HTMLElement>('.carico-sheet')).pop() ?? null;
    async function apri(card: HTMLElement, aggiorna: () => void) {
      card.querySelector<HTMLElement>('button.ex-chip.rm')!.click();
      aggiorna();
      await vi.waitFor(() => expect(foglio()).not.toBeNull());
      aggiorna();
      return foglio()!;
    }

    it('in ogni card c\'e\' il bilanciere, accanto al recupero, e il nome dice il massimale', async () => {
      const { tutti } = await monta('slider', true, false, undefined, undefined, storia);
      const chip = tutti('.exslide .ex-tags button.ex-chip.rm');
      expect(chip.length).toBe(3);
      expect(chip.every(b => b.previousElementSibling?.classList.contains('rest'))).toBe(true);
      expect(chip.map(b => b.getAttribute('aria-label'))).toEqual([
        'Massimale stimato 93 kg: apri i pesi', 'Massimale: apri i pesi', 'Massimale: apri i pesi'
      ]);
      expect(chip[0].querySelector('app-icona')).not.toBeNull();
      // Nella card il massimale non c'e' piu': sta nel foglio.
      expect(tutti('.exslide .massimale').length).toBe(0);
    });

    it('c\'e\' anche prima dell\'avvio e nell\'elenco', async () => {
      expect((await monta('slider', false)).tutti('.exslide button.ex-chip.rm').length).toBe(3);
      TestBed.resetTestingModule();
      expect((await monta('list', true)).tutti('.ex button.ex-chip.rm').length).toBe(3);
    });

    it('il foglio dice il massimale stimato, da quale serie viene e quanto e\' cambiato', async () => {
      const { tutti, aggiorna } = await monta('slider', true, false, undefined, undefined, storia);
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(pulito(f.querySelector('.sheet-title'))).toBe('Massimale — Panca piana');
      expect(pulito(f.querySelector('.massimale-kg'))).toBe('93 kg');
      expect(pulito(f.querySelector('.massimale-da'))).toBe('Da 80 × 6 del 03/10 · +6 kg dalla volta prima');
    });

    it('sotto, i pesi della serie in corso, con la percentuale; la spunta e\' sul peso nella ruota', async () => {
      const { c, tutti, aggiorna } = await monta('slider', true, false, undefined, undefined, storia, 85);
      c.exercises[0].activeRow = 1;
      aggiorna();
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(c.foglioCarico!.serie).toBe(1);
      expect(pulito(f.querySelector('.scelta-gruppo'))).toBe('Che peso metto · serie 2');
      const voci = Array.from(f.querySelectorAll('ion-radio-group ion-item.scelta-opt'));
      expect(voci.map(v => pulito(v.querySelector('.carico-titolo')))).toEqual(['Come l\'ultima volta', 'Per 10 ripetizioni', 'Dal programma, 85%']);
      expect(pulito(voci[1].querySelector('.carico-dettaglio'))).toMatch(/^\d+% del massimale stimato$/);
      expect((f.querySelector('ion-radio-group') as any).value).toBe('ultima');

      c.scegliCarico(c.foglioCarico!, 'programma');
      aggiorna();
      expect(c.exercises[0].rows[1].load).toBe('79');
      expect(c.foglioCaricoAperto).toBe(false);
    });

    it('nell\'elenco il tocco apre il foglio senza chiudere l\'esercizio', async () => {
      const { c, tutti, aggiorna } = await monta('list', true, false, undefined, undefined, storia);
      await apri(tutti('.ex')[0], aggiorna);
      expect(c.foglioCaricoAperto).toBe(true);
      expect(c.exercises[0].open).toBe(true);
    });

    it('prima dell\'avvio i pesi si leggono e basta: niente radio', async () => {
      const { tutti, aggiorna } = await monta('slider', false, false, undefined, undefined, storia, 85);
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(pulito(f.querySelector('.massimale-kg'))).toBe('93 kg');
      expect(f.querySelector('ion-radio-group')).toBeNull();
      expect(f.querySelectorAll('ion-list.carico-lettura ion-item.scelta-opt').length).toBe(3);
      expect(pulito(f.querySelector('.carico-dopo'))).toBe('Ad allenamento avviato, toccane uno per metterlo nella ruota.');
    });

    it('senza storia il foglio dice perche\' non c\'e\' un massimale, e non propone pesi', async () => {
      const { tutti, aggiorna } = await monta('slider', true);
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(f.querySelector('.massimale')).toBeNull();
      expect(pulito(f.querySelector('.massimale-vuoto'))).toBe('Ancora nessun massimale: lo stimo dalla prima sessione salvata con peso e ripetizioni di questo esercizio.');
      expect(f.querySelector('.scelta-gruppo')).toBeNull();
    });

    it('su un esercizio a cluster, senza stima, dice che la fara\' dal primo blocco', async () => {
      const { c } = await monta('slider', true);
      const vm = { ...c.exercises[0], cluster: { blocks: [5, 5], restSec: 20, end: 'fixed' } } as any;
      expect(c.testoSenzaMassimale(vm)).toContain('lo stimo dal primo blocco');
      expect(c.testoSenzaMassimale(c.exercises[0])).toContain('Ancora nessun massimale');
    });

    it('stimato da un cluster, il foglio dice che viene dal primo blocco', async () => {
      const blocchi = [{ id: 's1', session: { date: '2026-10-03', exercises: [{ name: 'Panca piana', sets: [
        { load: '60-60', reps: '8+8', done: true, blocks: [{ load: '60', reps: '8', done: true }, { load: '60', reps: '8', done: true }] }
      ] }] } }];
      const { tutti, aggiorna } = await monta('slider', true, false, undefined, undefined, blocchi);
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(pulito(f.querySelector('.massimale-kg'))).toBe('74,5 kg');
      expect(pulito(f.querySelector('.massimale-da'))).toBe('Da 60 × 8, primo blocco, del 03/10');
    });

    it('con le serie tutte fatte resta il massimale, senza pesi da scegliere', async () => {
      const { c, tutti, aggiorna } = await monta('slider', true, false, undefined, undefined, storia);
      c.exercises[0].rows.forEach((r: any) => r.done = true);
      c.exercises[0].activeRow = null;
      aggiorna();
      const f = await apri(tutti('.exslide')[0], aggiorna);
      expect(pulito(f.querySelector('.massimale-kg'))).toBe('93 kg');
      expect(f.querySelector('.scelta-gruppo')).toBeNull();
      expect(c.foglioCarico!.serie).toBeNull();
      expect(c.opzioniDelFoglio(c.foglioCarico!)).toEqual([]);
      expect(c.sceltaCarico(c.foglioCarico!)).toBe('');
      const prima = c.exercises[0].rows.map((r: any) => r.load);
      c.scegliCarico(c.foglioCarico!, 'ultima');
      expect(c.exercises[0].rows.map((r: any) => r.load)).toEqual(prima);
    });
  });

  /**
   * La barra in basso ("Inizia", "Fatta") e' fatta e si comporta come la
   * barra delle tab: una pillola di vetro sopra il contenuto, che scorrendo in
   * giu' si fa piccola e torna intera tornando su; con la tastiera dell'app
   * nativa se ne va.
   */
  describe('la barra in basso, come la barra delle tab', () => {
    const contenuto = (root: HTMLElement) => root.querySelector<HTMLElement>('ion-content')!;
    const barra = (root: HTMLElement) => root.querySelector<HTMLElement>('ion-footer.barra-azione');
    function scorri(root: HTMLElement, aggiorna: () => void, y: number) {
      const ct = contenuto(root);
      // jsdom non impagina: la pagina "puo' scendere" quanto le si dice.
      const parte = ct.shadowRoot?.querySelector<HTMLElement>('[part="scroll"]');
      if (parte) {
        Object.defineProperty(parte, 'scrollHeight', { value: 3000, configurable: true });
        Object.defineProperty(parte, 'clientHeight', { value: 800, configurable: true });
      }
      ct.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: y } }));
      aggiorna();
    }

    it('"Fatta" sta nella pillola di vetro, e il contenuto le tiene lo spazio sotto', async () => {
      const { root } = await monta('slider', true);
      const b = barra(root)!;
      expect(b.classList.contains('salva-footer')).toBe(true);
      expect(b.querySelector(':scope > .barra-pillola ion-button.salva-btn')).not.toBeNull();
      expect(contenuto(root).classList.contains('con-barra')).toBe(true);
      expect(contenuto(root).classList.contains('con-fine-recupero')).toBe(false);
    });

    it('anche "Inizia allenamento"', async () => {
      const { root } = await monta('list');
      const b = barra(root)!;
      expect(b.classList.contains('avvio-footer')).toBe(true);
      expect(b.querySelector(':scope > .barra-pillola ion-button.avvio-btn')).not.toBeNull();
      expect(contenuto(root).classList.contains('con-barra')).toBe(true);
    });

    it('senza barra (elenco in sessione) il contenuto non tiene spazio', async () => {
      const elenco = await monta('list', true);
      expect(barra(elenco.root)).toBeNull();
      expect(contenuto(elenco.root).classList.contains('con-barra')).toBe(false);
    });

    it('mentre il recupero conta lo spazio in fondo resta: il contenuto non salta a ogni serie', async () => {
      const { root, restTimer, aggiorna } = await monta('slider', true);
      restTimer.set({ show: true, finished: false, remaining: 40 });
      aggiorna();
      expect(barra(root)!.classList.contains('ceduta')).toBe(true);
      expect(contenuto(root).classList.contains('con-barra')).toBe(true);
    });

    it('"Recupero finito" le sta appoggiato sopra, fuori dalla pillola, e il contenuto ne tiene conto', async () => {
      const { root, restTimer, aggiorna } = await monta('slider', true);
      restTimer.set({ show: true, finished: true, remaining: 0 });
      aggiorna();
      const riga = barra(root)!.querySelector(':scope > .fine-recupero');
      expect(riga?.nextElementSibling?.classList.contains('barra-pillola')).toBe(true);
      expect(contenuto(root).classList.contains('con-fine-recupero')).toBe(true);
    });

    it('scorrendo in giu\' si fa piccola, tornando su o in cima torna intera', async () => {
      const { root, aggiorna } = await monta('slider', true);
      const ridotta = () => barra(root)!.classList.contains('ridotta');
      scorri(root, aggiorna, 100);
      scorri(root, aggiorna, 300);
      expect(ridotta()).toBe(true);
      scorri(root, aggiorna, 250);
      expect(ridotta()).toBe(false);
      scorri(root, aggiorna, 400);
      expect(ridotta()).toBe(true);
      scorri(root, aggiorna, 5);
      expect(ridotta()).toBe(false);
    });

    it('dopo il recupero torna intera', async () => {
      const { root, aggiorna, restTimer } = await monta('slider', true);
      scorri(root, aggiorna, 100);
      scorri(root, aggiorna, 300);
      expect(barra(root)!.classList.contains('ridotta')).toBe(true);
      restTimer.set({ show: true, finished: false, remaining: 40 });
      aggiorna();
      restTimer.set({ show: true, finished: true, remaining: 0 });
      aggiorna();
      expect(barra(root)!.classList.contains('ridotta')).toBe(false);
    });

    it('anche "Inizia" si fa piccola scorrendo', async () => {
      const { root, aggiorna } = await monta('slider');
      scorri(root, aggiorna, 100);
      scorri(root, aggiorna, 300);
      expect(barra(root)!.classList.contains('ridotta')).toBe(true);
    });

    it('con la tastiera dell\'app nativa se ne va, e chiusa torna', async () => {
      const { root, aggiorna } = await monta('slider', true);
      window.dispatchEvent(new Event('keyboardWillShow'));
      aggiorna();
      expect(barra(root)!.classList.contains('con-tastiera')).toBe(true);
      window.dispatchEvent(new Event('keyboardWillHide'));
      aggiorna();
      expect(barra(root)!.classList.contains('con-tastiera')).toBe(false);
    });

    it('uscendo dalla pagina smette di ascoltare', async () => {
      const { c, fixture, root } = await monta('slider', true);
      const ct = contenuto(root);
      const parte = ct.shadowRoot?.querySelector<HTMLElement>('[part="scroll"]');
      if (parte) {
        Object.defineProperty(parte, 'scrollHeight', { value: 3000, configurable: true });
        Object.defineProperty(parte, 'clientHeight', { value: 800, configurable: true });
      }
      fixture.destroy();
      window.dispatchEvent(new Event('keyboardWillShow'));
      ct.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 100 } }));
      ct.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 300 } }));
      expect(c.tastieraAperta()).toBe(false);
      expect(c.barraRidotta()).toBe(false);
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

    it('toccato, la barra resta la stessa e diventa quella della serie: non esce e rientra dal fondo', async () => {
      const { root, avviata, aggiorna } = await monta('slider');
      const prima = footer(root)!;
      avviata.set(true);
      aggiorna();
      const dopo = root.querySelector<HTMLElement>('ion-footer.barra-azione')!;
      expect(dopo).toBe(prima);
      expect(dopo.classList.contains('avvio-footer')).toBe(false);
      expect(dopo.classList.contains('salva-footer')).toBe(true);
      expect(dopo.querySelector('ion-button.salva-btn')!.textContent!.trim()).toBe('Fatta · serie 1 di 2');
      expect(root.querySelectorAll('ion-footer.barra-azione').length).toBe(1);
    });

    it('un recupero rimasto acceso senza sessione non nasconde "Inizia": la barra cede il posto solo alla fascia della sessione', async () => {
      const { root, restTimer, aggiorna } = await monta('slider');
      restTimer.set({ show: true, finished: false, remaining: 40 });
      aggiorna();
      expect(footer(root)!.classList.contains('ceduta')).toBe(false);
      expect(footer(root)!.hasAttribute('inert')).toBe(false);
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

/**
 * Il resoconto nella pagina: a fine allenamento al posto delle serie, con
 * "Torna alla scheda" nella pillola in basso; nello storico la seduta si apre
 * sul suo resoconto e "Serie" porta alle serie da correggere.
 */
describe('SchedaDetailComponent — il resoconto nella pagina (disegno vero)', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollTop = o?.top ?? 0; } as any;
    HTMLElement.prototype.scrollIntoView = function () {} as any;
  });

  const giorno = { id: 'day1', label: 'Petto', rec: '90"', ex: [
    { name: 'Panca piana', muscle: 'Petto', scheme: 'plain', sets: 1 },
    { name: 'Croci', muscle: 'Petto', scheme: 'plain', sets: 1 },
    { name: 'Dip', muscle: 'Tricipiti', scheme: 'plain', sets: 1 }
  ] };
  const seduta = (date: string, panca: string, croci: string, dip: string) => ({
    dayId: 'day1', dayLabel: 'Petto', date, durationSec: 3000,
    exercises: [
      { name: 'Panca piana', sets: [{ load: panca, reps: '8', done: true }] },
      { name: 'Croci', sets: [{ load: croci, reps: '12', done: true }] },
      { name: 'Dip', sets: [{ load: null, reps: dip, done: true }] }
    ]
  });

  async function monta(storico: boolean) {
    const viewMode = signal<'list' | 'slider'>('list');
    TestBed.configureTestingModule({
      imports: [SchedaDetailComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: storico
          ? { snapshot: { data: { modo: 'storico' } }, paramMap: of(convertToParamMap({ key: 'day1_2026-10-20' })) }
          : { snapshot: { data: {} }, paramMap: of(convertToParamMap({ n: '0' })) } },
        { provide: WorkoutDataService, useValue: { days: [giorno], MUSCLES: {}, getExSetsReps: () => ({ sets: 1, reps: ['8'] }) } },
        { provide: WorkoutStateService, useValue: {
          viewMode, setViewMode: (m: 'list' | 'slider') => viewMode.set(m), saveStatus: signal('idle'), currentWeek: 1,
          restTimer: signal<any>({ show: false, finished: false }), stopRestTimer: () => {}, startRestTimer: () => {}, prossimaSerie: signal(null)
        } },
        { provide: AppStateService, useValue: { load: async () => ({ restOverrides: {}, loadPercent: null, workoutDrafts: {} }), patchField: async () => {} } },
        { provide: WorkoutSessionsService, useValue: {
          get: async () => seduta('2026-10-20', '82,5', '20', '12'),
          listForDay: async () => [seduta('2026-10-06', '75', '20', '8'), seduta('2026-10-13', '80', '20', '10'), seduta('2026-10-20', '82,5', '20', '12')]
            .map(s => ({ id: `day1_${s.date}`, session: s }))
        } },
        { provide: ConfirmDialogService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: WorkoutSessionStateService, useValue: {
          matchesDay: () => false, isPaused: () => false, togglePause: () => {}, activeSession: () => null,
          elapsedSec: signal(0), formatDuration: (s: number) => `${s}`, start: () => {}
        } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaDetailComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => tutti(sel).map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    const aggiorna = () => { (fixture.componentInstance as any).cdr.detectChanges(); fixture.detectChanges(); };
    return { c: fixture.componentInstance, root, tutti, testo, aggiorna };
  }

  it('lo storico si apre sul resoconto, confrontato con la seduta prima di lei', async () => {
    const { tutti, testo } = await monta(true);
    expect(tutti('ion-segment.vista-seduta').length).toBe(1);
    expect(tutti('app-resoconto').length).toBe(1);
    // Nello storico la testa non c'e': giorno, data e durata li dice la riga della seduta.
    expect(tutti('app-resoconto .res-head').length).toBe(0);
    expect(testo('app-resoconto ion-list-header.sezione')[0]).toBe('Rispetto al 13 ottobre');
    expect(testo('app-resoconto ion-list ion-item p')[0]).toBe('82,5 kg × 8 · prima 80 kg × 8');
    // Le serie, la data da correggere e il segmento elenco/slider stanno dietro "Serie".
    expect(tutti('.exlist').length).toBe(0);
    expect(tutti('#seduta-data').length).toBe(0);
    expect(tutti('ion-header ion-segment').length).toBe(0);
    // Eliminare la seduta resta in fondo in tutte e due le viste.
    expect(tutti('.azioni-seduta').length).toBe(1);
  });

  it('"Serie" mostra le serie da correggere e toglie il resoconto', async () => {
    const { c, tutti, aggiorna } = await monta(true);
    c.mostraVistaStorico('serie');
    aggiorna();
    expect(tutti('app-resoconto').length).toBe(0);
    expect(tutti('.exlist').length).toBe(1);
    expect(tutti('#seduta-data').length).toBe(1);
    expect(tutti('ion-header ion-segment').length).toBe(1);
    c.mostraVistaStorico('resoconto');
    aggiorna();
    expect(tutti('app-resoconto').length).toBe(1);
    expect(tutti('.exlist').length).toBe(0);
  });

  it('a fine allenamento: il resoconto con la testa e "Torna alla scheda" nella pillola in basso', async () => {
    const { c, tutti, testo, aggiorna, root } = await monta(false);
    expect(tutti('ion-footer.fine-footer').length).toBe(0);
    c.summary = buildSessionSummary(seduta('2026-10-20', '82,5', '20', '12') as any, seduta('2026-10-13', '80', '20', '10') as any);
    aggiorna();
    expect(testo('app-resoconto .res-title')).toEqual(['Allenamento salvato']);
    expect(tutti('.exlist').length).toBe(0);
    expect(tutti('ion-header ion-segment').length).toBe(0);
    expect(testo('ion-footer.fine-footer.barra-azione ion-button')).toEqual(['Torna alla scheda']);
    expect(root.querySelector('ion-content')!.classList.contains('con-barra')).toBe(true);
  });
});
