import { vi } from 'vitest';

// pdfjs-dist tocca API del browser che l'ambiente di test non ha: lo stesso
// finto degli altri test che importano il servizio dei PDF.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

import { ChangeDetectorRef } from '@angular/core';
import { IonTextarea } from '@ionic/angular';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { controllaBarraInBasso } from '../../../test-support/barra-azione';
import { PdfImportService } from '../../services/pdf-import.service';
import { ProtocolService } from '../../services/protocol.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ProtocolloImportComponent } from './protocollo-import.component';

/**
 * Una riga per voce (scheda, dieta, integrazione), come un allegato in iOS, con
 * due strade: "PDF" apre il selettore del sistema (il campo file del browser,
 * "Choose File / No file chosen" in inglese, resta nascosto) e "Incolla" apre
 * sotto la riga un campo per il testo che il coach ha mandato in chat. La riga
 * dice poi cosa e' stato dato.
 */
describe('ProtocolloImportComponent — disegno vero', () => {
  async function monta(protocolId?: string) {
    TestBed.configureTestingModule({
      imports: [ProtocolloImportComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(protocolId ? { protocolId } : {})) } },
        { provide: PdfImportService, useValue: {} },
        { provide: ProtocolService, useValue: { get: vi.fn(async () => ({ id: protocolId, name: 'P' })) } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn(async () => true) } }
      ]
    });
    const fixture = TestBed.createComponent(ProtocolloImportComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.file-pdf ion-item.riga-fonte'));
    /** I campi del testo ci sono sempre, nascosti: contano quelli che si vedono. */
    const tuttiICampi = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.file-pdf ion-item.fonte-campo'));
    const campiTesto = () => tuttiICampi().filter(e => !e.hidden);
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const campi = () => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    /** Ridisegna: con Angular senza zone il cambio di stato fatto a mano va segnato. */
    const ridisegna = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
    return { fixture, root, righe, campiTesto, tuttiICampi, testo, campi, ridisegna, c: fixture.componentInstance };
  }

  it('tre righe, una per voce, con il nome e se serve: la scheda e\' l\'unica obbligatoria', async () => {
    const { righe, testo } = await monta();
    expect(righe().map(r => testo(r.querySelector('h2')))).toEqual(['Scheda allenamento', 'Dieta', 'Integrazione']);
    expect(righe().map(r => testo(r.querySelector('p')))).toEqual(['Obbligatoria', 'Facoltativa', 'Facoltativa · finisce nella scheda Info']);
  });

  it('ogni riga ha le due strade con le parole: "PDF" e "Incolla", col nome della voce per chi non vede', async () => {
    const { righe, testo } = await monta();
    for (const riga of righe()) {
      expect(testo(riga.querySelector('ion-button.fonte-pdf'))).toBe('PDF');
      expect(testo(riga.querySelector('ion-button.fonte-testo'))).toBe('Incolla');
    }
    expect(righe().map(r => r.querySelector('ion-button.fonte-pdf')!.getAttribute('aria-label')))
      .toEqual(['Scegli il PDF: Scheda allenamento', 'Scegli il PDF: Dieta', 'Scegli il PDF: Integrazione']);
    expect(righe().map(r => r.querySelector('ion-button.fonte-testo')!.getAttribute('aria-label')))
      .toEqual(['Incolla il testo: Scheda allenamento', 'Incolla il testo: Dieta', 'Incolla il testo: Integrazione']);
  });

  it('l\'ultima riga non ha la linea di sotto, ne\' lei ne\' il suo campo: la lista finisce li\'; la riga col campo aperto neanche', async () => {
    const { righe, tuttiICampi, ridisegna } = await monta();
    const linee = (l: HTMLElement[]) => l.map(e => (e as HTMLElement & { lines?: string }).lines);
    expect(linee(righe())).toEqual(['inset', 'inset', 'none']);
    expect(linee(tuttiICampi())).toEqual(['inset', 'inset', 'none']);
    righe()[0].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
    ridisegna();
    expect(linee(righe())).toEqual(['none', 'inset', 'none']);
  });

  it('i campi file del browser ci sono, ma nascosti e con il loro nome', async () => {
    const { campi } = await monta();
    expect(campi().length).toBe(3);
    expect(campi().every(i => i.hidden)).toBe(true);
    expect(campi().map(i => i.getAttribute('aria-label'))).toEqual(['PDF della scheda allenamento', 'PDF della dieta', "PDF dell'integrazione"]);
    expect(campi().every(i => i.accept === 'application/pdf')).toBe(true);
  });

  it('"PDF" apre il selettore del suo file, non degli altri; la riga da sola non apre niente', async () => {
    const { righe, campi } = await monta();
    const aperti = campi().map(i => vi.spyOn(i, 'click').mockImplementation(() => {}));
    righe()[1].click();
    expect(aperti.map(s => s.mock.calls.length)).toEqual([0, 0, 0]);
    righe()[1].querySelector<HTMLElement>('ion-button.fonte-pdf')!.click();
    expect(aperti.map(s => s.mock.calls.length)).toEqual([0, 1, 0]);
  });

  it('"Incolla" apre il campo del testo sotto la sua riga, uno alla volta, e il secondo tocco lo chiude', async () => {
    const { righe, campiTesto, tuttiICampi, ridisegna, root } = await monta();
    expect(campiTesto().length).toBe(0);
    // Pronti ma nascosti: uno per riga, nell'ordine delle righe.
    expect(tuttiICampi().length).toBe(3);
    expect(tuttiICampi().map(e => e.querySelector('ion-textarea')!.getAttribute('aria-label')))
      .toEqual(['Testo: Scheda allenamento', 'Testo: Dieta', 'Testo: Integrazione']);

    righe()[1].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
    ridisegna();
    expect(campiTesto().length).toBe(1);
    // Sta subito sotto la riga della dieta, non in fondo alla lista.
    expect(righe()[1].nextElementSibling).toBe(campiTesto()[0]);
    const area = campiTesto()[0].querySelector('ion-textarea')!;
    expect(area.getAttribute('aria-label')).toBe('Testo: Dieta');
    expect(area.getAttribute('placeholder')).toBe('Incolla qui il testo che ti ha mandato il coach');
    expect(righe()[1].querySelector('ion-button.fonte-testo')!.getAttribute('aria-expanded')).toBe('true');
    expect(righe()[0].querySelector('ion-button.fonte-testo')!.getAttribute('aria-expanded')).toBe('false');
    expect(righe()[1].querySelector('ion-button.fonte-testo')!.classList.contains('attiva')).toBe(true);

    // Aprirne un altro chiude il primo.
    righe()[0].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
    ridisegna();
    expect(campiTesto().length).toBe(1);
    expect(righe()[0].nextElementSibling).toBe(campiTesto()[0]);

    righe()[0].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
    ridisegna();
    expect(campiTesto().length).toBe(0);
    expect(root.querySelector('ion-button.fonte-testo.attiva')).toBeNull();
  });

  it('aperto il campo, il cursore e\' gia\' dentro: a un tocco da "Incolla" si puo\' incollare', async () => {
    const setFocus = vi.spyOn(IonTextarea.prototype, 'setFocus').mockResolvedValue();
    try {
      const { righe, campiTesto } = await monta();
      righe()[2].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
      // Subito, dentro il tocco: a iOS la tastiera la apre solo il fuoco che arriva da un gesto.
      expect(campiTesto().length).toBe(1);
      expect(setFocus).toHaveBeenCalledTimes(1);
      // Quello della sua riga, la terza (integrazione): non un altro.
      expect((setFocus.mock.contexts[0] as unknown as { el: Element }).el).toBe(righe()[2].nextElementSibling!.querySelector('ion-textarea'));
    } finally {
      setFocus.mockRestore();
    }
  });

  it('scelto il file, la riga dice quale, mette la spunta e il tasto si accende', async () => {
    const { fixture, root, righe, campi, testo, c } = await monta();
    expect(c.canProcess).toBe(false);
    const tasto = root.querySelector('ion-footer.barra-azione ion-button') as any;
    expect(tasto.disabled).toBe(true);
    const pdf = new File(['%PDF'], 'scheda-ottobre.pdf', { type: 'application/pdf' });
    Object.defineProperty(campi()[0], 'files', { value: [pdf] });
    campi()[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const riga = righe()[0];
    expect(testo(riga.querySelector('p'))).toBe('scheda-ottobre.pdf');
    expect(riga.querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(true);
    expect(righe()[1].querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(false);
    expect(c.canProcess).toBe(true);
    expect(tasto.disabled).toBe(false);
  });

  it('scritto il testo, la riga dice "Testo incollato" con le righe, mette la spunta e il tasto si accende', async () => {
    const { root, righe, campiTesto, testo, ridisegna, c } = await monta();
    const tasto = root.querySelector('ion-footer.barra-azione ion-button') as any;
    expect(tasto.disabled).toBe(true);

    righe()[0].querySelector<HTMLElement>('ion-button.fonte-testo')!.click();
    ridisegna();
    const area = campiTesto()[0].querySelector('ion-textarea')!;
    area.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'Lunedi\nPanca piana 4x8\nSquat 3x10\n' } }));
    ridisegna();

    expect(c.testi.scheda).toContain('Panca piana');
    expect(testo(righe()[0].querySelector('p'))).toBe('Testo incollato · 3 righe');
    expect(righe()[0].querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(true);
    expect(tasto.disabled).toBe(false);
    // Le altre voci non cambiano.
    expect(testo(righe()[1].querySelector('p'))).toBe('Facoltativa');
  });

  it('un testo di sole righe vuote non conta: il tasto resta spento e la riga dice a cosa serve', async () => {
    const { root, righe, testo, ridisegna, c } = await monta();
    c.onTesto('scheda', '  \n \n');
    ridisegna();
    expect((root.querySelector('ion-footer.barra-azione ion-button') as any).disabled).toBe(true);
    expect(testo(righe()[0].querySelector('p'))).toBe('Obbligatoria');
    expect(righe()[0].querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(false);
  });

  it('"Elabora e crea bozza" sta nella barra in basso, come la barra delle tab, non in fondo alla pagina', async () => {
    const { fixture, root, testo } = await monta();
    const tasto = controllaBarraInBasso(fixture);
    expect(testo(tasto)).toBe('Elabora e crea bozza');
    expect(root.querySelector('ion-content ion-button.setdone, .savebar')).toBeNull();
  });

  it('nell\'aggiornamento il tasto dice "Aggiorna protocollo" e il titolo "Aggiorna il piano"', async () => {
    const { root, testo } = await monta('p1');
    expect(testo(root.querySelector('ion-footer.barra-azione ion-button'))).toBe('Aggiorna protocollo');
    expect(testo(root.querySelector('.navtitle'))).toBe('Aggiorna il piano');
  });

  it('nella creazione il titolo e\' "Importa il piano" e la nota dice che dieta e integrazione si aggiungono dopo', async () => {
    const { root, testo } = await monta();
    expect(testo(root.querySelector('.navtitle'))).toBe('Importa il piano');
    expect(testo(root)).toContain('Basta la scheda: dieta e integrazione si aggiungono dopo, da "Aggiorna il piano".');
  });

  it('nell\'aggiornamento anche la scheda e\' facoltativa', async () => {
    const { righe, testo } = await monta('p1');
    expect(testo(righe()[0].querySelector('p'))).toBe('Facoltativa');
  });
});
