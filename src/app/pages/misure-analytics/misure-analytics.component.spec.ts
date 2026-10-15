import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { MisureAnalyticsComponent } from './misure-analytics.component';
import { MeasurementDataService } from '../../services/measurement-data.service';

/**
 * Le righe che scelgono la misura da vedere nel grafico erano <div> con un
 * click: ora sono radio raggiungibili da tastiera, in un solo gruppo (se ne
 * sceglie una per tutte e tre le sezioni), e dicono quale e' scelta. Scegliere
 * riporta in vista il grafico, che sta in cima.
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

  it('ogni riga e\' un radio raggiungibile con Tab', async () => {
    const { righe } = await monta();
    expect(righe().length).toBeGreaterThan(3);
    for (const r of righe()) {
      expect(r.getAttribute('role')).toBe('radio');
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

describe('MisureAnalyticsComponent — il grafico e la variazione', () => {
  const voce = (date: string, peso: string | null) => ({ date, peso, plicaAddominale: null, plicaIliaca: '12' }) as any;

  async function monta(storico: any[]) {
    const data: Partial<MeasurementDataService> = {
      loadHistory: vi.fn(async () => storico),
      getLastValues: vi.fn(async () => ({ peso: '81' }) as any),
      parseMeasureValue: (v: string | null) => (v === null || v === undefined ? null : parseFloat(String(v).replace(',', '.'))),
      formatMeasureNumber: (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ','),
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
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    return { fixture, root, q, c: fixture.componentInstance };
  }

  describe('la variazione', () => {
    it('e\' scritta col segno e senza giudizio: ne\' rosso ne\' verde, qualunque sia il verso', async () => {
      // Senza un obiettivo dichiarato un +2,8 kg non e' un errore (e per un bicipite il verso buono e' l'opposto).
      const su = await monta([voce('2026-05-02', '82,8'), voce('2026-05-01', '80')]);
      expect(su.q('.chart-head .delta')!.textContent!.trim()).toBe('+2,8 kg');
      expect(su.q('.chart-head .delta')!.className).toBe('delta');
    });

    it('in calo ha il meno e la stessa classe', async () => {
      const { q } = await monta([voce('2026-05-02', '79,6'), voce('2026-05-01', '80')]);
      expect(q('.chart-head .delta')!.textContent!.trim()).toBe('-0,4 kg');
      expect(q('.chart-head .delta')!.className).toBe('delta');
    });
  });

  describe('la scelta dalla lista', () => {
    const storico = () => [voce('2026-05-02', '81'), voce('2026-05-01', '82')];
    const contenuto = (scrollTop: number) => ({
      getScrollElement: vi.fn(async () => ({ scrollTop })),
      scrollToTop: vi.fn(async () => {})
    });

    it('scesi nella lista, riporta in cima dal grafico, piano', async () => {
      const { c } = await monta(storico());
      const content = contenuto(640);
      Object.assign(c.content!, content);
      await c.scegli(c['group2'][0].field);
      expect(c.selectedField!.key).toBe('plicaAddominale');
      expect(content.scrollToTop).toHaveBeenCalledWith(300);
    });

    it('con "riduci movimento" ci va di colpo', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      try {
        const { c } = await monta(storico());
        const content = contenuto(640);
        Object.assign(c.content!, content);
        await c.scegli(c['group3'][0].field);
        expect(content.scrollToTop).toHaveBeenCalledWith(0);
      } finally { vi.unstubAllGlobals(); }
    });

    it('gia\' in cima non muove niente', async () => {
      const { c } = await monta(storico());
      const content = contenuto(10);
      Object.assign(c.content!, content);
      await c.scegli(c['group2'][0].field);
      expect(content.scrollToTop).not.toHaveBeenCalled();
      expect(c.selectedField!.key).toBe('plicaAddominale');
    });

    it('senza il contenuto (ancora non disegnato) sceglie e basta', async () => {
      const { c } = await monta(storico());
      // detectChanges (dentro scegli) rimette il contenuto vero: si simula che non ci sia.
      Object.defineProperty(c, 'content', { get: () => undefined, set: () => {}, configurable: true });
      await expect(c.scegli(c['group2'][0].field)).resolves.toBeUndefined();
      expect(c.selectedField!.key).toBe('plicaAddominale');
    });

    it('la scelta fatta dal caricamento non scorre: solo quella dell\'utente', async () => {
      const { c } = await monta(storico());
      const content = contenuto(640);
      Object.assign(c.content!, content);
      c.selectField(c['group2'][0].field);
      expect(content.scrollToTop).not.toHaveBeenCalled();
    });
  });

  describe('per lo screen reader', () => {
    it('le tre sezioni sono un solo gruppo di scelta, con un nome', async () => {
      const { root } = await monta([voce('2026-05-02', '81'), voce('2026-05-01', '82')]);
      const gruppi = root.querySelectorAll('[role="radiogroup"]');
      expect(gruppi.length).toBe(1);
      expect(gruppi[0].getAttribute('aria-label')).toBe('Misura da mostrare nel grafico');
      expect(gruppi[0].querySelectorAll('[role="radio"]').length).toBe(root.querySelectorAll('.measure-selectrow').length);
      expect(root.querySelector('[role="checkbox"]')).toBeNull();
    });

    it('il grafico annuncia il cambio di misura', async () => {
      const { q } = await monta([voce('2026-05-02', '81'), voce('2026-05-01', '82')]);
      expect(q('.chart-head')!.getAttribute('aria-live')).toBe('polite');
    });
  });
});
