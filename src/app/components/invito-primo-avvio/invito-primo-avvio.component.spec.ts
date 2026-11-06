import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { ProtocolService } from '../../services/protocol.service';
import { ToastService } from '../../services/toast.service';
import { InvitoPrimoAvvioComponent } from './invito-primo-avvio.component';

/**
 * Il primo avvio senza protocollo: "Carica il PDF" porta dritto all'importazione, "Scrivila a mano"
 * crea il protocollo vuoto e apre il builder. Prima si passava da Protocolli e da Nuovo protocollo.
 */
describe('InvitoPrimoAvvioComponent', () => {
  const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function monta(create: () => Promise<string> = async () => 'nuovo1', extra: { etichettaMano?: string } = {}) {
    const protocolSvc = { create: vi.fn(create) };
    const nav = { navigateForward: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      imports: [InvitoPrimoAvvioComponent],
      providers: [
        ...providerPagina(),
        { provide: ProtocolService, useValue: protocolSvc },
        { provide: NavController, useValue: nav }
      ]
    });
    const fixture = TestBed.createComponent(InvitoPrimoAvvioComponent);
    fixture.componentRef.setInput('titolo', 'Carica la tua scheda');
    fixture.componentRef.setInput('testo', 'Se te l\'ha data il coach, parti dal PDF.');
    if (extra.etichettaMano) fixture.componentRef.setInput('etichettaMano', extra.etichettaMano);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const primario = () => root.querySelector<HTMLElement>('ion-button.savebtn')!;
    const aMano = () => root.querySelector<HTMLElement & { disabled?: boolean }>('ion-button.invito-mano')!;
    return { fixture, root, protocolSvc, nav, primario, aMano };
  }

  it('titolo e testo sono quelli che gli si danno', () => {
    const { root } = monta();
    expect(testo(root.querySelector('strong'))).toBe('Carica la tua scheda');
    expect(testo(root)).toContain('Se te l\'ha data il coach, parti dal PDF.');
  });

  it('"Carica il PDF" porta dritto all\'importazione', () => {
    const { primario } = monta();
    expect(testo(primario())).toBe('Carica il PDF');
    expect(primario().getAttribute('routerLink')).toBe('/scheda/protocolli/importa-pdf');
    expect(primario().getAttribute('routerDirection')).toBe('forward');
  });

  it('il tasto a mano segue il genere di quello che si scrive', () => {
    expect(testo(monta().aMano())).toBe('Scrivila a mano');
    TestBed.resetTestingModule();
    expect(testo(monta(undefined, { etichettaMano: 'Scrivilo a mano' }).aMano())).toBe('Scrivilo a mano');
  });

  it('"Scrivila a mano" crea il protocollo vuoto e apre il builder', async () => {
    const { aMano, protocolSvc, nav } = monta();
    aMano().click();
    await vi.waitFor(() => expect(nav.navigateForward).toHaveBeenCalledWith(['/scheda/protocolli/builder', 'nuovo1']));
    expect(protocolSvc.create).toHaveBeenCalledTimes(1);
  });

  it('mentre il protocollo si crea il tasto e\' spento: un secondo tocco non ne crea due', async () => {
    let finisci: (id: string) => void = () => {};
    const { aMano, fixture, protocolSvc } = monta(() => new Promise<string>(r => { finisci = r; }));
    aMano().click();
    fixture.detectChanges();
    expect(aMano().disabled).toBe(true);
    aMano().click();
    expect(protocolSvc.create).toHaveBeenCalledTimes(1);
    finisci('nuovo1');
    await vi.waitFor(() => { fixture.detectChanges(); expect(aMano().disabled).toBe(false); });
  });

  it('se la creazione fallisce lo dice, non apre niente e il tasto torna acceso', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { aMano, nav, fixture } = monta(async () => { throw new Error('rete'); });
    aMano().click();
    await vi.waitFor(() => expect(TestBed.inject(ToastService).toast()?.message).toBe('Non sono riuscito a creare il protocollo. Riprova.'));
    expect(nav.navigateForward).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(aMano().disabled).toBe(false);
  });
});
