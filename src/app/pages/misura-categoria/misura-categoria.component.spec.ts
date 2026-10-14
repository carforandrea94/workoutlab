import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { MisuraCategoriaComponent } from './misura-categoria.component';

/**
 * Una misura nuova ha la sua bozza, che si salva da sola: uscire non perde
 * niente. Una in modifica no, e li' la guardia deve saperlo.
 */
describe('MisuraCategoriaComponent — uscire dalla pagina', () => {
  async function pagina(modifica: boolean) {
    const data: any = {
      getCategoryValues: vi.fn(async () => ({ peso: '80' })),
      getLastValues: vi.fn(async () => ({})),
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
    const c = new MisuraCategoriaComponent(route, nav, data, cdr, state, toast);
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
