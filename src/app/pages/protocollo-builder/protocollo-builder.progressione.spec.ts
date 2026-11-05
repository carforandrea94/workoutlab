import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Stesso mock degli altri spec del builder: pdfjs-dist tocca API del browser che qui non ci sono.
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
import { SETTIMANE_MAX } from '../../core/utils/settimane-programma.util';

@Component({ standalone: true, template: '' })
class ElencoProtocolli {}

/**
 * La progressione di serie e ripetizioni si scrive una volta sola, per tutto il
 * programma ("Progressione settimanale", in Programma): la mostrano la Scheda e
 * Info e la seguono gli esercizi a onda. Qui si monta il template vero.
 */
describe('ProtocolloBuilderComponent — la progressione del programma', () => {
  const PROGRAMMA = [{ sets: 4, reps: 10 }, { sets: 4, reps: 8 }, { sets: 3, reps: '6-8' }];

  function protocollo(): Protocol {
    const ex = (name: string, extra: object = {}) => ({ name, scheme: 'wave', sets: 4, muscle: 'Petto', reps: ['10'], ...extra });
    return {
      id: 'proto1', userId: 'user1', name: 'Protocollo test', status: 'draft', source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        weekPlan: structuredClone(PROGRAMMA),
        days: [{ id: 'day1', label: 'Petto', rec: '90"', ex: [
          // Una copia scritta nel PDF: e' la stessa progressione del programma.
          ex('Panca', { weekPlan: structuredClone(PROGRAMMA) }),
          // Una che si distingue.
          ex('Croci', { weekPlan: [{ sets: 3, reps: 12 }, { sets: 3, reps: 12 }, { sets: 3, reps: 12 }] }),
          // Una che gia' segue il programma.
          ex('Dip')
        ] }]
      },
      diet: [], infoNote: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } as any;
  }

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollTop = o?.top ?? 0; } as any;
    HTMLElement.prototype.scrollIntoView = function () {} as any;
  });

  async function monta(conPiano: (p: Protocol) => void = () => {}) {
    const protocolSvc = {
      changed$: new Subject<void>(),
      get: vi.fn(async () => { const p = protocollo(); conPiano(p); return structuredClone(p); }),
      update: vi.fn(async () => {}),
      activate: vi.fn(async () => {})
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
    const aggiorna = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable(); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); };
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const qa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const riga = () => q('ion-item.riga-progressione')!;
    return { c, fixture, root, aggiorna, q, qa, testo, riga, protocolSvc };
  }

  describe('la riga "Progressione settimanale" in Programma', () => {
    it('dice in una riga com\'e\' la progressione, e a riposo non mostra le settimane', async () => {
      const { q, qa, riga, testo } = await monta();
      expect(testo(riga().querySelector('h2'))).toBe('Progressione settimanale');
      expect(testo(riga().querySelector('p'))).toBe('3 settimane · 4×10 → 3×6-8');
      expect(riga().getAttribute('aria-expanded')).toBe('false');
      expect(qa('.progressione-programma')).toHaveLength(0);
      // E' nel blocco Programma, subito sotto l'inizio.
      expect(q('ion-list-header.sezione')!.textContent).toContain('Programma');
    });

    it('si apre e si chiude: una riga per settimana col suo numero, serie e ripetizioni scrivibili', async () => {
      const { c, aggiorna, qa, riga } = await monta();
      riga().click();
      await aggiorna();
      expect(riga().getAttribute('aria-expanded')).toBe('true');
      expect(riga().classList.contains('aperta')).toBe(true);
      const righe = qa('.progressione-programma .weekplan-row');
      expect(righe).toHaveLength(3);
      expect(righe.map(r => r.querySelector('.weekplan-num')!.textContent!.trim())).toEqual(['S1', 'S2', 'S3']);
      const campi = (r: HTMLElement) => Array.from(r.querySelectorAll<HTMLElement & { value?: unknown; type?: string }>('ion-input'));
      expect(campi(righe[2]).map(i => i.type)).toEqual(['number', 'text']);
      expect(campi(righe[2])[1].value).toBe('6-8');

      riga().click();
      await aggiorna();
      expect(riga().getAttribute('aria-expanded')).toBe('false');
      expect(qa('.progressione-programma')).toHaveLength(0);
      expect(c.progressioneAperta).toBe(false);
    });

    it('cambiando una settimana la riga lo dice subito', async () => {
      const { c, aggiorna, riga, testo } = await monta();
      c.protocol!.workout.weekPlan[2] = { sets: 4, reps: 10 };
      c.protocol!.workout.weekPlan[1] = { sets: 4, reps: 10 };
      await aggiorna();
      expect(testo(riga().querySelector('p'))).toBe('3 settimane · 4×10');
    });

    it('"Aggiungi settimana" ne aggiunge una come l\'ultima', async () => {
      const { c, aggiorna, qa, riga, testo } = await monta();
      riga().click();
      await aggiorna();
      const aggiungi = qa('.progressione-programma ion-button.azione-riquadro')[0];
      aggiungi.click();
      await aggiorna();
      expect(c.protocol!.workout.weekPlan).toHaveLength(4);
      expect(c.protocol!.workout.weekPlan[3]).toEqual({ sets: 3, reps: '6-8' });
      expect(qa('.progressione-programma .weekplan-row')).toHaveLength(4);
      expect(testo(riga().querySelector('p'))).toBe('4 settimane · 4×10 → 3×6-8');
    });

    it('si toglie una settimana, ma non l\'ultima rimasta: "Settimana 1 di 0" non ha senso', async () => {
      const { c, aggiorna, qa, riga } = await monta();
      riga().click();
      await aggiorna();
      const tasti = () => qa('.progressione-programma .weekplan-row ion-button.delete-btn');
      tasti()[1].click();
      await aggiorna();
      expect(c.protocol!.workout.weekPlan).toEqual([{ sets: 4, reps: 10 }, { sets: 3, reps: '6-8' }]);

      c.removeSettimanaProgramma(0);
      c.removeSettimanaProgramma(0);
      c.removeSettimanaProgramma(0);
      await aggiorna();
      expect(c.protocol!.workout.weekPlan).toHaveLength(1);
      expect((tasti()[0] as any).disabled).toBe(true);
    });

    it('non piu\' di un anno di settimane: oltre il tetto il tasto si spegne e non aggiunge', async () => {
      const { c, aggiorna, qa, riga } = await monta(p => { p.workout.weekPlan = Array.from({ length: SETTIMANE_MAX - 1 }, () => ({ sets: 3, reps: 10 })); });
      riga().click();
      await aggiorna();
      const aggiungi = () => qa('.progressione-programma ion-button.azione-riquadro')[0];
      expect((aggiungi() as any).disabled).toBeFalsy();
      c.addSettimanaProgramma();
      await aggiorna();
      expect(c.protocol!.workout.weekPlan).toHaveLength(SETTIMANE_MAX);
      expect((aggiungi() as any).disabled).toBe(true);
      c.addSettimanaProgramma();
      expect(c.protocol!.workout.weekPlan).toHaveLength(SETTIMANE_MAX);
    });

    it('le settimane hanno un nome per chi non vede lo schermo, e la freccia si gira (CSS)', async () => {
      const { aggiorna, qa, riga } = await monta();
      riga().click();
      await aggiorna();
      // Ionic sposta il nome dal campo all'<input> dentro (nel suo DOM, o nel suo shadow DOM).
      const nomi = (sel: string) => qa(sel).map(e => e.getAttribute('aria-label')
        ?? e.querySelector('input')?.getAttribute('aria-label') ?? e.shadowRoot?.querySelector('input')?.getAttribute('aria-label') ?? null);
      expect(nomi('.progressione-programma .weekplan-row ion-input[type="number"]')).toEqual(['Serie della settimana 1', 'Serie della settimana 2', 'Serie della settimana 3']);
      expect(nomi('.progressione-programma .weekplan-row ion-input[type="text"]')).toEqual(['Ripetizioni della settimana 1', 'Ripetizioni della settimana 2', 'Ripetizioni della settimana 3']);

      const nome = 'node:fs';
      const fs = await import(/* @vite-ignore */ nome);
      const css: string = fs.readFileSync('src/styles.css', 'utf8');
      expect(css).toContain('.liste-ios ion-item.riga-progressione.aperta app-icona{transform:rotate(180deg);}');
      expect(css).toContain('@media (prefers-reduced-motion: reduce){.liste-ios ion-item.riga-progressione app-icona{transition:none;}}');
    });
  });

  describe('aprendo il protocollo', () => {
    it('un esercizio che ha una copia della progressione del programma la segue; gli altri restano come sono', async () => {
      const { c } = await monta();
      const [panca, croci, dip] = c.protocol!.workout.days[0].ex;
      expect(panca.weekPlan).toBeUndefined();
      expect(croci.weekPlan).toEqual([{ sets: 3, reps: 12 }, { sets: 3, reps: 12 }, { sets: 3, reps: 12 }]);
      expect(dip.weekPlan).toBeUndefined();
    });

    it('e questo non e\' una modifica da salvare: chi apre e basta non si sente chiedere se scartare', async () => {
      const { c } = await monta();
      expect(c.haModificheNonSalvate()).toBe(false);
    });

    it('cambiando il programma, gli esercizi che lo seguono cambiano con lui: nessuna copia rimasta indietro', async () => {
      const { c } = await monta();
      c.protocol!.workout.weekPlan = [{ sets: 5, reps: 5 }, { sets: 5, reps: 5 }];
      const { workout } = c.protocol!;
      const segue = workout.days[0].ex.filter(e => c.segueProgramma(e)).map(e => e.name);
      expect(segue).toEqual(['Panca', 'Dip']);
      // Il runtime usa il programma per chi non ha una sua progressione (vedi WorkoutDataService.getExSetsReps).
      expect(workout.weekPlan[0]).toEqual({ sets: 5, reps: 5 });
    });

    it('un protocollo senza esercizi a onda si apre senza toccare niente', async () => {
      const { c } = await monta(p => { p.workout.days[0].ex.forEach(e => { e.scheme = 'plain'; }); });
      expect(c.protocol!.workout.days[0].ex.map(e => !!e.weekPlan)).toEqual([true, true, false]);
      expect(c.haModificheNonSalvate()).toBe(false);
    });
  });
});
