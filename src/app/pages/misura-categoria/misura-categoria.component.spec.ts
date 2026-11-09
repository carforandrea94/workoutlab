import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { MisuraCategoriaComponent } from './misura-categoria.component';

/**
 * Una misura nuova ha la sua bozza, che si salva da sola: uscire non perde
 * niente. Una in modifica no, e li' la guardia deve saperlo.
 */
describe('MisuraCategoriaComponent — uscire dalla pagina', () => {
  async function pagina(modifica: boolean, outlet: any = null) {
    const data: any = {
      getCategoryValues: vi.fn(async () => ({ peso: '80' })),
      getLastValuesWithDate: vi.fn(async () => ({})),
      parseMeasureValue: (v: string | null | undefined) => (v ? parseFloat(v.replace(',', '.')) : null),
      formatMeasureNumber: (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ','),
      loadDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {}),
      clearDraft: vi.fn(async () => {}),
      saveCategoryToday: vi.fn(async () => true),
      moveCategoryEntry: vi.fn(async () => 'ok')
    };
    const query = modifica ? { date: '2026-05-01' } : {};
    const route: any = {
      paramMap: of(convertToParamMap({ categoria: 'peso' })),
      snapshot: { queryParamMap: convertToParamMap(query) }
    };
    const nav: any = { navigateBack: vi.fn() };
    const cdr: any = { detectChanges: vi.fn() };
    const state: any = { registerSaveHandler: vi.fn(), saving: { set: vi.fn() } };
    const toast: any = { success: vi.fn(), error: vi.fn() };
    const c = new MisuraCategoriaComponent(route, nav, data, cdr, state, toast, outlet);
    c.ngOnInit();
    await vi.waitFor(() => expect(c.loading).toBe(false));
    return { c, data, nav };
  }

  it('in modifica, appena aperta, non ha niente da perdere', async () => {
    expect((await pagina(true)).c.haModificheNonSalvate()).toBe(false);
  });

  it('in modifica, cambiare un valore e\' una modifica non salvata', async () => {
    const { c } = await pagina(true);
    c.values['peso'] = '81';
    expect(c.haModificheNonSalvate()).toBe(true);
  });

  it('in modifica, cambiare solo la data conta', async () => {
    const { c } = await pagina(true);
    c.dateValue = '2026-05-02';
    expect(c.haModificheNonSalvate()).toBe(true);
  });

  it('in modifica, dopo il salvataggio non chiede', async () => {
    const { c, nav } = await pagina(true);
    c.values['peso'] = '81';
    await c.save();
    expect(nav.navigateBack).toHaveBeenCalled();
    expect(c.haModificheNonSalvate()).toBe(false);
  });

  // Registrare il peso dalla riga di Progressi e salvare riportava a Misure, mai visitata: la apriva come
  // prima pagina della pila e la sua freccia mandava in Account, senza uscita dalla tab Progressi.
  describe('salvata una misura nuova, si torna da dove si e\' venuti', () => {
    it('con una pagina prima (Progressi o Misure) toglie questa dalla pila, senza aprire Misure', async () => {
      const outlet: any = { canGoBack: vi.fn(() => true), pop: vi.fn(async () => undefined) };
      const { c, nav } = await pagina(false, outlet);
      c.values['peso'] = '80';
      await c.save();
      expect(outlet.pop).toHaveBeenCalledTimes(1);
      expect(nav.navigateBack).not.toHaveBeenCalled();
    });

    it('senza pila (pagina aperta da segnalibro o dopo una ricarica) va a Misure', async () => {
      const outlet: any = { canGoBack: vi.fn(() => false), pop: vi.fn(async () => undefined) };
      const { c, nav } = await pagina(false, outlet);
      c.values['peso'] = '80';
      await c.save();
      expect(outlet.pop).not.toHaveBeenCalled();
      expect(nav.navigateBack).toHaveBeenCalledWith(['/progressi/misure']);
    });

    it('se il salvataggio non riesce resta dov\'e\': non torna indietro', async () => {
      const outlet: any = { canGoBack: vi.fn(() => true), pop: vi.fn(async () => undefined) };
      const { c, nav, data } = await pagina(false, outlet);
      data.saveCategoryToday.mockResolvedValueOnce(false);
      c.values['peso'] = '80';
      await c.save();
      expect(outlet.pop).not.toHaveBeenCalled();
      expect(nav.navigateBack).not.toHaveBeenCalled();
    });
  });

  it('una misura nuova non chiede mai: ha la bozza', async () => {
    const { c } = await pagina(false);
    c.values['peso'] = '80';
    expect(c.haModificheNonSalvate()).toBe(false);
  });

  it('uscendo entro mezzo secondo dall\'ultima cifra la bozza si salva comunque', async () => {
    const { c, data } = await pagina(false);
    c.values['peso'] = '80';
    c.onInput();
    expect(data.saveDraft).not.toHaveBeenCalled();
    c.ngOnDestroy();
    expect(data.saveDraft).toHaveBeenCalledWith('peso', { peso: '80' });
  });

  it('se la bozza era gia\' stata salvata non si riscrive uscendo', async () => {
    vi.useFakeTimers();
    try {
      const { c, data } = await pagina(false);
      c.values['peso'] = '80';
      c.onInput();
      vi.advanceTimersByTime(600);
      expect(data.saveDraft).toHaveBeenCalledTimes(1);
      c.ngOnDestroy();
      expect(data.saveDraft).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
