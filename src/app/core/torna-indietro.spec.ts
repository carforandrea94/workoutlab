import { vi } from 'vitest';
import { tornaDaDoveSeiVenuto } from './torna-indietro';

/**
 * Salvata una misura da Progressi, "torna a Misure" apriva Misure come prima
 * pagina della pila, e la sua freccia non sapeva dove tornare. Si torna da dove
 * si e' venuti; solo senza pila si va al punto fisso.
 */
describe('tornaDaDoveSeiVenuto', () => {
  const monta = (puoTornare: boolean | null) => {
    const nav: any = { navigateBack: vi.fn() };
    const outlet: any = puoTornare === null ? null : { canGoBack: vi.fn(() => puoTornare), pop: vi.fn(async () => undefined) };
    return { nav, outlet };
  };

  it('con una pagina prima, toglie questa dalla pila e non va a un indirizzo', () => {
    const { nav, outlet } = monta(true);
    tornaDaDoveSeiVenuto(nav, outlet, ['/progressi/misure']);
    expect(outlet.pop).toHaveBeenCalledTimes(1);
    expect(nav.navigateBack).not.toHaveBeenCalled();
  });

  it('senza pagina prima (segnalibro, ricarica, app riaperta) va al punto fisso', () => {
    const { nav, outlet } = monta(false);
    tornaDaDoveSeiVenuto(nav, outlet, ['/progressi/misure']);
    expect(nav.navigateBack).toHaveBeenCalledWith(['/progressi/misure']);
    expect(outlet.pop).not.toHaveBeenCalled();
  });

  it('senza outlet (fuori da un router outlet) va al punto fisso', () => {
    const { nav } = monta(null);
    tornaDaDoveSeiVenuto(nav, null, ['/progressi/misure']);
    expect(nav.navigateBack).toHaveBeenCalledWith(['/progressi/misure']);
  });
});
