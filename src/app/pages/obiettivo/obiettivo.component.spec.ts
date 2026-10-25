import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { AppStateService } from '../../services/app-state.service';
import { ObiettivoComponent } from './obiettivo.component';

/**
 * Il mio obiettivo: una scelta fra quattro e, per chi lavora sul peso, un
 * traguardo. Si salva mentre si sceglie, come le Impostazioni di iOS.
 */
describe('ObiettivoComponent', () => {
  async function monta(obiettivo: unknown = null, load?: () => Promise<unknown>) {
    const patchField = vi.fn(async () => {});
    TestBed.configureTestingModule({
      imports: [ObiettivoComponent],
      providers: [...providerPagina(), { provide: AppStateService, useValue: { load: load ?? (async () => ({ obiettivo })), patchField } }]
    });
    const fixture = TestBed.createComponent(ObiettivoComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.caricamento()).toBe(false));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => tutti(sel).map(e => e.textContent!.replace(/\s+/g, ' ').trim());
    const aggiorna = () => fixture.detectChanges();
    return { c, root, tutti, testo, aggiorna, patchField };
  }

  it('quattro obiettivi da scegliere, ognuno con cosa vuol dire; nessuno scelto all\'inizio', async () => {
    const { tutti, testo, c } = await monta();
    expect(testo('.obiettivo-nome')).toEqual(['Mettere massa', 'Perdere grasso', 'Diventare più forte', 'Correre di più']);
    expect(testo('.obiettivo-spiega')[0]).toBe('Più muscoli, col peso che sale piano');
    expect(tutti('ion-radio').map(r => (r as any).value)).toEqual(['massa', 'grasso', 'forza', 'corsa']);
    expect((tutti('ion-radio-group')[0] as any).value ?? null).toBeNull();
    expect(c.obiettivo()).toBeNull();
    // Senza un obiettivo sul peso, il traguardo non c'e'.
    expect(tutti('.traguardo').length).toBe(0);
  });

  it('scegliere salva subito, e per chi lavora sul peso compare il traguardo', async () => {
    const { c, tutti, patchField, aggiorna } = await monta();
    c.scegli('grasso');
    aggiorna();
    expect(patchField).toHaveBeenCalledWith('obiettivo', { tipo: 'grasso', peso: null, entro: null });
    expect(tutti('ion-list.traguardo').length).toBe(1);
    // La data senza peso non serve: spenta finche' il peso non c'e'.
    expect((tutti('#traguardo-data')[0] as HTMLInputElement).disabled).toBe(true);
  });

  it('il peso si salva uscendo dal campo, con la virgola; vuoto toglie il traguardo e la data', async () => {
    const { c, patchField, tutti, aggiorna } = await monta({ tipo: 'grasso', peso: null, entro: null });
    c.impostaPeso('78,5');
    aggiorna();
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'grasso', peso: 78.5, entro: null });
    expect((tutti('#traguardo-data')[0] as HTMLInputElement).disabled).toBe(false);
    c.impostaData({ target: { value: '2027-03-31' } } as any);
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'grasso', peso: 78.5, entro: '2027-03-31' });
    c.impostaPeso('');
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'grasso', peso: null, entro: null });
  });

  it('un peso fuori misura non si salva, e lo si dice', async () => {
    const { c, patchField, testo, aggiorna } = await monta({ tipo: 'massa', peso: 85, entro: null });
    c.impostaPeso('8,5');
    aggiorna();
    expect(patchField).not.toHaveBeenCalled();
    expect(testo('.traguardo-errore')).toEqual(['Scrivi un peso fra 30 e 300 kg.']);
    expect(c.obiettivo()!.peso).toBe(85);
    c.impostaPeso('86');
    aggiorna();
    expect(testo('.traguardo-errore')).toEqual([]);
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'massa', peso: 86, entro: null });
  });

  it('da massa a grasso il traguardo resta; verso forza o corsa se ne va', async () => {
    const { c, patchField } = await monta({ tipo: 'massa', peso: 85, entro: '2027-01-31' });
    c.scegli('grasso');
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'grasso', peso: 85, entro: '2027-01-31' });
    c.scegli('forza');
    expect(patchField).toHaveBeenLastCalledWith('obiettivo', { tipo: 'forza', peso: null, entro: null });
  });

  it('rifare la stessa scelta, o lo stesso peso, non riscrive niente', async () => {
    const { c, patchField } = await monta({ tipo: 'grasso', peso: 78, entro: null });
    c.scegli('grasso');
    c.scegli('dimagrire' as any);
    c.impostaPeso('78');
    c.impostaData({ target: { value: '' } } as any);
    expect(patchField).not.toHaveBeenCalled();
  });

  it('un obiettivo salvato si ritrova, col peso scritto con la virgola', async () => {
    const { c, root } = await monta({ tipo: 'grasso', peso: 78.5, entro: '2027-03-31' });
    expect((root.querySelector('ion-radio-group') as any).value).toBe('grasso');
    expect(c.pesoScritto()).toBe('78,5');
    expect((root.querySelector('#traguardo-data') as HTMLInputElement).value).toBe('2027-03-31');
  });

  it('se lo stato non si legge, lo dice e si riprova', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let volte = 0;
    const { c, testo, aggiorna } = await monta(null, async () => {
      if (++volte === 1) throw new Error('rete');
      return { obiettivo: { tipo: 'corsa' } };
    });
    expect(testo('.history-empty')[0]).toContain('Non riesco a leggere il tuo obiettivo');
    await c.carica();
    aggiorna();
    expect(c.obiettivo()).toEqual({ tipo: 'corsa', peso: null, entro: null });
  });
});
