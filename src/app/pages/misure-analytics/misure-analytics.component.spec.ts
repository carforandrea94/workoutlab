import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { MisureAnalyticsComponent } from './misure-analytics.component';
import { MeasurementDataService } from '../../services/measurement-data.service';

/**
 * Andamento: in cima il segmento dei gruppi (Peso, Pliche, Centimetri), poi
 * il grafico nella sua ion-card, la lista delle misure del gruppo (ion-radio)
 * e la tabella delle misurazioni (ion-accordion).
 */
describe('MisureAnalyticsComponent', () => {
  /** Dal piu' recente, come le restituisce il servizio. */
  const storicoBase = () => [
    { date: '2026-10-21', peso: '113,1', plicaAddominale: '21', plicaIliaca: '16', cmVita: '99,5' },
    { date: '2026-09-07', peso: '107,6', plicaAddominale: '21', plicaIliaca: null, cmVita: null },
    { date: '2026-07-14', peso: '110,9', plicaAddominale: '23', plicaIliaca: null, cmVita: '104' }
  ] as any[];

  async function monta(storico: any[] = storicoBase()) {
    const data: Partial<MeasurementDataService> = {
      loadHistory: vi.fn(async () => storico),
      getLastValues: vi.fn(async () => ({ peso: '113,1', plicaAddominale: '21', plicaIliaca: '16', cmVita: '99,5' }) as any),
      parseMeasureValue: (v: string | null) => (v === null || v === undefined ? null : parseFloat(String(v).replace(',', '.')))
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
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    /** Il testo pezzo per pezzo: Angular toglie gli spazi fra un tag e l'altro. */
    const parole = (el: Element | null) => {
      if (!el) return '';
      const giro = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const pezzi: string[] = [];
      for (let n = giro.nextNode(); n; n = giro.nextNode()) if (n.textContent!.trim()) pezzi.push(n.textContent!.trim());
      return pezzi.join(' ');
    };
    return { fixture, root, q, tutti, testo, parole, c: fixture.componentInstance, data };
  }

  describe('il segmento dei gruppi', () => {
    it('ha Peso, Pliche e Centimetri, e parte dal gruppo della prima misura con dei dati', async () => {
      const { tutti, testo, c, q } = await monta();
      expect(tutti('ion-segment.andamento-gruppi ion-segment-button').map(testo)).toEqual(['Peso', 'Pliche', 'Centimetri']);
      expect(q('ion-segment.andamento-gruppi')!.getAttribute('aria-label')).toBe('Gruppo di misure');
      expect(c.categoria).toBe('peso');
      expect(c.selectedField!.key).toBe('peso');
    });

    it('senza nessun peso parte dalle pliche', async () => {
      const storico = storicoBase().map(e => ({ ...e, peso: null }));
      const { c } = await monta(storico);
      expect(c.categoria).toBe('pliche');
      expect(c.selectedField!.key).toBe('plicaAddominale');
    });

    it('un gruppo senza nessun dato non si puo\' scegliere', async () => {
      const storico = storicoBase().map(e => ({ ...e, cmVita: null }));
      const { c, fixture, tutti } = await monta(storico);
      const bottoni = tutti('ion-segment.andamento-gruppi ion-segment-button');
      expect(bottoni.map(b => (b as any).disabled)).toEqual([false, false, true]);
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(c.categoria).toBe('peso');
    });

    it('passando a un gruppo si vede la sua prima misura con dei dati; tornandoci, l\'ultima vista', async () => {
      const { c, fixture } = await monta();
      c.cambiaCategoria('pliche');
      expect(c.selectedField!.key).toBe('plicaAddominale');
      await c.scegli(c.gruppi.pliche[1].field);
      c.cambiaCategoria('peso');
      expect(c.selectedField!.key).toBe('peso');
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      expect(c.selectedField!.key).toBe('plicaIliaca');
    });

    it('un valore estraneo dal segmento non cambia niente', async () => {
      const { c } = await monta();
      c.cambiaCategoria('altro');
      c.cambiaCategoria(undefined);
      expect(c.categoria).toBe('peso');
    });
  });

  describe('il grafico', () => {
    it('riceve i punti della misura scelta, dal piu\' vecchio al piu\' recente', async () => {
      const { c, q, testo } = await monta();
      expect(c.punti).toEqual([
        { date: '2026-07-14', value: 110.9 }, { date: '2026-09-07', value: 107.6 }, { date: '2026-10-21', value: 113.1 }
      ]);
      expect(testo(q('app-grafico-andamento ion-card-title'))).toBe('Peso');
      expect(testo(q('app-grafico-andamento .lettura-quando'))).toBe('21 ott · +2,2 kg dal 14 lug');
    });

    it('le misurazioni senza quel valore non sono punti', async () => {
      const { c, fixture } = await monta();
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(c.punti.map(p => p.date)).toEqual(['2026-07-14', '2026-10-21']);
    });

    it('lo screen reader sente il cambio di misura', async () => {
      const { c, q, fixture } = await monta();
      const voce = q('.andamento .sr-only[aria-live="polite"]')!;
      expect(voce.textContent).toBe('Peso: 113,1 kg, +2,2 kg dal 14 lug');
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(voce.textContent).toBe('Vita: 99,5 cm, -4,5 cm dal 14 lug');
    });

    it('e anche quando la misura e\' tornata uguale, o ce n\'e\' una sola', async () => {
      const storico = storicoBase();
      storico[0].plicaAddominale = '23';
      const { c, q, fixture } = await monta(storico);
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      expect(q('.andamento .sr-only')!.textContent).toBe('Plica addominale: 23 mm, uguale al 14 lug');
      await c.scegli(c.gruppi.pliche[1].field);
      fixture.detectChanges();
      expect(q('.andamento .sr-only')!.textContent).toBe('Plica iliaca: 16 mm, una sola misurazione');
    });
  });

  describe('la lista delle misure del gruppo', () => {
    it('per il peso non c\'e\': e\' una misura sola', async () => {
      const { q } = await monta();
      expect(q('ion-list.andamento-misure')).toBeNull();
    });

    it('per le pliche e\' un ion-radio-group con un ion-radio per misura, sulla misura del grafico', async () => {
      const { c, fixture, q, tutti, parole } = await monta();
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      const gruppo = q('ion-list.andamento-misure ion-radio-group')!;
      expect(gruppo.getAttribute('aria-label')).toBe('Misura da mostrare nel grafico');
      expect((gruppo as any).value).toBe('plicaAddominale');
      const radio = tutti('ion-list.andamento-misure ion-radio');
      expect(radio.length).toBe(7);
      expect(parole(radio[0])).toBe('Plica addominale 21 mm');
    });

    it('una misura mai presa si legge ma non si sceglie', async () => {
      const { c, fixture, tutti, parole } = await monta();
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      const righe = tutti('ion-list.andamento-misure ion-item');
      const pettorale = righe[2];
      expect(parole(pettorale)).toBe('Plica pettorale Nessun dato');
      expect(pettorale.classList.contains('senza-dati')).toBe(true);
      expect((pettorale.querySelector('ion-radio') as any).disabled).toBe(true);
      expect((righe[0].querySelector('ion-radio') as any).disabled).toBe(false);
      // L'item resta abilitato: Ionic sommerebbe due opacita' al 30% e "Nessun dato" sparirebbe.
      expect((pettorale as any).disabled).toBeFalsy();
    });

    it('scegliere dalla lista cambia il grafico', async () => {
      const { c, fixture, q } = await monta();
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      q('ion-list.andamento-misure ion-radio-group')!.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'plicaIliaca' } }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(c.selectedField!.key).toBe('plicaIliaca');
      expect(c.punti).toEqual([{ date: '2026-10-21', value: 16 }]);
    });

    it('un valore che non e\' del gruppo non cambia niente', async () => {
      const { c } = await monta();
      c.cambiaCategoria('pliche');
      await c.sceltaDallaLista('cmVita');
      expect(c.selectedField!.key).toBe('plicaAddominale');
    });
  });

  describe('la scelta dalla lista riporta in vista il grafico', () => {
    const contenuto = (scrollTop: number) => ({
      getScrollElement: vi.fn(async () => ({ scrollTop })),
      scrollToTop: vi.fn(async () => {})
    });

    it('scesi nella lista, si torna su piano', async () => {
      const { c } = await monta();
      c.cambiaCategoria('pliche');
      const content = contenuto(640);
      Object.assign(c.content!, content);
      await c.sceltaDallaLista('plicaIliaca');
      expect(c.selectedField!.key).toBe('plicaIliaca');
      expect(content.scrollToTop).toHaveBeenCalledWith(300);
    });

    it('con "riduci movimento" di colpo', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      try {
        const { c } = await monta();
        c.cambiaCategoria('pliche');
        const content = contenuto(640);
        Object.assign(c.content!, content);
        await c.sceltaDallaLista('plicaIliaca');
        expect(content.scrollToTop).toHaveBeenCalledWith(0);
      } finally { vi.unstubAllGlobals(); }
    });

    it('gia\' in cima non si muove niente', async () => {
      const { c } = await monta();
      c.cambiaCategoria('pliche');
      const content = contenuto(10);
      Object.assign(c.content!, content);
      await c.sceltaDallaLista('plicaIliaca');
      expect(content.scrollToTop).not.toHaveBeenCalled();
      expect(c.selectedField!.key).toBe('plicaIliaca');
    });

    it('senza il contenuto (ancora non disegnato) sceglie e basta', async () => {
      const { c } = await monta();
      Object.defineProperty(c, 'content', { get: () => undefined, set: () => {}, configurable: true });
      await expect(c.scegli(c.gruppi.pliche[1].field)).resolves.toBeUndefined();
      expect(c.selectedField!.key).toBe('plicaIliaca');
    });

    it('il segmento e il caricamento non scorrono: solo la lista', async () => {
      const { c } = await monta();
      const content = contenuto(640);
      Object.assign(c.content!, content);
      c.cambiaCategoria('pliche');
      c.selectField(c.gruppi.centimetri[0].field);
      expect(content.scrollToTop).not.toHaveBeenCalled();
    });
  });

  describe('la tabella delle misurazioni', () => {
    it('ha gli stessi numeri del grafico, dalla piu\' recente, con la variazione dalla precedente', async () => {
      const { tutti, parole, q } = await monta();
      expect(parole(q('ion-accordion-group.andamento-tabella ion-item[slot="header"]'))).toBe('Misurazioni 3');
      const righe = tutti('ion-accordion-group.andamento-tabella ion-list ion-item').map(parole);
      expect(righe).toEqual([
        '21 ottobre 2026 +5,5 kg dalla precedente 113,1 kg',
        '7 settembre 2026 -3,3 kg dalla precedente 107,6 kg',
        '14 luglio 2026 Prima misura 110,9 kg'
      ]);
    });

    it('una misura uguale alla precedente lo dice a parole', async () => {
      const { c, fixture, tutti, parole } = await monta();
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      expect(parole(tutti('ion-accordion-group.andamento-tabella ion-list ion-item')[0])).toBe('21 ottobre 2026 Uguale alla precedente 21 mm');
    });

    it('l\'ultima riga non ha la linea sotto: la chiude la card', async () => {
      const { tutti } = await monta();
      const righe = tutti('ion-accordion-group.andamento-tabella ion-list ion-item');
      expect(righe.map(r => (r as any).lines)).toEqual(['full', 'full', 'none']);
    });
  });

  describe('tirando per aggiornare', () => {
    it('resta sulla misura che si guardava', async () => {
      const { c, data } = await monta();
      await c.scegli(c.gruppi.centimetri[0].field);
      await c.load(true);
      expect(data.loadHistory).toHaveBeenCalledTimes(2);
      expect(c.selectedField!.key).toBe('cmVita');
      expect(c.categoria).toBe('centimetri');
    });

    it('se quella misura non ha piu\' dati, torna alla prima che ne ha', async () => {
      const { c, data } = await monta();
      await c.scegli(c.gruppi.centimetri[0].field);
      (data.loadHistory as any).mockImplementation(async () => storicoBase().map(e => ({ ...e, cmVita: null })));
      await c.load(true);
      expect(c.selectedField!.key).toBe('peso');
    });
  });

  it('senza nessuna misurazione, l\'invito a inserirle e niente grafico', async () => {
    const { q, testo } = await monta([]);
    expect(q('app-grafico-andamento')).toBeNull();
    expect(q('ion-segment.andamento-gruppi')).toBeNull();
    expect(testo(q('.history-empty'))).toContain('Nessuna misurazione salvata.');
  });
});
