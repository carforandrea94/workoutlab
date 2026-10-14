import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CorsaNuovaComponent } from './corsa-nuova.component';

/**
 * Quello che si scrive nell'uscita di corsa non ha una bozza: uscire con
 * qualcosa scritto lo perde, quindi la guardia deve saperlo. Aperta e basta,
 * o appena salvata, non c'e' niente da perdere.
 */
describe('CorsaNuovaComponent — modifiche non salvate', () => {
  function pagina(query: Record<string, string> = {}, runs: any[] = []) {
    const runsSvc: any = { save: vi.fn(async () => true), delete: vi.fn(async () => true), newId: () => 'id1' };
    const state: any = { runs: () => runs, refresh: vi.fn(async () => {}) };
    const nav: any = { navigateBack: vi.fn() };
    const route: any = { queryParamMap: of(convertToParamMap(query)) };
    const confirm: any = { confirm: vi.fn(async () => true) };
    const toast: any = { success: vi.fn(), error: vi.fn() };
    const cdr: any = { detectChanges: vi.fn() };
    const c = new CorsaNuovaComponent(runsSvc, state, nav, route, confirm, toast, cdr);
    c.ngOnInit();
    return { c, nav, runsSvc };
  }

  it('appena aperta non ha niente da perdere', () => {
    expect(pagina().c.haModificheNonSalvate()).toBe(false);
  });

  it('scrivere i minuti e\' una modifica non salvata', () => {
    const { c } = pagina();
    c.minutes = '40';
    expect(c.haModificheNonSalvate()).toBe(true);
  });

  it('anche cambiare solo la nota o l\'impegno conta', () => {
    const a = pagina().c; a.note = 'gambe pesanti';
    const b = pagina().c; b.effort = 'dura';
    expect(a.haModificheNonSalvate()).toBe(true);
    expect(b.haModificheNonSalvate()).toBe(true);
  });

  it('scrivere e cancellare, tornando com\'era, non e\' una modifica', () => {
    const { c } = pagina();
    c.minutes = '40';
    c.minutes = '';
    expect(c.haModificheNonSalvate()).toBe(false);
  });

  it('gli spazi in piu\' attorno ai minuti non contano', () => {
    const { c } = pagina();
    c.minutes = '  ';
    expect(c.haModificheNonSalvate()).toBe(false);
  });

  it('dopo il salvataggio la guardia non deve chiedere', async () => {
    const { c, nav } = pagina();
    c.minutes = '40';
    await c.save();
    expect(nav.navigateBack).toHaveBeenCalledWith(['/corsa']);
    expect(c.haModificheNonSalvate()).toBe(false);
  });

  it('se il salvataggio fallisce quello scritto e\' ancora da salvare', async () => {
    const { c, runsSvc } = pagina();
    runsSvc.save.mockResolvedValueOnce(false);
    c.minutes = '40';
    await c.save();
    expect(c.haModificheNonSalvate()).toBe(true);
  });

  it('in modifica, appena caricata l\'uscita non ha niente da perdere; cambiare i minuti si', () => {
    const run = { id: 'r1', run: { date: '2026-05-01', durationMin: 45, type: 'lento', effort: 'giusta', note: '' } };
    const { c } = pagina({ id: 'r1' }, [run]);
    expect(c.haModificheNonSalvate()).toBe(false);
    c.minutes = '50';
    expect(c.haModificheNonSalvate()).toBe(true);
  });

  it('rientrando nella pagina la guardia torna attiva', async () => {
    const { c } = pagina();
    c.minutes = '40';
    await c.save();
    c.ionViewWillEnter();
    c.minutes = '41';
    expect(c.haModificheNonSalvate()).toBe(true);
  });
});
