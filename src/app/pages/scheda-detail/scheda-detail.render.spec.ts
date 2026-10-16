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
 * nello slider il nome non apre niente e non deve fingere di farlo. I
 * trattini in cima allo slider portano alla slide.
 */
describe('SchedaDetailComponent — accessibilita\' delle testate (disegno vero)', () => {
  const giorno = {
    id: 'day1', label: 'Petto', rec: '90"',
    ex: [
      { name: 'Panca piana', muscle: 'Petto', scheme: 'plain', sets: 2 },
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

  async function monta(vista: 'list' | 'slider', sessioneAvviata = false, altraSessione = false) {
    const start = vi.fn();
    const viewMode = signal<'list' | 'slider'>(vista);
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
          restTimer: signal({ show: false }), stopRestTimer: () => {}, startRestTimer: () => {},
          prossimaSerie: signal(null)
        } },
        { provide: AppStateService, useValue: {
          load: async () => ({ restOverrides: {}, loadPercent: null, workoutDrafts: {} }),
          patchField: async () => {}
        } },
        { provide: WorkoutSessionsService, useValue: { listForDay: async () => [] } },
        { provide: ConfirmDialogService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: WorkoutSessionStateService, useValue: {
          matchesDay: () => sessioneAvviata, isPaused: () => false,
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
    const trattini = () => Array.from(root.querySelectorAll<HTMLElement>('.exslider-dash'));
    const tasto = (el: HTMLElement, key: string) => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };
    return { fixture, root, nomi, trattini, tasto, start };
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

    it('nell\'elenco non ci sono trattini', async () => {
      const { trattini } = await monta('list');
      expect(trattini().length).toBe(0);
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

    it('un trattino per esercizio, ognuno dice dove porta', async () => {
      const { trattini } = await monta('slider');
      const t = trattini();
      expect(t.length).toBe(3);
      t.forEach((el, i) => {
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toBe(`Vai all'esercizio ${i + 1}`);
      });
    });

    it('solo il trattino della slide corrente ha aria-current', async () => {
      const { trattini } = await monta('slider');
      const correnti = trattini().filter(t => t.getAttribute('aria-current') === 'true');
      expect(correnti.length).toBe(1);
      expect(trattini()[0].getAttribute('aria-current')).toBe('true');
      expect(trattini()[1].hasAttribute('aria-current')).toBe(false);
    });

    it('Invio su un trattino porta a quella slide', async () => {
      const { fixture, trattini, tasto } = await monta('slider');
      const vai = vi.spyOn(fixture.componentInstance, 'scrollToIndex').mockImplementation(() => {});

      tasto(trattini()[2], 'Enter');

      expect(vai).toHaveBeenCalledWith(2);
    });

    it('a sessione avviata c\'e\' il tondo della chiusura, raggiungibile e con la sua etichetta', async () => {
      const { fixture, trattini, tasto } = await monta('slider', true);
      expect(trattini().length).toBe(4);
      const fine = trattini()[3];
      expect(fine.classList.contains('finish')).toBe(true);
      expect(fine.getAttribute('role')).toBe('button');
      expect(fine.getAttribute('aria-label')).toBe('Vai alla chiusura dell\'allenamento');

      const vai = vi.spyOn(fixture.componentInstance, 'scrollToIndex').mockImplementation(() => {});
      tasto(fine, ' ');
      expect(vai).toHaveBeenCalledWith(3);
    });

    it('senza sessione il tondo della chiusura non c\'e\'', async () => {
      const { trattini } = await monta('slider', false);
      expect(trattini().some(t => t.classList.contains('finish'))).toBe(false);
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

    it('la barra della sessione compare solo quando c\'e\' una sessione (questo giorno o un altro)', async () => {
      expect((await monta('list', false, false)).root.querySelector('.session-bar')).toBeNull();
      TestBed.resetTestingModule();
      expect((await monta('list', true, false)).root.querySelector('.session-bar')).not.toBeNull();
      TestBed.resetTestingModule();
      expect((await monta('list', false, true)).root.querySelector('.session-bar')).not.toBeNull();
    });

    it('il tondo play/pausa in alto c\'e\' solo se la sessione e\' di questo giorno', async () => {
      expect((await monta('list', true)).root.querySelector('.session-bar-btn')).not.toBeNull();
      TestBed.resetTestingModule();
      expect((await monta('list', false, true)).root.querySelector('.session-bar-btn')).toBeNull();
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
});
