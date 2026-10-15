import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { MisureAnalyticsComponent } from './misure-analytics.component';
import { MeasurementDataService } from '../../services/measurement-data.service';

/**
 * Le righe che scelgono la misura da vedere nel grafico erano <div> con un
 * click: ora sono checkbox raggiungibili da tastiera, e dicono quale e' scelta.
 */
describe('MisureAnalyticsComponent — righe a selezione', () => {
  const voce = (date: string, peso: string | null) => ({ date, peso, plicaAddominale: null }) as any;

  async function monta() {
    const data: Partial<MeasurementDataService> = {
      loadHistory: vi.fn(async () => [voce('2026-05-02', '81'), voce('2026-05-01', '82')]),
      getLastValues: vi.fn(async () => ({ peso: '81' }) as any),
      parseMeasureValue: (v: string | null) => (v === null ? null : parseFloat(v)),
      formatMeasureNumber: (n: number) => String(n),
      buildTrendSVG: () => '<svg></svg>'
    };
    TestBed.configureTestingModule({
      imports: [MisureAnalyticsComponent],
      providers: [...providerPagina(), { provide: MeasurementDataService, useValue: data }]
    });
    const fixture = TestBed.createComponent(MisureAnalyticsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('.measure-selectrow'));
    const tasto = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const aggiorna = async () => { fixture.detectChanges(); };
    return { fixture, righe, tasto, aggiorna };
  }

  it('ogni riga e\' un checkbox raggiungibile con Tab', async () => {
    const { righe } = await monta();
    expect(righe().length).toBeGreaterThan(3);
    for (const r of righe()) {
      expect(r.getAttribute('role')).toBe('checkbox');
      expect(r.getAttribute('tabindex')).toBe('0');
      expect(r.getAttribute('aria-checked')).toMatch(/^(true|false)$/);
    }
  });

  it('una sola riga e\' scelta, e e\' quella del grafico', async () => {
    const { righe } = await monta();
    const scelte = righe().filter(r => r.getAttribute('aria-checked') === 'true');
    expect(scelte.length).toBe(1);
    expect(scelte[0].textContent).toContain('Peso');
    expect(scelte[0].classList.contains('selected')).toBe(true);
  });

  it('Invio su un\'altra riga la sceglie e lo stato si aggiorna', async () => {
    const { righe, tasto, aggiorna, fixture } = await monta();
    const altra = righe().find(r => r.getAttribute('aria-checked') === 'false')!;

    tasto(altra, 'Enter');
    await aggiorna();

    expect(fixture.componentInstance.selectedField!.label).not.toBe('Peso');
    const scelte = righe().filter(r => r.getAttribute('aria-checked') === 'true');
    expect(scelte.length).toBe(1);
    expect(scelte[0].textContent).toContain(fixture.componentInstance.selectedField!.label);
  });

  it('Spazio fa lo stesso e non fa scorrere la pagina', async () => {
    const { righe, aggiorna, fixture } = await monta();
    const altra = righe().find(r => r.getAttribute('aria-checked') === 'false')!;
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

    altra.dispatchEvent(ev);
    await aggiorna();

    expect(ev.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.selectedField!.label).not.toBe('Peso');
  });
});
