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

  /**
   * La riga di un protocollo come quelle di iOS: lo stato e' il badge delle
   * liste ("Attivo" pieno, "Bozza" spento), "Attiva" e' un tasto di testo, e
   * si elimina scorrendo (o da dentro, nel builder): niente cestino in riga.
   */
  describe('la riga di un protocollo', () => {
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('lo stato e\' il badge delle liste: pieno se attivo, spento se bozza', async () => {
      const { root } = await monta([p('a', 'Ricomposizione', 'active'), p('b', 'Massa', 'draft')]);
      const badge = Array.from(root.querySelectorAll('.protocol-row ion-badge.stato'));
      expect(badge.map(b => testo(b))).toEqual(['Attivo', 'Bozza']);
      expect(badge.map(b => b.classList.contains('bozza'))).toEqual([false, true]);
      expect(root.querySelector('.protocol-status')).toBeNull();
    });

    it('"Attiva" e\' un tasto di testo, solo per chi non e\' attivo, e dice quale protocollo attiva', async () => {
      const { root } = await monta([p('a', 'Ricomposizione', 'active'), p('b', 'Massa', 'draft')]);
      const attiva = Array.from(root.querySelectorAll<HTMLElement & { fill?: string }>('ion-button.attiva-btn'));
      expect(attiva.length).toBe(1);
      expect(testo(attiva[0])).toBe('Attiva');
      expect(attiva[0].fill).toBe('clear');
      // Ionic porta il nome sul <button> vero, dentro il componente: e' quello che legge lo screen reader.
      expect(attiva[0].shadowRoot!.querySelector('button')!.getAttribute('aria-label')).toBe('Attiva il protocollo Massa');
    });

    it('niente cestino in riga: scorrendo compare "Elimina" in rosso, che chiede ed elimina', async () => {
      const { root } = await monta([p('a', 'Ricomposizione', 'active')]);
      expect(root.querySelector('.protocol-row ion-button.delete-btn')).toBeNull();
      const svc = TestBed.inject(ProtocolService) as any;
      const opzione = root.querySelector<HTMLElement>('ion-item-sliding ion-item-option.elimina')!;
      expect(testo(opzione)).toBe('Elimina');
      opzione.click();
      await vi.waitFor(() => expect(svc.delete).toHaveBeenCalledWith('a'));
      expect(TestBed.inject(ConfirmDialogService).confirm).toHaveBeenCalledWith('Eliminare il protocollo "Ricomposizione"?');
    });
  });
});
