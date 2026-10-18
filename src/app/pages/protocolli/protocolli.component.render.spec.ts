import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ProtocolService } from '../../services/protocol.service';
import { ProtocolliComponent } from './protocolli.component';

/**
 * I protocolli come lista iOS: un gruppo solo, e il nuovo protocollo e'
 * l'ultima riga del gruppo (come "Registra un'uscita" nella Corsa), non un
 * tasto pieno sopra la lista.
 */
describe('ProtocolliComponent — disegno vero', () => {
  async function monta(protocolli: any[]) {
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ProtocolliComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: ProtocolService, useValue: { list: vi.fn(async () => protocolli), activate: vi.fn(), delete: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn(async () => true) } }
      ]
    });
    const fixture = TestBed.createComponent(ProtocolliComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const azione = () => root.querySelector<HTMLElement & { detail?: boolean; button?: boolean }>('.grouplist > ion-item.riga-azione');
    return { root, nav, azione };
  }

  const p = (id: string, name: string, status: string) => ({ id, name, status, source: 'pdf' });

  it('il nuovo protocollo e\' l\'ultima riga del gruppo, senza chevron, e apre la creazione', async () => {
    const { root, nav, azione } = await monta([p('a', 'Ricomposizione', 'active'), p('b', 'Massa', 'draft')]);
    const righe = Array.from(root.querySelector('.grouplist')!.children);
    expect(righe.length).toBe(3);
    expect(righe[2]).toBe(azione());
    expect(azione()!.textContent!.trim()).toBe('Nuovo protocollo');
    expect([azione()!.button, azione()!.detail]).toEqual([true, false]);
    expect(root.querySelector('ion-button.savebtn')).toBeNull();
    azione()!.click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/scheda/protocolli/nuovo']);
  });

  it('senza protocolli dice che non ce ne sono, e la riga per crearne uno c\'e\' lo stesso', async () => {
    const { root, azione } = await monta([]);
    expect(root.querySelector('.history-empty')!.textContent).toContain('Nessun protocollo ancora');
    expect(Array.from(root.querySelector('.grouplist')!.children)).toEqual([azione()]);
  });
});
