import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { DietaComponent } from './dieta.component';
import { DietDataService } from '../../services/diet-data.service';
import { AppStateService } from '../../services/app-state.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { GiornoService } from '../../core/giorno.service';
import { CicloDieta } from '../../core/utils/dieta-ciclo.util';

/**
 * La radice della Dieta e' un elenco di piani. Prima ogni card diceva solo
 * "12 alimenti" (e aveva un "+" che non aggiungeva niente): non c'era modo di
 * sapere da li' a che punto si e' con i pasti di oggi.
 */
describe('DietaComponent — le card dei piani', () => {
  const pasto = (id: string) => ({
    id, name: id, combinations: [{ id: id + 'c', label: 'Base', carb: { name: 'Riso', qty: '80 g' }, protein: null, fat: null }],
    alternatives: { carb: [], protein: [], fat: [] }, supplements: []
  });
  const piani = [
    { id: 'p1', name: 'Giorno ON', meals: [pasto('m1'), pasto('m2'), pasto('m3'), pasto('m4')] },
    { id: 'p2', name: 'Giorno OFF', meals: [pasto('m5'), pasto('m6')] }
  ];

  async function monta(stato: { mealsCompletion: any } | 'errore' = { mealsCompletion: null }, ciclo: CicloDieta = { tipo: 'onoff', inizio: null }, diet: any[] = piani) {
    TestBed.configureTestingModule({
      imports: [DietaComponent],
      providers: [
        ...providerPagina(),
        { provide: DietDataService, useValue: { diet, ciclo: signal(ciclo) } },
        { provide: AppStateService, useValue: { load: stato === 'errore' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn(async () => stato) } }
      ]
    });
    const fixture = TestBed.createComponent(DietaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const metaDi = () => Array.from(root.querySelectorAll<HTMLElement>('.diet-card .meta')).map(m => m.textContent!.replace(/\s+/g, ' ').trim());
    const segni = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.diet-card ion-avatar')).map(a =>
      (a.classList.contains('prossimo') ? 'pieno ' : '') + (a.querySelector('app-icona')?.getAttribute('name') ?? a.textContent!.trim()));
    const badge = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.diet-card')).map(c => c.querySelector('ion-badge.stato')?.textContent?.trim() ?? '');
    const nota = () => root.querySelector('.ciclo-nota')?.textContent?.trim() ?? null;
    const intestazione = () => root.querySelector('ion-list-header.sezione .sezione-nota')?.textContent?.trim() ?? null;
    return { fixture, root, metaDi, segni, badge, nota, intestazione };
  }

  it('ogni card dice a che punto e\' con i pasti di oggi, oltre agli alimenti', async () => {
    const { metaDi } = await monta({ mealsCompletion: { date: todayLocalISO(), done: { m1: true, m2: true, m3: false } } });
    expect(metaDi()).toEqual(['2/4 pasti oggi · 4 alimenti', '0/2 pasti oggi · 2 alimenti']);
  });

  it('senza niente di segnato e' + "'" + ' tutto a zero', async () => {
    const { metaDi } = await monta({ mealsCompletion: null });
    expect(metaDi()).toEqual(['0/4 pasti oggi · 4 alimenti', '0/2 pasti oggi · 2 alimenti']);
  });

  it('i pasti segnati un altro giorno non contano: oggi si riparte da zero', async () => {
    const { metaDi } = await monta({ mealsCompletion: { date: '2020-01-01', done: { m1: true, m2: true } } });
    expect(metaDi()[0]).toBe('0/4 pasti oggi · 4 alimenti');
  });

  it('se lo stato non si legge le card restano, senza avanzamento inventato', async () => {
    const { metaDi } = await monta('errore');
    expect(metaDi()).toEqual(['0/4 pasti oggi · 4 alimenti', '0/2 pasti oggi · 2 alimenti']);
  });

  it('in alto a destra lo Storico, poi la lista della spesa', async () => {
    const { root } = await monta();
    const tasti = Array.from(root.querySelectorAll<HTMLElement>('ion-header:not([collapse]) ion-buttons[slot=end] ion-button.navicon'));
    expect(tasti.map(t => [t.getAttribute('routerLink'), t.getAttribute('aria-label'), t.querySelector('app-icona')!.getAttribute('name')])).toEqual([
      ['/dieta/storico', 'Storico', 'time'],
      ['/dieta/lista-spesa', 'Lista della spesa', 'cart']
    ]);
    expect(tasti.every(t => t.getAttribute('routerDirection') === 'forward')).toBe(true);
  });

  it('l\'icona dice "piano alimentare", non "aggiungi"', async () => {
    const { root } = await monta();
    const icone = Array.from(root.querySelectorAll('.diet-card ion-avatar app-icona')).map(i => i.getAttribute('name'));
    expect(icone).toEqual(['restaurant', 'restaurant']);
    // Righe che si aprono: il chevron di iOS lo dice prima del tocco.
    const card = Array.from(root.querySelectorAll<HTMLElement & { button?: boolean; detail?: boolean }>('ion-item.diet-card'));
    expect(card.map(c => [c.button, c.detail])).toEqual([[true, true], [true, true]]);
  });

  it('rientrando sulla pagina si rilegge: dal dettaglio si puo\' aver segnato un pasto', async () => {
    const { fixture, metaDi } = await monta({ mealsCompletion: null });
    const stato = TestBed.inject(AppStateService) as any;
    stato.load.mockResolvedValue({ mealsCompletion: { date: todayLocalISO(), done: { m1: true } } });

    fixture.componentInstance.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(metaDi()[0]).toBe('1/4 pasti oggi · 4 alimenti');
  });

  describe('a mezzanotte', () => {
    afterEach(() => vi.useRealTimers());

    it('con la pagina aperta i pasti di ieri tornano a zero da soli', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 25, 23, 59));
      const { metaDi } = await monta({ mealsCompletion: { date: '2026-10-25', done: { m1: true, m2: true, m5: true } } });
      expect(metaDi()).toEqual(['2/4 pasti oggi · 4 alimenti', '1/2 pasti oggi · 2 alimenti']);

      // Il giorno cambia; nessun tocco, nessuna rilettura, nessun detectChanges.
      vi.setSystemTime(new Date(2026, 9, 26, 0, 0, 1));
      TestBed.inject(GiornoService).controlla();
      expect(metaDi()).toEqual(['0/4 pasti oggi · 4 alimenti', '0/2 pasti oggi · 2 alimenti']);
      expect((TestBed.inject(AppStateService) as any).load).toHaveBeenCalledTimes(1);
    });
  });

  describe('il tipo di dieta', () => {
    afterEach(() => vi.useRealTimers());
    const giorni = [
      { id: 'g1', name: 'Giorno 1', meals: [pasto('a1')] },
      { id: 'g2', name: 'Giorno 2', meals: [pasto('a2')] },
      { id: 'g3', name: 'Giorno 3', meals: [pasto('a3')] }
    ];
    const ciclica = (inizio: string | null): CicloDieta => ({ tipo: 'ciclica', inizio });
    // Lunedi' 26 ottobre 2026.
    const oggi = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 26, 9, 0)); };

    it('ON/OFF: come prima, ogni piano col suo segno e nessuno "di oggi"', async () => {
      oggi();
      const { segni, badge, nota, intestazione } = await monta();
      expect(segni()).toEqual(['restaurant', 'restaurant']);
      expect(badge()).toEqual(['', '']);
      expect(nota()).toBeNull();
      expect(intestazione()).toBeNull();
    });

    it('ciclica: il numero nel ciclo, il piano di oggi pieno col badge, e cosa tocca domani', async () => {
      oggi();
      // Cominciato sabato 24: sabato Giorno 1, domenica Giorno 2, oggi Giorno 3.
      const { segni, badge, nota, intestazione } = await monta(undefined, ciclica('2026-10-24'), giorni);
      expect(segni()).toEqual(['1', '2', 'pieno 3']);
      expect(badge()).toEqual(['', '', 'Oggi']);
      expect(intestazione()).toBe('ciclo di 3 giorni');
      expect(nota()).toBe('Domani si riparte dal primo: Giorno 1.');
    });

    it('a metà ciclo dice il piano di domani', async () => {
      oggi();
      const { badge, nota } = await monta(undefined, ciclica('2026-10-26'), giorni);
      expect(badge()).toEqual(['Oggi', '', '']);
      expect(nota()).toBe('Domani tocca Giorno 2.');
    });

    it('a mezzanotte, a pagina aperta, il piano di oggi passa al successivo da solo', async () => {
      oggi();
      const { badge, nota } = await monta(undefined, ciclica('2026-10-26'), giorni);
      vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1));
      TestBed.inject(GiornoService).controlla();
      expect(badge()).toEqual(['', 'Oggi', '']);
      expect(nota()).toBe('Domani tocca Giorno 3.');
    });

    it('prima del primo giorno nessun piano e\' di oggi, e la riga dice quando comincia', async () => {
      oggi();
      const { segni, badge, nota } = await monta(undefined, ciclica('2026-11-02'), giorni);
      expect(segni()).toEqual(['1', '2', '3']);
      expect(badge()).toEqual(['', '', '']);
      expect(nota()).toBe('Il ciclo comincia lunedì 2 novembre, col primo piano.');
    });

    it('senza primo giorno lo dice, e dove si sceglie', async () => {
      oggi();
      const { badge, nota } = await monta(undefined, ciclica(null), giorni);
      expect(badge()).toEqual(['', '', '']);
      expect(nota()).toBe('Manca il primo giorno del ciclo: si sceglie nel protocollo, nella Dieta del builder.');
    });

    it('un ciclo di un piano solo: sempre lui, e niente da dire su domani', async () => {
      oggi();
      const { badge, nota, intestazione } = await monta(undefined, ciclica('2026-10-20'), [giorni[0]]);
      expect(badge()).toEqual(['Oggi']);
      expect(intestazione()).toBe('ciclo di 1 giorno');
      expect(nota()).toBeNull();
    });
  });
});
