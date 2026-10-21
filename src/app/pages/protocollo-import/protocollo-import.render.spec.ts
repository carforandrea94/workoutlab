import { vi } from 'vitest';

// pdfjs-dist tocca API del browser che l'ambiente di test non ha: lo stesso
// finto degli altri test che importano il servizio dei PDF.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  version: '0.0.0',
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) })
}));

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
 * I PDF si scelgono da una riga per file, come un allegato in iOS: il campo
 * file del browser ("Choose File / No file chosen", in inglese) resta
 * nascosto e la riga lo apre, poi dice quale file e' stato scelto.
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
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('ion-list.file-pdf ion-item'));
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const campi = () => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    return { fixture, root, righe, testo, campi, c: fixture.componentInstance };
  }

  it('tre righe, una per PDF, con il nome e se serve: la scheda e\' l\'unica obbligatoria', async () => {
    const { righe, testo } = await monta();
    expect(righe().map(r => testo(r.querySelector('h2')))).toEqual(['Scheda allenamento', 'Dieta', 'Integrazione']);
    expect(righe().map(r => testo(r.querySelector('p')))).toEqual(['Obbligatoria', 'Facoltativa', 'Facoltativa · finisce nella scheda Info']);
    expect(righe().map(r => testo(r.querySelector('ion-note')))).toEqual(['Scegli', 'Scegli', 'Scegli']);
  });

  it('i campi file del browser ci sono, ma nascosti e con il loro nome', async () => {
    const { campi } = await monta();
    expect(campi().length).toBe(3);
    expect(campi().every(i => i.hidden)).toBe(true);
    expect(campi().map(i => i.getAttribute('aria-label'))).toEqual(['PDF della scheda allenamento', 'PDF della dieta', "PDF dell'integrazione"]);
    expect(campi().every(i => i.accept === 'application/pdf')).toBe(true);
  });

  it('toccare una riga apre il selettore del suo file, non degli altri', async () => {
    const { righe, campi } = await monta();
    const aperti = campi().map(i => vi.spyOn(i, 'click').mockImplementation(() => {}));
    righe()[1].click();
    expect(aperti.map(s => s.mock.calls.length)).toEqual([0, 1, 0]);
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
    expect(testo(riga.querySelector('ion-note'))).toBe('Cambia');
    expect(riga.querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(true);
    expect(righe()[1].querySelector('app-icona.file-segno')!.classList.contains('scelto')).toBe(false);
    expect(c.canProcess).toBe(true);
    expect(tasto.disabled).toBe(false);
  });

  it('"Elabora e crea bozza" sta nella barra in basso, come la barra delle tab, non in fondo alla pagina', async () => {
    const { fixture, root, testo } = await monta();
    const tasto = controllaBarraInBasso(fixture);
    expect(testo(tasto)).toBe('Elabora e crea bozza');
    expect(root.querySelector('ion-content ion-button, .savebar')).toBeNull();
  });

  it('nell\'aggiornamento il tasto dice "Aggiorna protocollo"', async () => {
    const { root, testo } = await monta('p1');
    expect(testo(root.querySelector('ion-footer.barra-azione ion-button'))).toBe('Aggiorna protocollo');
  });

  it('nell\'aggiornamento anche la scheda e\' facoltativa', async () => {
    const { righe, testo } = await monta('p1');
    expect(testo(righe()[0].querySelector('p'))).toBe('Facoltativa');
  });
});
