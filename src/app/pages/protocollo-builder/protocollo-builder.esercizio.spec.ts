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
import { ToastService } from '../../services/toast.service';
import { Protocol } from '../../models/protocol.model';
import { clusterLabel } from '../../core/utils/cluster.util';

@Component({ standalone: true, template: '' })
class ElencoProtocolli {}

/**
 * Inserire un esercizio: ogni informazione in un posto solo. Il nome dice il
 * gruppo muscolare, "Serie" e "Ripetizioni" sono due contatori (e non un numero
 * piu' un elenco che lo ripete), niente "Testo" che le riscrive, e il
 * nuovo esercizio parte come quello che lo precede. Qui si monta il template vero.
 */
describe('ProtocolloBuilderComponent — inserire un esercizio', () => {
  function protocollo(): Protocol {
    const ex = (name: string, extra: object = {}) => ({ name, scheme: 'plain', sets: 3, muscle: 'Petto', reps: ['10', '10', '10'], ...extra });
    return {
      id: 'proto1', userId: 'user1', name: 'Protocollo test', status: 'draft', source: 'pdf',
      workout: {
        programStart: '2026-01-01',
        weekPlan: [{ sets: 3, reps: '6-8' }, { sets: 4, reps: 10 }],
        days: [
          { id: 'day1', label: 'Petto', rec: '90"', ex: [
            ex('Panca piana'),
            ex('Croci', { reps: ['12', '10', '8'] }),
            ex('Alzate', { muscle: 'Spalle', reps: ['8-10', '8-10', '8-10'] }),
            ex('Pushdown', { muscle: 'Tricipiti', sets: 2, reps: ['8+30"', '8+30"'], cluster: { blocks: [8], restSec: 30, end: 'open' } }),
            ex('Stacco', { muscle: 'Gambe', sets: 4, reps: ['5', '5', '5', '5'], text: '4x5' })
          ] },
          { id: 'day2', label: 'Vuoto', rec: '90"', ex: [] },
          { id: 'day3', label: 'Onda', rec: '90"', ex: [
            ex('Rematore', { muscle: 'Dorso', scheme: 'wave', sets: 4, reps: ['10', '10', '10', '10'], weekPlan: [{ sets: 4, reps: 10 }] })
          ] }
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

  async function monta() {
    const protocolSvc = {
      changed$: new Subject<void>(),
      get: vi.fn(async () => structuredClone(protocollo())),
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
    // Senza zone, un metodo chiamato a mano dal test non segna la vista da ridisegnare (un evento vero si').
    const aggiorna = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable(); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); };
    const giorno = (i: number) => c.protocol!.workout.days[i];
    const apriNuovo = async (g = 0) => { c.openDay(giorno(g), g); c.addExercise(giorno(g)); await aggiorna(); };
    const apriEsistente = async (g: number, e: number) => { c.openDay(giorno(g), g); c.editExercise(giorno(g), giorno(g).ex[e]); await aggiorna(); };
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const qa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** I due contatori: il primo e' Serie, il secondo Ripetizioni. */
    const contatori = () => qa('.contatore ion-input.contatore-valore') as (HTMLElement & { value?: unknown })[];
    const pulsante = (n: number) => qa('ion-button.contatore-btn')[n];
    const toast = TestBed.inject(ToastService);
    const scrivi = (el: HTMLElement, valore: unknown) => el.dispatchEvent(new CustomEvent('ionChange', { detail: { value: valore } }));
    return { c, fixture, root, aggiorna, giorno, apriNuovo, apriEsistente, q, qa, testo, contatori, pulsante, scrivi, toast };
  }

  describe('i campi: ognuno dice una cosa sola', () => {
    it('niente "Testo" ne\' "Schema": nome, gruppo, serie, ripetizioni, tipo di serie e nota', async () => {
      const { apriNuovo, q, qa, testo } = await monta();
      await apriNuovo();
      const etichette = qa('ion-list.campi ion-input, ion-list.campi ion-select').map(e => e.getAttribute('label') ?? (e as any).label).filter(Boolean);
      expect(etichette).toEqual(['Nome', 'Gruppo muscolare', 'Tipo di serie', 'Nota']);
      expect(testo(q('.liste-ios'))).not.toContain('Testo');
      expect(testo(q('.liste-ios'))).not.toContain('Schema');
      // Serie e Ripetizioni sono righe con il loro contatore.
      expect(qa('ion-list.campi ion-item ion-label').map(testo)).toEqual(expect.arrayContaining(['Serie', 'Ripetizioni']));
    });

    it('il nuovo esercizio parte con 3 serie da 10 e le righe per serie non ci sono', async () => {
      const { apriNuovo, contatori, qa } = await monta();
      await apriNuovo(1);                       // un giorno vuoto: niente da copiare
      expect(contatori().map(i => String(i.value))).toEqual(['3', '10']);
      expect(qa('ion-input.a-destra')).toHaveLength(0);
    });

    it('il segmento sceglie fra "Sempre uguali" e "Wave", e dice cosa vuol dire', async () => {
      const { apriNuovo, q, qa, testo } = await monta();
      await apriNuovo(1);
      expect(qa('ion-segment-button').map(testo)).toEqual(['Sempre uguali', 'Wave']);
      expect((q('ion-segment') as any).value).toBe('plain');
      expect(testo(q('.nota-sotto'))).toBe('Serie e ripetizioni sono le stesse ogni settimana.');
    });
  });

  describe('il nuovo esercizio parte come quello che lo precede', () => {
    it('serie, ripetizioni e gruppo di quello prima, nome vuoto', async () => {
      const { apriNuovo, contatori, q } = await monta();
      await apriNuovo();                        // l'ultimo del giorno e' "Stacco": 4 x 5, Gambe
      expect(contatori().map(i => String(i.value))).toEqual(['4', '5']);
      expect((q('ion-select[label="Gruppo muscolare"]') as any).value).toBe('Gambe');
      expect((q('ion-input[label="Nome"]') as any).value).toBe('');
    });

    it('anche "Salva e aggiungi un altro" porta con se\' serie, ripetizioni e gruppo', async () => {
      const { c, apriNuovo, aggiorna, giorno, q, qa, contatori, scrivi, pulsante, toast } = await monta();
      const successo = vi.spyOn(toast, 'success').mockImplementation(() => {});
      giorno(0).ex.length = 0;
      await apriNuovo();
      c.onNomeChange(c.editingExercise!, 'Lat machine');
      pulsante(1).click();                       // 4 serie
      await aggiorna();
      scrivi(contatori()[0], 5);                 // e poi 5, scritto a mano
      await aggiorna();
      const riga = qa('ion-item.riga-azione').find(i => i.textContent!.includes('Salva e aggiungi un altro'))!;
      riga.click();
      await aggiorna();

      expect(giorno(0).ex.map(e => e.name)).toEqual(['Lat machine']);
      expect(giorno(0).ex[0]).toMatchObject({ sets: 5, muscle: 'Dorso' });
      expect(successo).toHaveBeenCalledWith('Lat machine aggiunto ✓');
      expect(c.editingExercise!.isNew).toBe(true);
      expect((q('ion-input[label="Nome"]') as any).value).toBe('');
      expect(contatori().map(i => String(i.value))).toEqual(['5', '10']);
      expect((q('ion-select[label="Gruppo muscolare"]') as any).value).toBe('Dorso');
    });

    it('"Salva e aggiungi un altro" non c\'e\' per un esercizio che c\'e\' gia\', e senza nome non fa niente', async () => {
      const { c, apriEsistente, apriNuovo, qa, giorno, aggiorna } = await monta();
      await apriEsistente(0, 0);
      expect(qa('ion-item.riga-azione')).toHaveLength(0);

      await apriNuovo();
      const riga = qa('ion-item.riga-azione').find(i => i.textContent!.includes('Salva e aggiungi un altro'))!;
      expect(riga).toBeTruthy();
      expect(riga.hasAttribute('disabled') || (riga as any).disabled).toBe(true);
      const prima = giorno(0).ex.length;
      c.saveExerciseAndAddAnother();
      await aggiorna();
      expect(giorno(0).ex.length).toBe(prima);
    });
  });

  describe('il nome dice il gruppo muscolare', () => {
    it('scrivendo il nome il gruppo segue, finche\' non lo si sceglie a mano', async () => {
      const { c, apriNuovo, aggiorna, q } = await monta();
      await apriNuovo(1);
      const ee = c.editingExercise!;
      c.onNomeChange(ee, 'Squat');
      await aggiorna();
      expect((q('ion-select[label="Gruppo muscolare"]') as any).value).toBe('Gambe');
      c.onNomeChange(ee, 'Squat bulgaro con manubri');
      expect(ee.ex.muscle).toBe('Gambe');

      c.scegliMuscolo(ee, 'Core');
      c.onNomeChange(ee, 'Lat machine');
      expect(ee.ex.muscle).toBe('Core');
      expect(ee.ex.name).toBe('Lat machine');
    });

    it('un nome che non dice niente lascia il gruppo com\'e\'', async () => {
      const { c, apriNuovo } = await monta();
      await apriNuovo(1);
      const ee = c.editingExercise!;
      c.onNomeChange(ee, 'Squat');
      c.onNomeChange(ee, 'Esercizio misterioso');
      expect(ee.ex.muscle).toBe('Gambe');
    });

    it('un esercizio gia\' scritto non cambia gruppo se si corregge il nome', async () => {
      const { c, apriEsistente } = await monta();
      await apriEsistente(0, 0);                // Panca piana, Petto
      c.editingExercise!.ex.muscle = 'Spalle';  // scelto dal coach
      c.onNomeChange(c.editingExercise!, 'Squat frontale');
      expect(c.editingExercise!.ex.muscle).toBe('Spalle');
    });
  });

  describe('serie e ripetizioni: due contatori', () => {
    it('i pulsanti − e + cambiano le serie, e il campo si aggiorna', async () => {
      const { apriEsistente, pulsante, contatori, aggiorna, giorno } = await monta();
      await apriEsistente(0, 0);                // 3 x 10
      pulsante(1).click(); await aggiorna();
      pulsante(1).click(); await aggiorna();
      expect(giorno(0).ex[0].sets).toBe(5);
      expect(giorno(0).ex[0].reps).toEqual(['10', '10', '10', '10', '10']);
      expect(String(contatori()[0].value)).toBe('5');
      pulsante(0).click(); await aggiorna();
      expect(giorno(0).ex[0].sets).toBe(4);
      expect(giorno(0).ex[0].reps).toHaveLength(4);
    });

    it('con una serie sola il meno si spegne, e al tetto si spegne il piu\'', async () => {
      const { c, apriEsistente, pulsante, aggiorna, giorno } = await monta();
      await apriEsistente(0, 0);
      c.onSerie(c.editingExercise!, 1); await aggiorna();
      expect((pulsante(0) as any).disabled).toBe(true);
      expect((pulsante(1) as any).disabled).toBeFalsy();
      c.onSerie(c.editingExercise!, c.serieMax); await aggiorna();
      expect((pulsante(1) as any).disabled).toBe(true);
      expect(giorno(0).ex[0].sets).toBe(c.serieMax);
    });

    it('i pulsanti delle ripetizioni fanno un passo per volta, per tutte le serie', async () => {
      const { apriEsistente, pulsante, contatori, aggiorna, giorno } = await monta();
      await apriEsistente(0, 0);
      pulsante(3).click(); await aggiorna();
      pulsante(3).click(); await aggiorna();
      expect(giorno(0).ex[0].reps).toEqual(['12', '12', '12']);
      expect((contatori()[1] as any).value).toBe('12');
      pulsante(2).click(); await aggiorna();
      expect(giorno(0).ex[0].reps).toEqual(['11', '11', '11']);
    });

    it('un intervallo come "8-10" si legge, si scrive, e i pulsanti si spengono', async () => {
      const { apriEsistente, pulsante, contatori, aggiorna, giorno, c } = await monta();
      await apriEsistente(0, 2);                // Alzate: 3 x 8-10
      expect((contatori()[1] as any).value).toBe('8-10');
      expect((pulsante(2) as any).disabled).toBe(true);
      expect((pulsante(3) as any).disabled).toBe(true);
      c.onRipetizioniUguali(giorno(0).ex[2], '6-8');
      await aggiorna();
      expect(giorno(0).ex[2].reps).toEqual(['6-8', '6-8', '6-8']);
    });

    it('il numero di serie si scrive a mano e si conferma uscendo dal campo; un campo vuoto torna a un valore valido', async () => {
      const { apriEsistente, contatori, scrivi, aggiorna, giorno } = await monta();
      await apriEsistente(0, 0);
      scrivi(contatori()[0], '6');
      await aggiorna();
      expect(giorno(0).ex[0].sets).toBe(6);
      scrivi(contatori()[0], '');
      await aggiorna();
      expect(giorno(0).ex[0].sets).toBe(1);
      expect(String(contatori()[0].value)).toBe('1');
    });

    it('un campo cancellato e confermato col numero gia\' a 1 torna a mostrare 1: il campo non lo sa da solo', async () => {
      const { c, apriEsistente, contatori, scrivi, aggiorna, giorno } = await monta();
      await apriEsistente(0, 0);
      c.onSerie(c.editingExercise!, 1);
      await aggiorna();
      const campo = contatori()[0];
      // Chi scrive svuota il campo e esce: il campo contiene '', il modello e' ancora 1.
      campo.value = '';
      scrivi(campo, '');
      await aggiorna();
      expect(giorno(0).ex[0].sets).toBe(1);
      expect(String(campo.value)).toBe('1');
    });

    it('con un cluster le ripetizioni sono quelle dei blocchi: niente contatore di ripetizioni ne\' interruttore', async () => {
      const { apriEsistente, contatori, qa, testo } = await monta();
      await apriEsistente(0, 3);                // Pushdown, cluster a esaurimento
      expect(contatori()).toHaveLength(1);      // solo Serie
      expect(qa('ion-toggle')).toHaveLength(0);
      expect(qa('ion-list.campi ion-item ion-label').map(testo)).not.toContain('Ripetizioni');
      expect(qa('.clusterbox')).toHaveLength(1);
    });

    it('cambiando le serie di un cluster le ripetizioni restano il riassunto dei blocchi', async () => {
      const { c, apriEsistente, giorno } = await monta();
      await apriEsistente(0, 3);
      const riassunto = giorno(0).ex[3].reps![0];
      c.onSerie(c.editingExercise!, 4);
      expect(giorno(0).ex[3].sets).toBe(4);
      expect(giorno(0).ex[3].reps).toEqual([riassunto, riassunto, riassunto, riassunto]);
    });

    it('cambiando le serie di un cluster le ripetizioni tornano a essere il riassunto dei blocchi, anche se erano scritte altro', async () => {
      const { c, apriEsistente, giorno } = await monta();
      giorno(0).ex[3].reps = ['vecchio', 'vecchio'];
      await apriEsistente(0, 3);
      c.onSerie(c.editingExercise!, 4);
      const riassunto = clusterLabel(giorno(0).ex[3].cluster!);
      expect(giorno(0).ex[3].reps).toEqual([riassunto, riassunto, riassunto, riassunto]);
    });

    it('un cluster con ripetizioni scritte diverse non apre le righe per serie: le ripetizioni sono quelle dei blocchi', async () => {
      const { c, apriEsistente, giorno, qa } = await monta();
      giorno(0).ex[3].reps = ['8+30"', '6+30"'];
      await apriEsistente(0, 3);
      expect(c.editingExercise!.diverse).toBe(false);
      expect(qa('ion-input.a-destra')).toHaveLength(0);
    });

    it('tornando da cluster a serie normali le ripetizioni tornano a 10, non restano il riassunto', async () => {
      const { c, apriEsistente, giorno, aggiorna } = await monta();
      await apriEsistente(0, 3);
      c.setSerieType(giorno(0).ex[3], 'normale');
      await aggiorna();
      expect(giorno(0).ex[3].cluster).toBeUndefined();
      expect(giorno(0).ex[3].reps).toEqual(['10', '10']);
      expect(c.editingExercise!.diverse).toBe(false);
    });
  });

  describe('ripetizioni diverse per serie', () => {
    it('se le serie sono gia\' diverse si apre da solo, una riga per serie', async () => {
      const { apriEsistente, qa, contatori, q } = await monta();
      await apriEsistente(0, 1);                // Croci: 12, 10, 8
      expect(qa('ion-input.a-destra').map(i => (i as any).value)).toEqual(['12', '10', '8']);
      expect(qa('ion-input.a-destra').map(i => (i as any).label)).toEqual(['Serie 1', 'Serie 2', 'Serie 3']);
      expect((q('ion-toggle') as any).checked).toBe(true);
      // Il contatore delle ripetizioni non c'e': sarebbe una seconda risposta alla stessa domanda.
      expect(contatori()).toHaveLength(1);
    });

    it('accendendolo ogni serie ha le ripetizioni di prima, scrivibili una per una', async () => {
      const { c, apriEsistente, aggiorna, qa, giorno } = await monta();
      await apriEsistente(0, 0);                // 3 x 10
      const toggle = qa('ion-toggle')[0];
      toggle.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: true } }));
      await aggiorna();
      expect(c.editingExercise!.diverse).toBe(true);
      expect(qa('ion-input.a-destra')).toHaveLength(3);
      c.onRepSerie(giorno(0).ex[0], 1, '8');
      c.onRepSerie(giorno(0).ex[0], 2, ' 6 ');
      expect(giorno(0).ex[0].reps).toEqual(['10', '8', '6']);
    });

    it('con le righe aperte il contatore delle serie aggiunge e toglie righe, copiando l\'ultima', async () => {
      const { apriEsistente, pulsante, aggiorna, qa, giorno } = await monta();
      await apriEsistente(0, 1);                // 12, 10, 8
      pulsante(1).click(); await aggiorna();
      expect(giorno(0).ex[1].reps).toEqual(['12', '10', '8', '8']);
      expect(qa('ion-input.a-destra')).toHaveLength(4);
      pulsante(0).click(); pulsante(0).click(); await aggiorna();
      expect(giorno(0).ex[1].reps).toEqual(['12', '10']);
    });

    it('spegnendolo tutte le serie prendono le ripetizioni della prima', async () => {
      const { c, apriEsistente, aggiorna, qa, giorno, contatori } = await monta();
      await apriEsistente(0, 1);                // 12, 10, 8
      qa('ion-toggle')[0].dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false } }));
      await aggiorna();
      expect(c.editingExercise!.diverse).toBe(false);
      expect(giorno(0).ex[1].reps).toEqual(['12', '12', '12']);
      expect(qa('ion-input.a-destra')).toHaveLength(0);
      expect((contatori()[1] as any).value).toBe('12');
    });

    it('scrivere una serie non fa perdere il cursore: le righe non si ricostruiscono', async () => {
      const { apriEsistente, aggiorna, qa, c, giorno } = await monta();
      await apriEsistente(0, 1);
      const prima = qa('ion-input.a-destra');
      c.onRepSerie(giorno(0).ex[1], 0, '15');
      await aggiorna();
      const dopo = qa('ion-input.a-destra');
      expect(dopo[0]).toBe(prima[0]);
      expect(giorno(0).ex[1].reps![0]).toBe('15');
    });
  });

  describe('Wave', () => {
    it('passando a "Wave" l\'esercizio segue la progressione del programma: nessuna copia, e lo dice', async () => {
      const { c, apriNuovo, aggiorna, q, qa, testo } = await monta();
      await apriNuovo(1);
      q('ion-segment')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'wave' } }));
      await aggiorna();
      expect(c.editingExercise!.ex.scheme).toBe('wave');
      expect(c.editingExercise!.ex.weekPlan).toBeUndefined();
      expect(qa('.weekplan-row')).toHaveLength(0);
      expect(testo(q('.progressione-segue h2'))).toBe('Come il programma');
      expect(testo(q('.progressione-segue p'))).toBe('2 settimane · 3×6-8 → 4×10');
      expect(qa('ion-item.riga-azione').map(testo)).toContain('Personalizza per questo esercizio');
      // Niente contatori di serie e ripetizioni: li dice la progressione.
      expect(qa('ion-button.contatore-btn')).toHaveLength(0);
      expect(q('.nota-sotto')!.textContent).toContain('cambiano di settimana in settimana');
    });

    it('"Personalizza" parte da una copia della progressione del programma, e cambiarla non cambia il programma', async () => {
      const { c, apriNuovo, aggiorna, q, qa } = await monta();
      await apriNuovo(1);
      q('ion-segment')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'wave' } }));
      await aggiorna();
      const personalizza = qa('ion-item.riga-azione').find(i => i.textContent!.includes('Personalizza per questo esercizio'))!;
      personalizza.click();
      await aggiorna();
      expect(c.editingExercise!.ex.weekPlan).toEqual([{ sets: 3, reps: '6-8' }, { sets: 4, reps: 10 }]);
      expect(qa('.weekplan-row')).toHaveLength(2);
      expect(c.segueProgramma(c.editingExercise!.ex)).toBe(false);
      c.editingExercise!.ex.weekPlan![0].sets = 9;
      expect(c.protocol!.workout.weekPlan[0].sets).toBe(3);
    });

    it('una progressione sua si vede per settimane, con "Usa quella del programma"', async () => {
      const { apriEsistente, qa, giorno, testo } = await monta();
      await apriEsistente(2, 0);                // Rematore: una settimana sola, diversa da quella del programma
      expect(qa('.weekplan-row')).toHaveLength(1);
      expect(giorno(2).ex[0].weekPlan).toEqual([{ sets: 4, reps: 10 }]);
      expect(qa('ion-item.riga-azione').map(testo)).toContain('Usa quella del programma');
    });

    it('tornare al programma chiede prima, perche\' quella dell\'esercizio si perde', async () => {
      const { c, apriEsistente, giorno } = await monta();
      const confirm = TestBed.inject(ConfirmDialogService).confirm as ReturnType<typeof vi.fn>;
      await apriEsistente(2, 0);
      confirm.mockResolvedValueOnce(false);
      await c.tornaAlProgramma(giorno(2).ex[0]);
      expect(giorno(2).ex[0].weekPlan).toBeDefined();
      expect(confirm).toHaveBeenCalledWith('Usare la progressione del programma? Quella di questo esercizio si perde.', expect.anything());

      confirm.mockResolvedValueOnce(true);
      await c.tornaAlProgramma(giorno(2).ex[0]);
      expect(giorno(2).ex[0].weekPlan).toBeUndefined();
    });

    it('se quella dell\'esercizio e\' uguale al programma si torna senza chiedere: non si perde niente', async () => {
      const { c, apriEsistente, giorno } = await monta();
      const confirm = TestBed.inject(ConfirmDialogService).confirm as ReturnType<typeof vi.fn>;
      confirm.mockClear();
      await apriEsistente(2, 0);
      giorno(2).ex[0].weekPlan = [{ sets: '3' as any, reps: '6-8' }, { sets: 4, reps: ' 10 ' }];
      await c.tornaAlProgramma(giorno(2).ex[0]);
      expect(confirm).not.toHaveBeenCalled();
      expect(giorno(2).ex[0].weekPlan).toBeUndefined();
    });

    it('aggiungere una settimana alla sua copia la fa come l\'ultima; toglierle tutte lo fa tornare al programma', async () => {
      const { c, apriEsistente, aggiorna, giorno, qa } = await monta();
      // L'ultima settimana non e' 4 x 10 (il valore di partenza): la nuova deve essere come lei.
      giorno(2).ex[0].weekPlan = [{ sets: 4, reps: 10 }, { sets: 3, reps: '6-8' }];
      await apriEsistente(2, 0);
      c.addExWeek(giorno(2).ex[0]);
      await aggiorna();
      expect(giorno(2).ex[0].weekPlan).toEqual([{ sets: 4, reps: 10 }, { sets: 3, reps: '6-8' }, { sets: 3, reps: '6-8' }]);
      expect(qa('.weekplan-row')).toHaveLength(3);
      c.removeExWeek(giorno(2).ex[0], 2);
      c.removeExWeek(giorno(2).ex[0], 1);
      c.removeExWeek(giorno(2).ex[0], 0);
      await aggiorna();
      expect(giorno(2).ex[0].weekPlan).toBeUndefined();
      expect(qa('.weekplan-row')).toHaveLength(0);
      expect(c.segueProgramma(giorno(2).ex[0])).toBe(true);
    });

    it('una progressione scritta ma vuota non e\' una progressione: l\'esercizio segue il programma', async () => {
      const { c, giorno } = await monta();
      giorno(2).ex[0].weekPlan = [];
      expect(c.segueProgramma(giorno(2).ex[0])).toBe(true);
      giorno(2).ex[0].weekPlan = [{ sets: 4, reps: 10 }];
      expect(c.segueProgramma(giorno(2).ex[0])).toBe(false);
    });

    it('un esercizio che gia\' seguiva si apre come "Come il programma"', async () => {
      const { apriEsistente, giorno, q, testo } = await monta();
      delete giorno(2).ex[0].weekPlan;
      await apriEsistente(2, 0);
      expect(testo(q('.progressione-segue'))).toContain('Come il programma');
    });

    it('la riga nell\'elenco dice se segue o ha una sua progressione', async () => {
      const { c, giorno } = await monta();
      expect(c.exerciseSummary(giorno(2).ex[0])).toBe('Wave · 1 settimana');
      giorno(2).ex[0].weekPlan = [{ sets: 4, reps: 10 }, { sets: 4, reps: 8 }, { sets: 3, reps: 6 }];
      expect(c.exerciseSummary(giorno(2).ex[0])).toBe('Wave · 3 settimane');
      delete giorno(2).ex[0].weekPlan;
      expect(c.exerciseSummary(giorno(2).ex[0])).toBe('Wave · come il programma');
    });

    it('un esercizio a cluster che passa a "Wave" perde il cluster: la progressione dice gia\' serie e ripetizioni', async () => {
      const { c, apriEsistente, aggiorna, q, giorno } = await monta();
      await apriEsistente(0, 3);                // Pushdown, cluster
      expect(giorno(0).ex[3].cluster).toBeTruthy();
      q('ion-segment')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'wave' } }));
      await aggiorna();
      expect(c.editingExercise!.ex.scheme).toBe('wave');
      expect(giorno(0).ex[3].cluster).toBeUndefined();
    });

    it('tornando a "Sempre uguali" serie e ripetizioni sono quelle di prima', async () => {
      const { c, apriEsistente, aggiorna, q, contatori, giorno } = await monta();
      await apriEsistente(0, 4);                // Stacco: 4 x 5
      q('ion-segment')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'wave' } }));
      await aggiorna();
      q('ion-segment')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'plain' } }));
      await aggiorna();
      expect(c.editingExercise!.ex.scheme).toBe('plain');
      expect(giorno(0).ex[4].reps).toEqual(['5', '5', '5', '5']);
      expect(contatori().map(i => String(i.value))).toEqual(['4', '5']);
    });

    it('un esercizio a onda gia\' scritto tiene la sua progressione', async () => {
      const { apriEsistente, qa, giorno } = await monta();
      await apriEsistente(2, 0);                // Rematore, wave con una settimana
      expect(qa('.weekplan-row')).toHaveLength(1);
      expect(giorno(2).ex[0].weekPlan).toEqual([{ sets: 4, reps: 10 }]);
    });

    it('un cambio di segmento che non cambia niente, o non valido, non tocca l\'esercizio', async () => {
      const { c, apriEsistente } = await monta();
      await apriEsistente(0, 0);
      const ex = c.editingExercise!.ex;
      const prima = structuredClone(ex);
      c.cambiaSchema(ex, new CustomEvent('ionChange', { detail: { value: 'plain' } }));
      c.cambiaSchema(ex, new CustomEvent('ionChange', { detail: { value: 'boh' } }));
      c.cambiaSchema(ex, new CustomEvent('ionChange', { detail: {} }));
      expect(ex).toEqual(prima);
    });
  });

  describe('l\'elenco del giorno', () => {
    it('le serie uguali si dicono una volta sola: "3×10", non "3×10-10-10"', async () => {
      const { c, giorno } = await monta();
      expect(c.exerciseSummary(giorno(0).ex[0])).toBe('3×10');
      expect(c.exerciseSummary(giorno(0).ex[1])).toBe('3×12-10-8');
      expect(c.exerciseSummary(giorno(0).ex[2])).toBe('3×8-10');
    });

    it('nelle righe dell\'elenco del giorno compare il riepilogo nuovo', async () => {
      const { c, fixture, root, giorno } = await monta();
      c.openDay(giorno(0), 0);
      fixture.detectChanges();
      const meta = Array.from(root.querySelectorAll('.meta')).map(m => (m.textContent ?? '').replace(/\s+/g, ' ').trim());
      expect(meta[0]).toBe('Petto · 3×10');
      expect(meta[1]).toBe('Petto · 3×12-10-8');
    });
  });

  describe('un esercizio nuovo e vuoto si scarta senza chiedere', () => {
    it('serie e ripetizioni di partenza non contano come "scritto"', async () => {
      const { c, apriNuovo, giorno } = await monta();
      await apriNuovo();
      const prima = giorno(0).ex.length;
      await c.saliDiUnLivello();
      expect(c.livello).toBe(1);
      expect(giorno(0).ex.length).toBe(prima);
      expect(TestBed.inject(ConfirmDialogService).confirm).not.toHaveBeenCalled();
    });
  });

  describe('lo stile del contatore', () => {
    it('meno, valore, piu\': il valore e\' centrato e largo abbastanza per "8-10"; i pulsanti spenti si vedono spenti (CSS)', async () => {
      const nome = 'node:fs';
      const fs = await import(/* @vite-ignore */ nome);
      const css: string = fs.readFileSync('src/styles.css', 'utf8');
      expect(css).toContain('.liste-ios .contatore{display:flex;align-items:center;gap:2px;margin-inline-start:12px;}');
      expect(css).toContain('.liste-ios ion-input.contatore-valore{width:60px;min-height:36px;--padding-start:0;--padding-end:0;}');
      expect(css).toContain('.liste-ios ion-input.contatore-valore .native-input{text-align:center;font-weight:600;font-variant-numeric:tabular-nums;}');
      expect(css).toContain('.liste-ios .contatore-btn[disabled]{--color:var(--label-3);}');
    });

    it('ogni pulsante ha il bersaglio da 44 punti e un nome per chi non vede lo schermo', async () => {
      const { apriNuovo, qa } = await monta();
      await apriNuovo(1);
      const bottoni = qa('ion-button.contatore-btn');
      expect(bottoni).toHaveLength(4);
      expect(bottoni.every(b => b.classList.contains('tap44'))).toBe(true);
      // Ionic sposta il nome dal pulsante al <button> dentro (nel suo shadow DOM, o nel suo DOM).
      const nomeDi = (b: HTMLElement) => b.getAttribute('aria-label')
        ?? b.shadowRoot?.querySelector('button')?.getAttribute('aria-label')
        ?? b.querySelector('button')?.getAttribute('aria-label') ?? null;
      expect(bottoni.map(nomeDi)).toEqual([
        'Una serie in meno', 'Una serie in più', 'Una ripetizione in meno', 'Una ripetizione in più'
      ]);
      expect(qa('.contatore').map(g => g.getAttribute('aria-label'))).toEqual(['Serie', 'Ripetizioni']);
    });
  });
});
