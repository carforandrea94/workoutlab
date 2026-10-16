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

@Component({ standalone: true, template: '' })
class ElencoProtocolli {}

/**
 * Gli esercizi di un giorno si riordinano solo nel builder, in un modo a parte
 * ("Riordina" / "Fine", come Modifica su iOS): la riga in modo normale apre
 * l'esercizio, e una maniglia dentro un pulsante sarebbe un pulsante dentro un
 * pulsante. Qui si monta il template vero.
 */
describe('ProtocolloBuilderComponent — riordinare gli esercizi di un giorno', () => {
  const nomi4 = ['Panca piana', 'Croci', 'Dip', 'Pushdown'];

  function protocollo(): Protocol {
    const ex = (name: string, extra: object = {}) => ({ name, scheme: 'plain', sets: 3, muscle: 'Petto', reps: ['10', '10', '10'], ...extra });
    return {
      id: 'proto1', userId: 'user1', name: 'Protocollo test', status: 'draft', source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        weekPlan: [{ sets: 4, reps: 10 }],
        days: [
          { id: 'day1', label: 'Petto', rec: '90"', ex: nomi4.map((n, i) => ex(n, i === 0 ? { note: 'ultima serie in strip' } : {})) },
          { id: 'day2', label: 'Gambe', rec: '90"', ex: [ex('Squat', { muscle: 'Gambe' })] },
          { id: 'day3', label: 'Vuoto', rec: '90"', ex: [] }
        ]
      },
      diet: [], infoNote: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } as any;
  }

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: any) { this.scrollTop = o?.top ?? 0; } as any;
    HTMLElement.prototype.scrollIntoView = function () {} as any;
  });

  async function monta(giorno = 0) {
    const protocolSvc = {
      changed$: new Subject<void>(),
      get: vi.fn(async () => structuredClone(protocollo())),
      update: vi.fn(async (_id: string, _patch: any) => {}),
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
    c.openDay(c.protocol!.workout.days[giorno], giorno);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const aggiorna = () => fixture.detectChanges();
    const tastoRiordina = () => root.querySelector<HTMLElement>('ion-button.riordina-btn');
    const maniglie = () => Array.from(root.querySelectorAll<HTMLElement>('button.riordina-presa'));
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.grouplist > ion-item'));
    const nomiInPagina = () => righe().map(r => r.querySelector('.lbl')?.textContent?.trim());
    const numeriInPagina = () => righe().map(r => r.querySelector('.badge')?.textContent?.trim());
    const ordine = () => c.editingDay!.day.ex.map(e => e.name);
    const annuncio = () => root.querySelector('.sr-only[aria-live]')?.textContent?.trim();
    const riordina = () => { tastoRiordina()!.click(); aggiorna(); };
    const freccia = (indice: number, key: 'ArrowUp' | 'ArrowDown') => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      maniglie()[indice].dispatchEvent(ev);
      aggiorna();
      return ev;
    };
    return { fixture, c, root, aggiorna, tastoRiordina, maniglie, righe, nomiInPagina, numeriInPagina, ordine, annuncio, riordina, freccia, protocolSvc };
  }

  describe('il tasto', () => {
    it('con piu\' esercizi c\'e\' e dice "Riordina"', async () => {
      const { tastoRiordina } = await monta(0);
      expect(tastoRiordina()?.textContent?.trim()).toBe('Riordina');
    });

    it('con un esercizio solo non c\'e\': non c\'e\' niente da riordinare', async () => {
      const { tastoRiordina } = await monta(1);
      expect(tastoRiordina()).toBeNull();
    });

    it('con nessun esercizio non c\'e\'', async () => {
      const { tastoRiordina } = await monta(2);
      expect(tastoRiordina()).toBeNull();
    });

    it('in modo normale le righe si aprono e non ci sono maniglie', async () => {
      const { maniglie, righe, root } = await monta(0);
      expect(maniglie()).toHaveLength(0);
      expect(righe()).toHaveLength(4);
      expect(root.textContent).toContain('+ Aggiungi esercizio');
      expect(righe().every(r => r.classList.contains('press-fx'))).toBe(true);
      expect(righe().every(r => (r as any).button === true)).toBe(true);
    });
  });

  describe('nel modo Riordina', () => {
    it('il tasto diventa "Fine" e ogni riga ha la sua maniglia, col nome dell\'esercizio', async () => {
      const { tastoRiordina, maniglie, riordina } = await monta(0);
      riordina();
      expect(tastoRiordina()?.textContent?.trim()).toBe('Fine');
      expect(maniglie().map(m => m.getAttribute('aria-label'))).toEqual(nomi4.map(n => `Sposta ${n}`));
    });

    it('la maniglia e\' un pulsante vero, descritto dall\'aiuto visibile', async () => {
      const { maniglie, riordina, root } = await monta(0);
      riordina();
      const m = maniglie()[0];
      expect(m.tagName).toBe('BUTTON');
      expect(m.getAttribute('type')).toBe('button');
      const aiuto = root.querySelector('#riordina-aiuto');
      expect(m.getAttribute('aria-describedby')).toBe('riordina-aiuto');
      expect(aiuto?.textContent).toContain('frecce su e giù');
    });

    it('le righe non sono pulsanti e non si abbassano al tocco: la presa e\' la maniglia', async () => {
      const { righe, riordina } = await monta(0);
      riordina();
      expect(righe().every(r => (r as any).button === false)).toBe(true);
      expect(righe().some(r => r.classList.contains('press-fx'))).toBe(false);
    });

    it('"Aggiungi esercizio" sparisce: aprirebbe l\'editor in mezzo al riordino', async () => {
      const { root, riordina } = await monta(0);
      riordina();
      expect(root.textContent).not.toContain('+ Aggiungi esercizio');
    });

    it('toccare una riga non apre l\'esercizio', async () => {
      const { c, righe, riordina, aggiorna } = await monta(0);
      riordina();
      righe()[1].click();
      aggiorna();
      expect(c.editingExercise).toBeNull();
    });

    it('c\'e\' una regione per chi non vede lo schermo, cortese (polite)', async () => {
      const { root, riordina } = await monta(0);
      riordina();
      const live = root.querySelector('.sr-only[aria-live]');
      expect(live?.getAttribute('aria-live')).toBe('polite');
      expect(live?.getAttribute('aria-atomic')).toBe('true');
    });

    it('"Fine" riporta tutto com\'era: righe che si aprono, niente maniglie, "Aggiungi" di nuovo', async () => {
      const { c, tastoRiordina, maniglie, righe, root, riordina, aggiorna } = await monta(0);
      riordina();
      riordina();
      expect(tastoRiordina()?.textContent?.trim()).toBe('Riordina');
      expect(maniglie()).toHaveLength(0);
      expect(root.textContent).toContain('+ Aggiungi esercizio');
      righe()[2].click();
      aggiorna();
      expect(c.editingExercise?.ex.name).toBe('Dip');
    });
  });

  describe('dalla tastiera', () => {
    it('freccia giu\' porta l\'esercizio un posto sotto: l\'ordine, i numeri e le righe seguono', async () => {
      const { c, riordina, freccia, ordine, nomiInPagina, numeriInPagina } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      expect(ordine()).toEqual(['Croci', 'Panca piana', 'Dip', 'Pushdown']);
      expect(nomiInPagina()).toEqual(['Croci', 'Panca piana', 'Dip', 'Pushdown']);
      // Il numero e' quello che il cliente vede: segue la posizione, non l'esercizio.
      expect(numeriInPagina()).toEqual(['1', '2', '3', '4']);
      expect(c.protocol!.workout.days[0].ex.map(e => e.name)).toEqual(ordine());
    });

    it('freccia su lo porta un posto sopra', async () => {
      const { riordina, freccia, ordine } = await monta(0);
      riordina();
      freccia(2, 'ArrowUp');
      expect(ordine()).toEqual(['Panca piana', 'Dip', 'Croci', 'Pushdown']);
    });

    it('la freccia non scorre la pagina', async () => {
      const { riordina, freccia } = await monta(0);
      riordina();
      expect(freccia(1, 'ArrowDown').defaultPrevented).toBe(true);
    });

    it('al bordo non succede niente, ma la pagina non scorre lo stesso', async () => {
      const { riordina, freccia, ordine, annuncio } = await monta(0);
      riordina();
      const su = freccia(0, 'ArrowUp');
      const giu = freccia(3, 'ArrowDown');
      expect(ordine()).toEqual(nomi4);
      expect(su.defaultPrevented).toBe(true);
      expect(giu.defaultPrevented).toBe(true);
      expect(annuncio()).toBe('');
    });

    it('dice dove e\' finito, per chi non vede lo schermo', async () => {
      const { riordina, freccia, annuncio } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      expect(annuncio()).toBe('Panca piana: posizione 2 di 4');
      freccia(1, 'ArrowDown');
      expect(annuncio()).toBe('Panca piana: posizione 3 di 4');
    });

    it('il focus resta sulla maniglia dell\'esercizio spostato, anche se il suo elemento e\' cambiato di posto', async () => {
      const { c, root, riordina, maniglie, aggiorna } = await monta(0);
      riordina();
      document.body.appendChild(root);   // il focus c'e' solo su elementi in pagina
      try {
        const prima = maniglie()[0];
        prima.focus();
        expect(document.activeElement).toBe(prima);
        const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
        prima.dispatchEvent(ev);
        aggiorna();
        // Spostando il nodo il browser perde il focus: qui lo si controlla dopo la riassegnazione.
        expect(document.activeElement).toBe(prima);
        expect(prima.getAttribute('aria-label')).toBe('Sposta Panca piana');
        expect(c.editingDay!.day.ex[1].name).toBe('Panca piana');
      } finally {
        root.remove();
      }
    });

    it('si puo\' proseguire: tre frecce giu\' di fila portano la prima in fondo', async () => {
      const { riordina, freccia, ordine } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown'); freccia(1, 'ArrowDown'); freccia(2, 'ArrowDown');
      expect(ordine()).toEqual(['Croci', 'Dip', 'Pushdown', 'Panca piana']);
    });
  });

  describe('trascinando', () => {
    it('lasciare l\'esercizio in un altro posto lo sposta, e l\'ordine segue', async () => {
      const { c, riordina, ordine, nomiInPagina, aggiorna } = await monta(0);
      riordina();
      c.rilasciaEsercizio(c.editingDay!.day, { previousIndex: 0, currentIndex: 2 } as any);
      aggiorna();
      expect(ordine()).toEqual(['Croci', 'Dip', 'Panca piana', 'Pushdown']);
      expect(nomiInPagina()).toEqual(['Croci', 'Dip', 'Panca piana', 'Pushdown']);
    });

    it('lasciarlo dove era non cambia niente e non annuncia niente', async () => {
      const { c, riordina, ordine, annuncio, aggiorna } = await monta(0);
      riordina();
      c.rilasciaEsercizio(c.editingDay!.day, { previousIndex: 1, currentIndex: 1 } as any);
      aggiorna();
      expect(ordine()).toEqual(nomi4);
      expect(annuncio()).toBe('');
    });

    it('annuncia anche il trascinamento', async () => {
      const { c, riordina, annuncio, aggiorna } = await monta(0);
      riordina();
      c.rilasciaEsercizio(c.editingDay!.day, { previousIndex: 3, currentIndex: 0 } as any);
      aggiorna();
      expect(annuncio()).toBe('Pushdown: posizione 1 di 4');
    });
  });

  describe('cosa si porta dietro l\'esercizio', () => {
    it('e\' lo stesso esercizio, con le sue note e il suo schema: si sposta, non si ricrea', async () => {
      const { c, riordina, freccia } = await monta(0);
      const originale = c.editingDay!.day.ex[0];
      riordina();
      freccia(0, 'ArrowDown');
      const spostato = c.editingDay!.day.ex[1];
      expect(spostato).toBe(originale);
      expect(spostato.note).toBe('ultima serie in strip');
    });

    it('gli altri giorni non si toccano', async () => {
      const { c, riordina, freccia } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      expect(c.protocol!.workout.days[1].ex.map(e => e.name)).toEqual(['Squat']);
    });
  });

  describe('uscire dal giorno', () => {
    it('chiudere il giorno spegne il modo: rientrando le righe si aprono', async () => {
      const { c, riordina, aggiorna } = await monta(0);
      riordina();
      expect(c.riordinando).toBe(true);
      c.closeDay();
      aggiorna();
      c.openDay(c.protocol!.workout.days[0], 0);
      aggiorna();
      expect(c.riordinando).toBe(false);
    });

    it('aprire un altro giorno non eredita il modo', async () => {
      const { c, riordina, aggiorna } = await monta(0);
      riordina();
      c.openDay(c.protocol!.workout.days[1], 1);
      aggiorna();
      expect(c.riordinando).toBe(false);
    });

    it('l\'annuncio non resta da un giorno all\'altro', async () => {
      const { c, riordina, freccia, aggiorna } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      expect(c.annuncioRiordino).not.toBe('');
      c.closeDay();
      aggiorna();
      expect(c.annuncioRiordino).toBe('');
    });
  });

  describe('salvare', () => {
    it('riordinare e\' una modifica non salvata: la guardia chiede prima di buttarla', async () => {
      const { c, riordina, freccia } = await monta(0);
      expect(c.haModificheNonSalvate()).toBe(false);
      riordina();
      freccia(0, 'ArrowDown');
      expect(c.haModificheNonSalvate()).toBe(true);
    });

    it('"Salva giorno" scrive il nuovo ordine, e il modo si chiude', async () => {
      const { c, riordina, freccia, protocolSvc } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      freccia(1, 'ArrowDown');

      await c.saveDay();

      expect(protocolSvc.update).toHaveBeenCalledTimes(1);
      const scritto = protocolSvc.update.mock.calls[0][1];
      expect(scritto.workout.days[0].ex.map((e: any) => e.name)).toEqual(['Croci', 'Dip', 'Panca piana', 'Pushdown']);
      expect(c.riordinando).toBe(false);
      expect(c.editingDay).toBeNull();
    });

    it('riordinare e tornare allo stato di prima non e\' una modifica', async () => {
      const { c, riordina, freccia } = await monta(0);
      riordina();
      freccia(0, 'ArrowDown');
      freccia(1, 'ArrowUp');
      expect(c.haModificheNonSalvate()).toBe(false);
    });
  });
});
