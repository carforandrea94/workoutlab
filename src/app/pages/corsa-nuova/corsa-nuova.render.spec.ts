import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { controllaBarraInBasso } from '../../../test-support/barra-azione';
import { RunsService } from '../../services/runs.service';
import { RunningStateService } from '../../services/running-state.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ToastService } from '../../services/toast.service';
import { CorsaNuovaComponent } from './corsa-nuova.component';

/**
 * Nuova uscita come "Aggiungi dati" in Salute: righe con l'etichetta e il
 * valore a destra, le scelte nei segmenti con la loro intestazione, il
 * salvataggio nella barra in basso, e in modifica la riga rossa per eliminare.
 */
describe('CorsaNuovaComponent — disegno vero', () => {
  async function monta(query: Record<string, string> = {}, runs: any[] = []) {
    TestBed.configureTestingModule({
      imports: [CorsaNuovaComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
        { provide: RunsService, useValue: { save: vi.fn(async () => true), delete: vi.fn(async () => true), newId: () => 'id1' } },
        { provide: RunningStateService, useValue: { runs: () => runs, refresh: vi.fn(async () => {}) } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn(async () => true) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaNuovaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const testo = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { fixture, root, testo, c: fixture.componentInstance };
  }

  it('la data e\' una riga con l\'etichetta collegata al campo, il valore a destra', async () => {
    const { root, testo } = await monta();
    const data = root.querySelector<HTMLInputElement>('ion-list.campi input.data-riga')!;
    expect(data.type).toBe('date');
    expect(testo(root.querySelector(`label[for="${data.id}"]`))).toBe('Data');
    expect(root.querySelector('.measure-field, .measure-input-wrap')).toBeNull();
  });

  it('i minuti sono una riga con l\'etichetta di Ionic, il numero a destra e l\'unita\'', async () => {
    const { root, testo } = await monta();
    const minuti = root.querySelector<HTMLElement & { label?: string }>('ion-list.campi ion-input.a-destra')!;
    expect(minuti.label ?? minuti.getAttribute('label')).toBe('Minuti');
    expect(testo(minuti.querySelector('.unita'))).toBe('min');
  });

  it('non c\'e\' una riga "Durata" che ripete i minuti: si dice solo quando la lettura e\' diversa', async () => {
    const { root, fixture, c } = await monta();
    const nota = () => root.querySelector('p.nota-sotto');
    const scrivi = (v: string) => {
      // Si scrive come l'utente, con l'evento del campo: cambiare il modello a mano dopo il disegno da' NG0100.
      const minuti = root.querySelector('ion-input.a-destra') as any;
      minuti.value = v;
      minuti.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: v } }));
      fixture.detectChanges();
    };
    expect(root.textContent).not.toContain('Durata');
    expect(root.querySelector('ion-list.campi ion-note.valore')).toBeNull();
    expect(nota()).toBeNull();

    scrivi('40');
    expect(c.minutes).toBe('40');
    expect(nota()).toBeNull();

    scrivi('65');
    expect(nota()!.textContent!.trim()).toBe('Si legge 1h 05.');
    scrivi('1:20');
    expect(nota()!.textContent!.trim()).toBe('Si legge 1h 20.');
    scrivi('0:45');
    expect(nota()!.textContent!.trim()).toBe('Si legge 45 min.');
    scrivi('abc');
    expect(nota()).toBeNull();
    // Zero minuti non e' una durata: non si legge "0 min".
    scrivi('0:00');
    expect(nota()).toBeNull();
  });

  it('i segmenti hanno la loro intestazione, e lo stesso nome per chi non vede', async () => {
    const { root, testo } = await monta();
    const segmenti = Array.from(root.querySelectorAll('ion-segment.modulo-seg'));
    expect(segmenti.length).toBe(2);
    const intestazioni = segmenti.map(s => testo(s.previousElementSibling));
    expect(intestazioni).toEqual(['Tipo di uscita', 'Come è andata']);
    expect(segmenti.map(s => s.getAttribute('aria-label'))).toEqual(intestazioni);
  });

  it('la nota e\' una riga con l\'etichetta "Note"', async () => {
    const { root } = await monta();
    const etichette = Array.from(root.querySelectorAll<HTMLElement & { label?: string }>('ion-list.campi ion-input')).map(i => i.label ?? i.getAttribute('label'));
    expect(etichette).toEqual(['Minuti', 'Note']);
  });

  it('"Salva uscita" sta nella barra in basso, come la barra delle tab, non in fondo al modulo', async () => {
    const { fixture, root, testo } = await monta();
    const tasto = controllaBarraInBasso(fixture);
    expect(testo(tasto)).toBe('Salva uscita');
    expect(root.querySelector('ion-content ion-button')).toBeNull();
  });

  it('il tasto e\' spento finche\' non ci sono minuti, poi salva', async () => {
    const { fixture, root, c } = await monta();
    const tasto = root.querySelector('ion-footer.barra-azione ion-button') as any;
    expect(tasto.disabled).toBe(true);
    const minuti = root.querySelector('ion-input.a-destra') as any;
    minuti.value = '40';
    minuti.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: '40' } }));
    fixture.detectChanges();
    expect(tasto.disabled).toBe(false);
    const salva = vi.spyOn(c, 'save').mockResolvedValue();
    tasto.click();
    expect(salva).toHaveBeenCalled();
  });

  it('in modifica il tasto dice "Salva modifiche"', async () => {
    const run = { id: 'r1', run: { date: '2026-10-01', durationMin: 40, type: 'lento', effort: 'giusta', note: '' } };
    const { root, testo } = await monta({ id: 'r1' }, [run]);
    expect(testo(root.querySelector('ion-footer.barra-azione ion-button'))).toBe('Salva modifiche');
  });

  it('un\'uscita nuova non ha la riga per eliminarla', async () => {
    const { root } = await monta();
    expect(root.querySelector('ion-item.riga-distruttiva')).toBeNull();
  });

  it('in modifica "Elimina questa uscita" e\' una riga rossa che elimina', async () => {
    const run = { id: 'r1', run: { date: '2026-10-01', durationMin: 40, type: 'lento', effort: 'giusta', note: '' } };
    const { root, testo, c } = await monta({ id: 'r1' }, [run]);
    const riga = root.querySelector<HTMLElement>('ion-list.azioni-uscita ion-item.riga-distruttiva')!;
    expect(testo(riga)).toBe('Elimina questa uscita');
    const elimina = vi.spyOn(c, 'remove').mockResolvedValue();
    riga.click();
    expect(elimina).toHaveBeenCalled();
  });
});
