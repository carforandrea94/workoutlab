import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { AccountComponent } from './account.component';

/** Da Account si aprono le misure (che non hanno piu' una tab) e le impostazioni. */
describe('AccountComponent — le voci', () => {
  function monta() {
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: AuthService, useValue: { currentUser: signal({ displayName: 'Andrea Rossi', email: 'a@example.com' }) } }
      ]
    });
    // Il riassunto del corpo legge mezza app: qui conta solo cosa c'e' sotto.
    TestBed.overrideComponent(AccountComponent, { remove: { imports: [FormaCardComponent] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const voci = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.voce'));
    return { root, nav, voci };
  }

  it('Misure, poi Impostazioni, sotto il riassunto del corpo', () => {
    const { voci, root } = monta();
    expect(voci().map(v => v.querySelector('ion-label h2')!.textContent!.trim())).toEqual(['Misure', 'Impostazioni']);
    expect(voci()[0].querySelector('ion-label p')!.textContent!.trim()).toBe('Peso, centimetri e pliche, con andamento e storico');
    expect(voci()[0].querySelector('app-icona')!.getAttribute('name')).toBe('body');
    const ordine = Array.from(root.querySelectorAll('app-forma-card, ion-item.voce'));
    expect(ordine[0].tagName).toBe('APP-FORMA-CARD');
    // Portano a un'altra pagina: tasto col chevron di iOS.
    expect(voci().map(v => [(v as any).button, (v as any).detail])).toEqual([[true, true], [true, true]]);
  });

  it('Misure apre le misure, nella pila di Account', () => {
    const { voci, nav } = monta();
    voci()[0].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/misure']);
  });

  it('Impostazioni apre le impostazioni', () => {
    const { voci, nav } = monta();
    voci()[1].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/impostazioni']);
  });
});
