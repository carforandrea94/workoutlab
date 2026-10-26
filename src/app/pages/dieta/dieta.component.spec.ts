import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { DietaComponent } from './dieta.component';
import { DietDataService } from '../../services/diet-data.service';
import { AppStateService } from '../../services/app-state.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { GiornoService } from '../../core/giorno.service';

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

  async function monta(stato: { mealsCompletion: any } | 'errore' = { mealsCompletion: null }) {
    TestBed.configureTestingModule({
      imports: [DietaComponent],
      providers: [
        ...providerPagina(),
        { provide: DietDataService, useValue: { diet: piani } },
        { provide: AppStateService, useValue: { load: stato === 'errore' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn(async () => stato) } }
      ]
    });
    const fixture = TestBed.createComponent(DietaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const metaDi = () => Array.from(root.querySelectorAll<HTMLElement>('.diet-card .meta')).map(m => m.textContent!.replace(/\s+/g, ' ').trim());
    return { fixture, root, metaDi };
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
});
