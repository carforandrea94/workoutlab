import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { NavController } from '@ionic/angular';
import { providerPagina } from '../../../test-support/pagina';
import { MisureComponent, riassuntoCategoria } from './misure.component';
import { MeasurementDataService } from '../../services/measurement-data.service';

const giorniFa = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const voce = (date: string, parti: Record<string, string | null> = {}): any => ({ date, peso: null, cmVita: null, plicaAddominale: null, ...parti });

describe('riassuntoCategoria', () => {
  const oggi = '2026-10-15';

  it('il peso dice l\'ultima pesata e quando', () => {
    expect(riassuntoCategoria('peso', [voce('2026-10-14', { peso: '82,4' })], oggi)).toBe('82,4 kg · ieri');
  });

  it('prende l\'ultima voce che ha il peso, non l\'ultima voce', () => {
    const storico = [voce('2026-10-14', { cmVita: '90' }), voce('2026-10-03', { peso: '83' })];
    expect(riassuntoCategoria('peso', storico, oggi)).toBe('83 kg · 3 ott');
  });

  it('le altre categorie dicono l\'ultima volta in cui sono state misurate', () => {
    const storico = [voce('2026-10-14', { peso: '82' }), voce('2026-10-03', { plicaAddominale: '14' })];
    expect(riassuntoCategoria('pliche', storico, oggi)).toBe('Ultima volta: 3 ott');
    expect(riassuntoCategoria('centimetri', [voce('2026-10-15', { cmVita: '90' })], oggi)).toBe('Ultima volta: oggi');
  });

  it('senza niente dice che non c\'e\' niente', () => {
    expect(riassuntoCategoria('peso', [], oggi)).toBe('Nessuna misura');
    expect(riassuntoCategoria('pliche', [voce('2026-10-14', { peso: '82' })], oggi)).toBe('Nessuna misura');
  });
});

describe('MisureComponent — le righe', () => {
  async function monta(loadHistory: () => Promise<any[]>) {
    const data = { loadHistory: vi.fn(loadHistory) };
    TestBed.configureTestingModule({
      imports: [MisureComponent],
      providers: [...providerPagina(), { provide: MeasurementDataService, useValue: data }]
    });
    const fixture = TestBed.createComponent(MisureComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const metaDi = () => Array.from(root.querySelectorAll<HTMLElement>('.cardrow')).map(r => ({
      nome: r.querySelector('.lbl')!.textContent!.trim(),
      meta: r.querySelector('.meta')?.textContent!.trim() ?? null
    }));
    return { fixture, data, metaDi };
  }

  it('ogni riga dice a che punto e\'', async () => {
    const { metaDi } = await monta(async () => [voce(giorniFa(1), { peso: '82,4' }), voce(giorniFa(9), { cmVita: '90' })]);
    const r = metaDi();
    expect(r[0]).toEqual({ nome: 'Peso', meta: '82,4 kg · ieri' });
    expect(r[1].nome).toBe('Centimetri');
    expect(r[1].meta).toMatch(/^Ultima volta: /);
    expect(r[2]).toEqual({ nome: 'Pliche', meta: 'Nessuna misura' });
  });

  it('e\' una pagina dentro Account: freccia indietro verso Account, niente titolo grande da radice', async () => {
    const { fixture } = await monta(async () => []);
    const root: HTMLElement = fixture.nativeElement;
    const indietro = root.querySelector<HTMLElement & { defaultHref?: string }>('ion-header ion-buttons[slot=start] ion-back-button');
    expect(indietro?.defaultHref).toBe('/account');
    expect(indietro?.getAttribute('aria-label')).toBe('Indietro');
    expect(root.querySelector('ion-header[collapse=condense]')).toBeNull();
  });

  it('una categoria si apre nella pila di Account', async () => {
    const { fixture } = await monta(async () => []);
    const nav = TestBed.inject(NavController);
    const avanti = vi.spyOn(nav, 'navigateForward').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.cardrow')[2].click();
    expect(avanti).toHaveBeenCalledWith(['/account/misure', 'pliche']);
  });

  it('andamento e storico, in testata, stanno sotto /account/misure', async () => {
    const { fixture } = await monta(async () => []);
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ion-buttons[slot=end] ion-button'))
      .map(b => b.getAttribute('routerLink'));
    expect(link).toEqual(['/account/misure/analytics', '/account/misure/storico']);
  });

  it('se la lettura fallisce le righe restano, senza dire "nessuna misura" a torto', async () => {
    const { metaDi } = await monta(async () => { throw new Error('offline'); });
    expect(metaDi().map(r => r.meta)).toEqual([null, null, null]);
    expect(metaDi().map(r => r.nome)).toEqual(['Peso', 'Centimetri', 'Pliche']);
  });

  it('tornando sulla pagina dopo un salvataggio la riga si aggiorna', async () => {
    let storico: any[] = [voce(giorniFa(3), { peso: '82' })];
    const { fixture, metaDi } = await monta(async () => storico);
    expect(metaDi()[0].meta).toBe('82 kg · ' + metaDi()[0].meta!.split('· ')[1]);

    storico = [voce(giorniFa(0), { peso: '81,8' }), ...storico];
    fixture.componentInstance.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(metaDi()[0].meta).toBe('81,8 kg · oggi');
  });
});
