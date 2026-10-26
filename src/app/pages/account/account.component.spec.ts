import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { BilancioSettimanaComponent } from '../../components/bilancio-settimana/bilancio-settimana.component';
import { AuthService } from '../../core/services/auth.service';
import { AccountComponent } from './account.component';
import { AppStateService } from '../../services/app-state.service';
import { PromemoriaService } from '../../services/promemoria.service';

/**
 * Da Account si aprono l'obiettivo e i promemoria, in cima, e le impostazioni;
 * le misure, dal riassunto del corpo (vedi forma-card).
 */
describe('AccountComponent — le voci', () => {
  function monta(obiettivo: unknown = null, load?: () => Promise<unknown>, promemoria?: () => Promise<unknown>) {
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: AuthService, useValue: { currentUser: signal({ displayName: 'Andrea Rossi', email: 'a@example.com' }) } },
        { provide: AppStateService, useValue: { load: load ?? (async () => ({ obiettivo })) } },
        { provide: PromemoriaService, useValue: { carica: promemoria ?? (async () => ({ attivo: false, giorni: [1, 3, 5], ora: '18:00' })) } }
      ]
    });
    // Il riassunto del corpo legge mezza app: qui conta solo cosa c'e' sotto.
    TestBed.overrideComponent(AccountComponent, { remove: { imports: [FormaCardComponent, BilancioSettimanaComponent] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const voci = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.voce'));
    const sotto = (v: HTMLElement) => v.querySelector('ion-label p')?.textContent?.trim() ?? '';
    return { root, nav, voci, sotto, fixture };
  }

  it('in cima Il mio obiettivo e i Promemoria, sotto il riassunto del corpo Impostazioni: le misure stanno nel gruppo del corpo', () => {
    const { voci, root } = monta();
    expect(voci().map(v => v.querySelector('ion-label h2')!.textContent!.trim())).toEqual(['Il mio obiettivo', 'Promemoria', 'Impostazioni']);
    expect(voci().map(v => v.querySelector('app-icona')!.getAttribute('name'))).toEqual(['flag', 'notifications', 'settings']);
    const ordine = Array.from(root.querySelectorAll('app-forma-card, ion-item.voce')).map(e => e.tagName === 'APP-FORMA-CARD' ? 'corpo' : e.querySelector('h2')!.textContent!.trim());
    expect(ordine).toEqual(['Il mio obiettivo', 'Promemoria', 'corpo', 'Impostazioni']);
    // Obiettivo e promemoria nello stesso gruppo: vanno insieme.
    expect(voci()[0].parentElement).toBe(voci()[1].parentElement);
    // Portano a un'altra pagina: tasti col chevron di iOS.
    expect(voci().map(v => [(v as any).button, (v as any).detail])).toEqual([[true, true], [true, true], [true, true]]);
  });

  it('la riga dei promemoria dice giorni e ora, o che sono spenti', async () => {
    const spenti = monta();
    await vi.waitFor(() => { spenti.fixture.detectChanges(); expect(spenti.sotto(spenti.voci()[1])).toBe('Spenti'); });
    TestBed.resetTestingModule();
    const accesi = monta(null, undefined, async () => ({ attivo: true, giorni: [1, 3, 5], ora: '18:00' }));
    await vi.waitFor(() => { accesi.fixture.detectChanges(); expect(accesi.sotto(accesi.voci()[1])).toBe('Lun, mer, ven alle 18:00'); });
  });

  it('se i promemoria non si leggono, la riga dice "Spenti"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { voci, sotto, fixture } = monta(null, undefined, async () => { throw new Error('rete'); });
    await Promise.resolve();
    fixture.detectChanges();
    expect(sotto(voci()[1])).toBe('Spenti');
  });

  it('senza obiettivo la riga invita a sceglierlo; con l\'obiettivo lo dice, col traguardo', async () => {
    const vuoto = monta();
    expect(vuoto.sotto(vuoto.voci()[0])).toBe('Scegli dove vuoi arrivare');
    TestBed.resetTestingModule();
    const pieno = monta({ tipo: 'grasso', peso: 78, entro: null });
    await vi.waitFor(() => { pieno.fixture.detectChanges(); expect(pieno.sotto(pieno.voci()[0])).toBe('Perdere grasso · 78 kg'); });
  });

  it('se lo stato non si legge, resta l\'invito e la pagina c\'e\' lo stesso', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { voci, sotto, fixture } = monta(null, async () => { throw new Error('rete'); });
    await Promise.resolve();
    fixture.detectChanges();
    expect(sotto(voci()[0])).toBe('Scegli dove vuoi arrivare');
  });

  it('Il mio obiettivo apre la sua pagina, Promemoria la sua, Impostazioni le impostazioni', () => {
    const { voci, nav } = monta();
    voci()[0].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/obiettivo']);
    voci()[1].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/promemoria']);
    voci()[2].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/impostazioni']);
  });
});
