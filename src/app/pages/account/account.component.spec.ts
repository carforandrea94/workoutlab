import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { AccountComponent } from './account.component';
import { AppStateService } from '../../services/app-state.service';

/**
 * Da Account si aprono l'obiettivo, in cima, e le impostazioni; le misure, dal
 * riassunto del corpo (vedi forma-card).
 */
describe('AccountComponent — le voci', () => {
  function monta(obiettivo: unknown = null, load?: () => Promise<unknown>) {
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: AuthService, useValue: { currentUser: signal({ displayName: 'Andrea Rossi', email: 'a@example.com' }) } },
        { provide: AppStateService, useValue: { load: load ?? (async () => ({ obiettivo })) } }
      ]
    });
    // Il riassunto del corpo legge mezza app: qui conta solo cosa c'e' sotto.
    TestBed.overrideComponent(AccountComponent, { remove: { imports: [FormaCardComponent] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const voci = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.voce'));
    const sotto = (v: HTMLElement) => v.querySelector('ion-label p')?.textContent?.trim() ?? '';
    return { root, nav, voci, sotto, fixture };
  }

  it('in cima Il mio obiettivo, sotto il riassunto del corpo Impostazioni: le misure stanno nel gruppo del corpo', () => {
    const { voci, root } = monta();
    expect(voci().map(v => v.querySelector('ion-label h2')!.textContent!.trim())).toEqual(['Il mio obiettivo', 'Impostazioni']);
    expect(voci().map(v => v.querySelector('app-icona')!.getAttribute('name'))).toEqual(['flag', 'settings']);
    const ordine = Array.from(root.querySelectorAll('app-forma-card, ion-item.voce')).map(e => e.tagName === 'APP-FORMA-CARD' ? 'corpo' : e.querySelector('h2')!.textContent!.trim());
    expect(ordine).toEqual(['Il mio obiettivo', 'corpo', 'Impostazioni']);
    // Portano a un'altra pagina: tasti col chevron di iOS.
    expect(voci().map(v => [(v as any).button, (v as any).detail])).toEqual([[true, true], [true, true]]);
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

  it('Il mio obiettivo apre la sua pagina, Impostazioni le impostazioni', () => {
    const { voci, nav } = monta();
    voci()[0].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/obiettivo']);
    voci()[1].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/impostazioni']);
  });
});
