import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { NavController } from '@ionic/angular';
import { providerPagina } from '../../../test-support/pagina';
import { controllaBarraInBasso } from '../../../test-support/barra-azione';
import { AppStateService } from '../../services/app-state.service';
import { MisureComponent } from './misure.component';
import { MeasurementDataService } from '../../services/measurement-data.service';

/**
 * Misure: in cima il segmento dei gruppi (Peso, Pliche, Centimetri), poi il
 * grafico nella sua ion-card, la lista delle misure del gruppo (ion-radio) e
 * la tabella delle misurazioni (ion-accordion); in basso il tasto che registra
 * una misura del gruppo.
 */
describe('MisureComponent', () => {
  /** Dal piu' recente, come le restituisce il servizio. */
  const storicoBase = () => [
    { date: '2026-10-21', peso: '113,1', plicaAddominale: '21', plicaIliaca: '16', cmVita: '99,5' },
    { date: '2026-09-07', peso: '107,6', plicaAddominale: '21', plicaIliaca: null, cmVita: null },
    { date: '2026-07-14', peso: '110,9', plicaAddominale: '23', plicaIliaca: null, cmVita: '104' }
  ] as any[];

  async function monta(storico: any[] = storicoBase(), obiettivo: unknown = null) {
    const data: Partial<MeasurementDataService> = {
      loadHistory: vi.fn(async () => storico),
      getLastValues: vi.fn(async () => ({ peso: '113,1', plicaAddominale: '21', plicaIliaca: '16', cmVita: '99,5' }) as any),
      parseMeasureValue: (v: string | null) => (v === null || v === undefined ? null : parseFloat(String(v).replace(',', '.')))
    };
    TestBed.configureTestingModule({
      imports: [MisureComponent],
      providers: [
        ...providerPagina(), { provide: MeasurementDataService, useValue: data },
        { provide: AppStateService, useValue: { load: async () => ({ obiettivo }) } }
      ]
    });
    const fixture = TestBed.createComponent(MisureComponent);
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

    it('anche un gruppo senza nessun dato si sceglie: niente grafico, lista e tabella, l\'invito a cominciare', async () => {
      const storico = storicoBase().map(e => ({ ...e, cmVita: null }));
      const { c, fixture, tutti, q, parole } = await monta(storico);
      const bottoni = tutti('ion-segment.andamento-gruppi ion-segment-button');
      expect(bottoni.map(b => !!(b as any).disabled)).toEqual([false, false, false]);
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(c.categoria).toBe('centimetri');
      expect(q('app-grafico-andamento')).toBeNull();
      expect(q('ion-list.andamento-misure')).toBeNull();
      expect(q('ion-accordion-group.andamento-tabella')).toBeNull();
      expect(parole(q('ion-card.gruppo-vuoto ion-card-title'))).toBe('Centimetri');
      expect(parole(q('ion-card.gruppo-vuoto .andamento-vuoto'))).toBe(
        'Ancora nessuna circonferenza misurata. Aggiungi la prima con il tasto qui sotto: qui ne vedrai l\'andamento.');
      expect(q('.andamento .sr-only')!.textContent).toBe('Centimetri. Ancora nessuna circonferenza misurata.');
      expect(parole(q('ion-footer ion-button.registra-btn'))).toBe('Registra centimetri');
    });

    it('un gruppo con dei dati non mostra l\'invito', async () => {
      const { q } = await monta();
      expect(q('ion-card.gruppo-vuoto')).toBeNull();
      expect(q('app-grafico-andamento')).not.toBeNull();
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
      // Pesate lontane piu' di sette giorni: ogni media e' la pesata stessa.
      expect(testo(q('app-grafico-andamento ion-card-title'))).toBe('Peso · media di 7 giorni');
      expect(testo(q('app-grafico-andamento .lettura-quando'))).toBe('21 ott · pesata 113,1 kg · +2,2 kg dal 14 lug');
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
      expect(voce.textContent).toBe('Peso, media di 7 giorni: 113,1 kg, +2,2 kg dal 14 lug');
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

    it('resta sulla misura scelta anche quando non e\' la prima del gruppo', async () => {
      const { c } = await monta();
      await c.scegli(c.gruppi.pliche[1].field);
      await c.load(true);
      expect(c.selectedField!.key).toBe('plicaIliaca');
    });

    it('se quella misura non ha piu\' dati, resta nel gruppo sulla prima che ne ha', async () => {
      const { c, data } = await monta();
      await c.scegli(c.gruppi.pliche[1].field);
      (data.loadHistory as any).mockImplementation(async () => storicoBase().map(e => ({ ...e, plicaIliaca: null })));
      await c.load(true);
      expect(c.categoria).toBe('pliche');
      expect(c.selectedField!.key).toBe('plicaAddominale');
    });

    it('se il gruppo non ha piu\' niente resta li\', vuoto, invece di saltare altrove', async () => {
      const { c, data } = await monta();
      await c.scegli(c.gruppi.centimetri[0].field);
      (data.loadHistory as any).mockImplementation(async () => storicoBase().map(e => ({ ...e, cmVita: null })));
      await c.load(true);
      expect(c.categoria).toBe('centimetri');
      expect(c.punti).toEqual([]);
    });
  });

  describe('la pagina Misure', () => {
    it('e\' una pagina dentro Account: si chiama Misure, la freccia torna ad Account, in alto lo Storico', async () => {
      const { q, testo } = await monta();
      expect(testo(q('ion-header .navtitle'))).toBe('Misure');
      const indietro = q('ion-header ion-buttons[slot=start] ion-back-button') as HTMLElement & { defaultHref?: string };
      expect(indietro.defaultHref).toBe('/account');
      const storico = q('ion-header ion-buttons[slot=end] ion-button')!;
      expect(storico.getAttribute('title')).toBe('Storico');
      expect(storico.getAttribute('routerLink')).toBe('/account/misure/storico');
      // L'andamento non e' piu' una pagina a parte.
      expect(q('ion-header [aria-label="Andamento"]')).toBeNull();
    });

    it('senza nessuna misurazione si parte dal peso, col tasto per la prima pesata', async () => {
      const { q, c, parole } = await monta([]);
      expect(q('ion-segment.andamento-gruppi')).not.toBeNull();
      expect(c.categoria).toBe('peso');
      expect(q('app-grafico-andamento')).toBeNull();
      expect(parole(q('ion-card.gruppo-vuoto .andamento-vuoto'))).toContain('Ancora nessuna pesata.');
      expect(parole(q('ion-footer ion-button.registra-btn'))).toBe('Registra peso');
    });
  });

  describe('registrare da qui', () => {
    it('in basso c\'e\' il tasto, fatto come la barra delle tab', async () => {
      const { fixture } = await monta();
      controllaBarraInBasso(fixture);
    });

    it('il tasto dice cosa registra: il gruppo che si sta guardando', async () => {
      const { c, fixture, q, parole } = await monta();
      const tasto = () => parole(q('ion-footer ion-button.registra-btn'));
      expect(tasto()).toBe('Registra peso');
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      expect(tasto()).toBe('Registra pliche');
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(tasto()).toBe('Registra centimetri');
    });

    it('toccandolo si apre il modulo del gruppo, nella pila di Account', async () => {
      const { c, fixture, q } = await monta();
      const nav = TestBed.inject(NavController);
      const avanti = vi.spyOn(nav, 'navigateForward').mockResolvedValue(true);
      c.cambiaCategoria('pliche');
      fixture.detectChanges();
      q('ion-footer ion-button.registra-btn')!.click();
      expect(avanti).toHaveBeenCalledWith(['/account/misure', 'pliche']);
    });

    it('mentre carica il tasto non c\'e\'', async () => {
      let rispondi!: (v: any[]) => void;
      TestBed.configureTestingModule({
        imports: [MisureComponent],
        providers: [...providerPagina(), {
          provide: MeasurementDataService,
          useValue: { loadHistory: () => new Promise(r => { rispondi = r; }), getLastValues: async () => ({}), parseMeasureValue: () => null }
        }]
      });
      const fixture = TestBed.createComponent(MisureComponent);
      fixture.detectChanges();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('ion-footer')).toBeNull();
      expect(root.querySelector('ion-content')!.classList.contains('con-barra')).toBe(false);
      rispondi([]);
      await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
      fixture.detectChanges();
      expect(root.querySelector('ion-footer')).not.toBeNull();
    });

    it('se la lettura non riesce, niente tasto: c\'e\' "Riprova"', async () => {
      TestBed.configureTestingModule({
        imports: [MisureComponent],
        providers: [...providerPagina(), {
          provide: MeasurementDataService,
          useValue: { loadHistory: async () => { throw new Error('rete'); }, getLastValues: async () => ({}), parseMeasureValue: () => null }
        }]
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fixture = TestBed.createComponent(MisureComponent);
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
      fixture.detectChanges();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('ion-footer')).toBeNull();
      expect(root.querySelector('ion-content')!.classList.contains('con-barra')).toBe(false);
      expect(root.querySelector('.history-empty')!.textContent).toContain('Riprova');
    });

    it('tornando dal modulo rilegge, senza spinner, e resta sul gruppo; la prima entrata no', async () => {
      const { c, data, fixture } = await monta();
      c.ionViewWillEnter();
      expect(data.loadHistory).toHaveBeenCalledTimes(1);
      c.cambiaCategoria('pliche');
      (data.loadHistory as any).mockImplementation(async () => [
        { date: '2026-10-23', peso: null, plicaAddominale: '20', plicaIliaca: null, cmVita: null }, ...storicoBase()
      ]);
      c.ionViewWillEnter();
      expect(c.loading).toBe(false);
      await vi.waitFor(() => expect(c.punti.length).toBe(4));
      fixture.detectChanges();
      expect(data.loadHistory).toHaveBeenCalledTimes(2);
      expect(c.categoria).toBe('pliche');
      expect(c.punti[3]).toEqual({ date: '2026-10-23', value: 20 });
    });
  });

  describe('il peso come media di 7 giorni', () => {
    const vicine = () => [
      { date: '2026-10-23', peso: '112' }, { date: '2026-10-21', peso: '113' }, { date: '2026-10-19', peso: '114' }
    ] as any[];

    it('la linea e\' la media, le pesate vere restano sotto e nella tabella', async () => {
      const { c, q, tutti, testo } = await monta(vicine());
      expect(c.punti).toEqual([{ date: '2026-10-19', value: 114 }, { date: '2026-10-21', value: 113.5 }, { date: '2026-10-23', value: 113 }]);
      expect(c.pesate).toEqual([{ date: '2026-10-19', value: 114 }, { date: '2026-10-21', value: 113 }, { date: '2026-10-23', value: 112 }]);
      expect(tutti('app-grafico-andamento circle.pesata').length).toBe(3);
      expect(testo(q('app-grafico-andamento .lettura'))).toBe('113kg');
      expect(testo(q('app-grafico-andamento .lettura-quando'))).toBe('23 ott · pesata 112 kg · -1 kg dal 19 ott');
      expect(c.righe.map(r => r.valore)).toEqual(['112', '113', '114']);
      expect(testo(q('p.nota-sotto'))).toBe('La linea è la media degli ultimi 7 giorni: un giorno più pesante non la sposta. I punti sono le pesate del giorno.');
    });

    it('il traguardo si misura dalla media, non dall\'ultima pesata', async () => {
      const { c } = await monta(vicine(), { tipo: 'grasso', peso: 110 });
      expect(c.traguardo).toEqual({ valore: 110, testo: 'Traguardo 110 kg · mancano 3 kg' });
    });

    it('le altre misure restano com\'erano: niente media, niente pesate, niente nota', async () => {
      const { c, q, fixture } = await monta();
      c.cambiaCategoria('centimetri');
      fixture.detectChanges();
      expect(c.pesate).toBeNull();
      expect(c.nomeGrafico).toBe('Vita');
      expect(q('app-grafico-andamento circle.pesata')).toBeNull();
      expect(q('app-grafico-andamento .leggenda')).toBeNull();
      expect(q('p.nota-sotto')).toBeNull();
    });

    it('con una pesata sola niente nota: non c\'e\' ancora una linea', async () => {
      const { q } = await monta([{ date: '2026-10-23', peso: '112' }] as any[]);
      expect(q('p.nota-sotto')).toBeNull();
    });
  });

  describe('il traguardo del peso', () => {
    it('con un traguardo, sul grafico del peso: la linea e quanto manca dalla media', async () => {
      const { root, c } = await monta(storicoBase(), { tipo: 'grasso', peso: 105, entro: null }) as any;
      const card = root.querySelector('app-grafico-andamento')!;
      expect(card.querySelector('.lettura-traguardo')!.textContent!.trim()).toBe('Traguardo 105 kg · mancano 8,1 kg');
      expect(card.querySelector('line.traguardo')).not.toBeNull();
      expect(c.traguardo).toEqual({ valore: 105, testo: 'Traguardo 105 kg · mancano 8,1 kg' });
    });

    it('sulle altre misure il traguardo del peso non c\'e\'', async () => {
      const { c } = await monta(storicoBase(), { tipo: 'grasso', peso: 105, entro: null }) as any;
      c.cambiaCategoria('pliche');
      expect(c.traguardo).toBeNull();
      c.cambiaCategoria('peso');
      expect(c.traguardo?.valore).toBe(105);
    });

    it('senza traguardo, o con un obiettivo che non e\' sul peso, niente linea', async () => {
      for (const obiettivo of [null, { tipo: 'forza' }, { tipo: 'grasso', peso: null }]) {
        TestBed.resetTestingModule();
        const { root, c } = await monta(storicoBase(), obiettivo) as any;
        expect(c.traguardo).toBeNull();
        expect(root.querySelector('line.traguardo')).toBeNull();
      }
    });

    it('se lo stato non si legge, il grafico c\'e\' lo stesso, senza traguardo', async () => {
      TestBed.configureTestingModule({
        imports: [MisureComponent],
        providers: [
          ...providerPagina(),
          { provide: MeasurementDataService, useValue: {
            loadHistory: async () => storicoBase(), getLastValues: async () => ({ peso: '113,1' }),
            parseMeasureValue: (v: string | null) => (v == null ? null : parseFloat(String(v).replace(',', '.')))
          } },
          { provide: AppStateService, useValue: { load: async () => { throw new Error('rete'); } } }
        ]
      });
      const fixture = TestBed.createComponent(MisureComponent);
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
      fixture.detectChanges();
      expect(fixture.componentInstance.errorMsg).toBe('');
      expect(fixture.componentInstance.traguardo).toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-grafico-andamento')).not.toBeNull();
    });
  });
});
