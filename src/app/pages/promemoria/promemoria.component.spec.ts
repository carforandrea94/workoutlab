import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { PromemoriaService, Supporto } from '../../services/promemoria.service';
import { ToastService } from '../../services/toast.service';
import { Promemoria } from '../../core/utils/promemoria.util';
import { PromemoriaComponent } from './promemoria.component';
import { GiornoService } from '../../core/giorno.service';

/**
 * Promemoria: un interruttore, i giorni e l'ora. Si salva mentre si sceglie;
 * quando il telefono non li permette, l'interruttore e' spento e una riga
 * dice perche'.
 */
describe('PromemoriaComponent', () => {
  afterEach(() => vi.useRealTimers());

  interface Opzioni {
    promemoria?: Promemoria;
    supporto?: Supporto;
    permesso?: NotificationPermission;
    esito?: 'ok' | 'negato' | 'errore';
    carica?: () => Promise<Promemoria>;
  }

  async function monta(o: Opzioni = {}) {
    // Lunedi' 26 ottobre 2026 alle 9.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
    let permesso: NotificationPermission = o.permesso ?? 'default';
    const servizio = {
      supporto: () => o.supporto ?? 'ok',
      permesso: () => permesso,
      carica: o.carica ?? (async () => o.promemoria ?? { attivo: false, giorni: [1, 3, 5], ora: '18:00' }),
      attiva: vi.fn(async (_p: Promemoria) => {
        if (o.esito === 'negato') permesso = 'denied';
        return o.esito ?? 'ok';
      }),
      spegni: vi.fn(async (_p: Promemoria) => {}),
      cambia: vi.fn(async (_p: Promemoria) => {})
    };
    const toast = { error: vi.fn(), success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [PromemoriaComponent],
      providers: [...providerPagina(), { provide: PromemoriaService, useValue: servizio }, { provide: ToastService, useValue: toast }]
    });
    const fixture = TestBed.createComponent(PromemoriaComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.caricamento()).toBe(false));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => q(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const aggiorna = () => fixture.detectChanges();
    /** Il tocco sull'interruttore, come lo manda ion-toggle. */
    const tocca = async (acceso: boolean) => {
      const toggle = q<HTMLIonToggleElement>('ion-toggle')!;
      toggle.checked = acceso;
      await c.interruttore({ target: toggle, detail: { checked: acceso } } as unknown as Event);
      aggiorna();
      return toggle;
    };
    return { c, root, q, tutti, testo, aggiorna, tocca, servizio, toast };
  }

  it('spenti: l\'interruttore, cosa fanno, e niente giorni', async () => {
    const { q, testo, tutti } = await monta();
    const toggle = q<HTMLIonToggleElement>('ion-toggle')!;
    expect(toggle.textContent!.trim()).toBe('Ricordami gli allenamenti');
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(false);
    expect(testo('.promemoria-spiega')).toBe('30 minuti prima di ogni allenamento ti arriva una notifica con la seduta che tocca. Se quel giorno ti sei già allenato, niente notifica.');
    expect(tutti('.giorno').length).toBe(0);
  });

  it('accendere iscrive il telefono, e compaiono giorni, ora e quando arriva il prossimo', async () => {
    const { tocca, servizio, tutti, q, testo } = await monta();
    await tocca(true);
    expect(servizio.attiva).toHaveBeenCalledWith({ attivo: false, giorni: [1, 3, 5], ora: '18:00' });
    const giorni = tutti('.giorno');
    expect(giorni.map(g => g.textContent!.trim())).toEqual(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
    expect(giorni.map(g => g.getAttribute('aria-label'))).toEqual(['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']);
    expect(giorni.map(g => g.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'false']);
    expect(q('.giorni')!.getAttribute('role')).toBe('group');
    expect(q<HTMLInputElement>('#promemoria-ora')!.value).toBe('18:00');
    expect(testo('.promemoria-prossimo')).toBe('Il prossimo arriva oggi alle 17:30.');
  });

  it('permesso negato: l\'interruttore torna spento e la riga dice come rimediare', async () => {
    const { tocca, c, testo, toast } = await monta({ esito: 'negato' });
    const toggle = await tocca(true);
    expect(toggle.checked).toBe(false);
    expect(c.promemoria().attivo).toBe(false);
    expect(testo('.promemoria-spiega')).toBe('Le notifiche di Workout Lab sono bloccate su questo telefono: riattivale dalle impostazioni del telefono, poi torna qui.');
    expect(toggle.disabled).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('un errore: l\'interruttore torna spento e lo dice un avviso', async () => {
    const { tocca, toast } = await monta({ esito: 'errore' });
    const toggle = await tocca(true);
    expect(toggle.checked).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Non sono riuscito ad attivare i promemoria. Riprova.');
  });

  it('i giorni e l\'ora si salvano mentre si scelgono', async () => {
    const { tutti, servizio, c, aggiorna, testo } = await monta({ promemoria: { attivo: true, giorni: [1, 3, 5], ora: '18:00' } });
    tutti('.giorno')[1].click();
    aggiorna();
    expect(servizio.cambia).toHaveBeenLastCalledWith({ attivo: true, giorni: [1, 2, 3, 5], ora: '18:00' });
    tutti('.giorno')[0].click();
    aggiorna();
    expect(servizio.cambia).toHaveBeenLastCalledWith({ attivo: true, giorni: [2, 3, 5], ora: '18:00' });
    expect(testo('.promemoria-prossimo')).toBe('Il prossimo arriva domani alle 17:30.');
    c.cambiaOra({ target: { value: '07:15' } } as unknown as Event);
    aggiorna();
    expect(servizio.cambia).toHaveBeenLastCalledWith({ attivo: true, giorni: [2, 3, 5], ora: '07:15' });
    expect(testo('.promemoria-prossimo')).toBe('Il prossimo arriva domani alle 06:45.');
    // Un'ora che non si legge, o la stessa, non si salva.
    servizio.cambia.mockClear();
    c.cambiaOra({ target: { value: '' } } as unknown as Event);
    c.cambiaOra({ target: { value: '07:15' } } as unknown as Event);
    expect(servizio.cambia).not.toHaveBeenCalled();
  });

  it('spenti, giorni e ora non si salvano: si salveranno accendendo', async () => {
    const { c, servizio } = await monta();
    c.cambiaGiorno(2);
    c.cambiaOra({ target: { value: '07:00' } } as unknown as Event);
    expect(servizio.cambia).not.toHaveBeenCalled();
    expect(c.promemoria()).toEqual({ attivo: false, giorni: [1, 2, 3, 5], ora: '07:00' });
  });

  it('senza giorni lo dice', async () => {
    const { tutti, aggiorna, testo } = await monta({ promemoria: { attivo: true, giorni: [3], ora: '18:00' } });
    tutti('.giorno')[2].click();
    aggiorna();
    expect(testo('.promemoria-prossimo')).toBe('Scegli almeno un giorno: senza giorni non arriva nessun promemoria.');
  });

  it('spegnere si salva subito, e giorni e ora spariscono', async () => {
    const { tocca, servizio, tutti } = await monta({ promemoria: { attivo: true, giorni: [1, 3, 5], ora: '18:00' } });
    await tocca(false);
    expect(servizio.spegni).toHaveBeenCalledWith({ attivo: true, giorni: [1, 3, 5], ora: '18:00' });
    expect(tutti('.giorno').length).toBe(0);
  });

  describe('quando il telefono non li permette', () => {
    const casi: [Supporto, string][] = [
      ['installa', 'Su iPhone le notifiche arrivano solo all\'app sulla schermata Home: in Safari tocca Condividi, poi «Aggiungi alla schermata Home», e apri Workout Lab da lì.'],
      ['non-supportato', 'Questo browser non riceve notifiche: da qui i promemoria non si possono attivare.'],
      ['non-configurato', 'I promemoria non sono ancora disponibili: manca la configurazione del server che li manda.']
    ];
    for (const [supporto, frase] of casi) {
      it(`${supporto}: interruttore spento e la ragione`, async () => {
        const { q, testo } = await monta({ supporto });
        expect(q<HTMLIonToggleElement>('ion-toggle')!.disabled).toBe(true);
        expect(testo('.promemoria-spiega')).toBe(frase);
        expect(q('.promemoria-spiega')!.classList.contains('avviso')).toBe(true);
      });
    }

    it('accesi da un altro telefono si possono comunque spegnere da qui', async () => {
      const { q } = await monta({ supporto: 'installa', promemoria: { attivo: true, giorni: [1], ora: '18:00' } });
      expect(q<HTMLIonToggleElement>('ion-toggle')!.disabled).toBe(false);
    });
  });

  it('a mezzanotte "domani" diventa "oggi" da solo', async () => {
    const { testo } = await monta({ promemoria: { attivo: true, giorni: [2], ora: '18:00' } });
    expect(testo('.promemoria-prossimo')).toBe('Il prossimo arriva domani alle 17:30.');
    vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1));
    TestBed.inject(GiornoService).controlla();
    expect(testo('.promemoria-prossimo')).toBe('Il prossimo arriva oggi alle 17:30.');
  });

  it('se la lettura fallisce lo dice, e si riprova', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let volte = 0;
    const { testo, c } = await monta({ carica: async () => { if (volte++ === 0) throw new Error('offline'); return { attivo: false, giorni: [1], ora: '18:00' }; } });
    expect(testo('.history-empty')).toContain('Non riesco a leggere i tuoi promemoria.');
    await c.carica();
    expect(c.errore()).toBe('');
  });
});
