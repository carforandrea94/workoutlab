import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { ImpostazioniComponent } from './impostazioni.component';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { AppStateService } from '../../services/app-state.service';
import { AMBIENTE_SUONO, PREFERENZE_SEGNALE_KEY } from '../../core/utils/segnale.util';

/**
 * Il segnale di fine recupero si sceglie qui: suono e vibrazione, per questo
 * dispositivo. Dove il browser non vibra (iPhone dalla Home) l'interruttore
 * della vibrazione non c'e': non farebbe niente.
 */
describe('Impostazioni — il segnale di fine recupero (disegno vero)', () => {
  beforeEach(() => localStorage.removeItem(PREFERENZE_SEGNALE_KEY));
  afterEach(() => {
    delete (navigator as any).vibrate;
    localStorage.removeItem(PREFERENZE_SEGNALE_KEY);
  });

  async function monta(opzioni: { vibra?: boolean } = {}) {
    if (opzioni.vibra) Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true, writable: true });
    TestBed.configureTestingModule({
      imports: [ImpostazioniComponent],
      providers: [
        ...providerPagina(),
        { provide: AuthService, useValue: { currentUser: signal({ email: 'a@b.it', name: 'Ada' }), usesPassword: () => true } },
        { provide: ThemeService, useValue: { mode: signal('dark'), setMode: vi.fn() } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: WorkoutSessionStateService, useValue: { clearLocalCache: vi.fn() } },
        { provide: AppStateService, useValue: { load: async () => ({ loadPercent: null }), patchField: async () => {} } },
        { provide: AMBIENTE_SUONO, useValue: { crea: null, contesto: null } }
      ]
    });
    const fixture = TestBed.createComponent(ImpostazioniComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const interruttori = () => Array.from(root.querySelectorAll<HTMLElement>('ion-toggle'));
    const per = (testo: string) => interruttori().find(t => (t.textContent ?? '').includes(testo));
    const scegli = async (el: HTMLElement, checked: boolean) => {
      el.dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, root, per, scegli };
  }

  it('c\'e\' il suono a fine recupero, acceso di partenza', async () => {
    const { per } = await monta();
    const suono = per('Suono a fine recupero') as any;
    expect(suono).toBeTruthy();
    expect(suono.checked).toBe(true);
  });

  it('dove il browser vibra c\'e\' anche la vibrazione', async () => {
    const { per } = await monta({ vibra: true });
    expect(per('Vibrazione')).toBeTruthy();
  });

  it('dove non vibra (iPhone dalla Home) l\'interruttore non c\'e\' e la pagina lo dice', async () => {
    const { per, root } = await monta({ vibra: false });
    expect(per('Vibrazione')).toBeUndefined();
    expect(root.textContent).toContain('la vibrazione non è disponibile: resta il suono');
  });

  it('dove vibra la pagina non dice che la vibrazione manca', async () => {
    const { root } = await monta({ vibra: true });
    expect(root.textContent).not.toContain('non è disponibile');
  });

  it('spegnere il suono lo salva su questo dispositivo', async () => {
    const { per, scegli } = await monta();
    await scegli(per('Suono a fine recupero')!, false);
    expect(JSON.parse(localStorage.getItem(PREFERENZE_SEGNALE_KEY)!)).toEqual({ suono: false, vibrazione: true });
  });

  it('spegnere la vibrazione la salva e lascia il suono', async () => {
    const { per, scegli } = await monta({ vibra: true });
    await scegli(per('Vibrazione')!, false);
    expect(JSON.parse(localStorage.getItem(PREFERENZE_SEGNALE_KEY)!)).toEqual({ suono: true, vibrazione: false });
  });

  it('le preferenze salvate tornano all\'apertura della pagina', async () => {
    localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: false, vibrazione: true }));
    const { per } = await monta();
    expect((per('Suono a fine recupero') as any).checked).toBe(false);
  });

  it('dice che vale per il dispositivo, non per l\'account', async () => {
    const { root } = await monta();
    expect(root.textContent).toContain('Vale per questo dispositivo');
  });

  /**
   * Uscire e chiudere l'account sono righe in fondo, come in Impostazioni di
   * iOS: "Esci" d'accento (si rientra e c'e' tutto), "Elimina account" rossa,
   * ognuna con la spiegazione sotto.
   */
  describe('in fondo: Esci ed Elimina account', () => {
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('"Esci" e\' una riga che esce, con sotto cosa succede', async () => {
      const { root, fixture } = await monta();
      const esci = root.querySelector<HTMLElement>('ion-list.azioni-account ion-item.riga-esci')!;
      expect(testo(esci)).toBe('Esci');
      const c = fixture.componentInstance as any;
      const spia = vi.spyOn(c, 'logout').mockResolvedValue(undefined);
      esci.click();
      expect(spia).toHaveBeenCalled();
      expect(testo(esci.closest('ion-list')!.nextElementSibling)).toContain('Uscire non cancella niente');
    });

    it('"Elimina account" e\' una riga rossa che apre il foglio di conferma', async () => {
      const { root, fixture } = await monta();
      const elimina = root.querySelector<HTMLElement>('ion-list.azioni-account ion-item.riga-distruttiva')!;
      expect(testo(elimina)).toBe('Elimina account');
      elimina.click();
      fixture.detectChanges();
      expect((fixture.componentInstance as any).deleteSheetOpen).toBe(true);
      expect(testo(elimina.closest('ion-list')!.nextElementSibling)).toContain('Non si annulla');
    });

    it('i vecchi tasti pieni non ci sono piu\'', async () => {
      const { root } = await monta();
      const tasti = Array.from(root.querySelectorAll('ion-content > .wrap ion-button, ion-content ion-button.confirmbtn.w-full')).map(b => testo(b));
      expect(tasti).not.toContain('Esci');
      expect(tasti).not.toContain('Elimina account');
    });
  });
});
