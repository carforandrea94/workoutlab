import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { AuthService } from '../../core/services/auth.service';
import { BenvenutoComponent } from './benvenuto.component';

/**
 * Il primo avvio chiede solo quello che serve alle formule del corpo: data di nascita, sesso, altezza.
 * Il nome lo ha gia' dato l'iscrizione (si chiede solo a chi non lo ha), e il cognome non serve a
 * niente: non si chiede.
 */
describe('BenvenutoComponent — il primo avvio', () => {
  function monta(profilo: Record<string, unknown>) {
    const patchBody = vi.fn(async () => {});
    const nav = { navigateRoot: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      imports: [BenvenutoComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: AuthService, useValue: { currentUser: signal(profilo), patchBody, onboardingRimandato: false } }
      ]
    });
    const fixture = TestBed.createComponent(BenvenutoComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const campi = () => Array.from(root.querySelectorAll('.authfield label')).map(l => (l.textContent ?? '').trim());
    const c = fixture.componentInstance;
    return { fixture, root, c, campi, patchBody, nav };
  }

  it('chi ha gia\' il nome vede solo nascita, sesso e altezza', () => {
    const { campi } = monta({ displayName: 'Anna Rossi' });
    expect(campi()).toEqual(['Data di nascita', 'Sesso', 'Altezza']);
  });

  it('il cognome non si chiede mai, nemmeno a chi non ha ne\' nome ne\' cognome', () => {
    const { campi, root } = monta({});
    expect(campi()).not.toContain('Cognome');
    expect(root.querySelector('#ob-cognome')).toBeNull();
  });

  it('il nome si chiede solo a chi non ce l\'ha', () => {
    const { campi } = monta({});
    expect(campi()).toEqual(['Nome', 'Data di nascita', 'Sesso', 'Altezza']);
  });

  it('salvando, il cognome che c\'era resta com\'era e il nome intero si ricompone', async () => {
    const { c, patchBody, nav } = monta({ displayName: 'Anna Rossi' });
    c.birthDate = '1994-05-01';
    c.setSex('f');
    c.heightCm = 168;
    await c.salva();
    expect(patchBody).toHaveBeenCalledWith({
      firstName: 'Anna', lastName: 'Rossi', displayName: 'Anna Rossi',
      birthDate: '1994-05-01', sex: 'f', heightCm: 168
    });
    expect(nav.navigateRoot).toHaveBeenCalledWith(['/scheda']);
  });

  it('senza cognome si salva lo stesso, e il nome intero e\' il solo nome', async () => {
    const { c, patchBody } = monta({ displayName: 'Anna' });
    c.birthDate = '1994-05-01';
    c.setSex('f');
    c.heightCm = 168;
    await c.salva();
    expect(patchBody).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Anna', lastName: '', displayName: 'Anna' }));
  });

  it('mancano i dati delle formule: non si salva e gli errori compaiono', async () => {
    const { c, fixture, root, patchBody } = monta({ displayName: 'Anna' });
    await c.salva();
    fixture.detectChanges();
    expect(patchBody).not.toHaveBeenCalled();
    expect(Array.from(root.querySelectorAll('.fielderr')).map(e => (e.textContent ?? '').trim()))
      .toEqual(['La data di nascita è obbligatoria.', 'Scegli un\'opzione.', 'L\'altezza è obbligatoria.']);
  });
});
