import { eRadiceDiTab } from './tabs.page';

/**
 * La barra delle tab c'e' solo sulle quattro pagine radice: ogni altro
 * indirizzo e' una pagina interna, dove scivola via.
 */
describe('eRadiceDiTab', () => {
  it('le quattro radici', () => {
    for (const url of ['/scheda', '/dieta', '/corsa', '/account']) {
      expect(eRadiceDiTab(url)).toBe(true);
    }
  });

  it('con parametri, frammento o barra finale e\' ancora la radice', () => {
    expect(eRadiceDiTab('/scheda?x=1')).toBe(true);
    expect(eRadiceDiTab('/dieta#top')).toBe(true);
    expect(eRadiceDiTab('/corsa/')).toBe(true);
  });

  it('una pagina dentro la tab e\' interna', () => {
    expect(eRadiceDiTab('/scheda/day/2')).toBe(false);
    expect(eRadiceDiTab('/scheda/storico')).toBe(false);
    expect(eRadiceDiTab('/dieta/lista-spesa')).toBe(false);
    expect(eRadiceDiTab('/corsa/nuova?id=abc')).toBe(false);
    expect(eRadiceDiTab('/account/misure')).toBe(false);
    expect(eRadiceDiTab('/account/misure/peso')).toBe(false);
    expect(eRadiceDiTab('/account/impostazioni')).toBe(false);
  });

  it('Misure non e\' piu\' una tab: e\' una pagina dentro Account', () => {
    expect(eRadiceDiTab('/misure')).toBe(false);
  });

  it('un indirizzo che somiglia a una radice senza esserlo non conta', () => {
    expect(eRadiceDiTab('/schedaX')).toBe(false);
    expect(eRadiceDiTab('/privacy')).toBe(false);
  });

  it('l\'indirizzo di partenza conta come radice: rimanda a /scheda e la barra non deve nascondersi per un istante', () => {
    expect(eRadiceDiTab('/')).toBe(true);
    expect(eRadiceDiTab('')).toBe(true);
  });
});
