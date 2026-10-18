import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { AuthService } from '../../core/services/auth.service';
import { AccountComponent } from './account.component';

/** Da Account si aprono le impostazioni; le misure, dal riassunto del corpo (vedi forma-card). */
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

  it('sotto il riassunto del corpo, solo Impostazioni: le misure stanno nel gruppo del corpo', () => {
    const { voci, root } = monta();
    expect(voci().map(v => v.querySelector('ion-label h2')!.textContent!.trim())).toEqual(['Impostazioni']);
    expect(voci()[0].querySelector('app-icona')!.getAttribute('name')).toBe('settings');
    const ordine = Array.from(root.querySelectorAll('app-forma-card, ion-item.voce'));
    expect(ordine[0].tagName).toBe('APP-FORMA-CARD');
    // Porta a un'altra pagina: tasto col chevron di iOS.
    expect(voci().map(v => [(v as any).button, (v as any).detail])).toEqual([[true, true]]);
  });

  it('Impostazioni apre le impostazioni', () => {
    const { voci, nav } = monta();
    voci()[0].click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/account/impostazioni']);
  });
});
