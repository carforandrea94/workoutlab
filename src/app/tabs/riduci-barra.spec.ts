import { beforeEach, describe, expect, it } from 'vitest';
import { CIMA_PX, RiduciBarra, SOGLIA_PX } from './riduci-barra';

/** La decisione della barra che si fa piccola: si passano le posizioni, si guarda cosa decide. */
describe('RiduciBarra', () => {
  let stati: boolean[];
  let riduci: RiduciBarra;
  const pagina = {};
  const MAX = 2000;

  beforeEach(() => {
    stati = [];
    riduci = new RiduciBarra(r => stati.push(r));
  });

  it('scorrendo in giu\' si fa piccola, tornando su torna intera', () => {
    riduci.scorri(pagina, 100, MAX);
    riduci.scorri(pagina, 100 + SOGLIA_PX + 1, MAX);
    expect(stati).toEqual([true]);
    riduci.scorri(pagina, 100 - 1, MAX);
    expect(stati).toEqual([true, false]);
  });

  it('in cima e\' sempre intera, anche scorrendo in giu\'', () => {
    riduci.scorri(pagina, 0, MAX);
    riduci.scorri(pagina, CIMA_PX - 1, MAX);
    expect(stati).toEqual([false, false]);
    riduci.scorri(pagina, CIMA_PX + SOGLIA_PX + 1, MAX);
    expect(stati).toEqual([false, false, true]);
  });

  it('il primo evento di una pagina lontano dalla cima fa solo da punto di partenza', () => {
    riduci.scorri(pagina, 500, MAX);
    expect(stati).toEqual([]);
  });

  it('il dito che trema non la fa cambiare: serve piu\' della soglia', () => {
    riduci.scorri(pagina, 300, MAX);
    riduci.scorri(pagina, 300 + SOGLIA_PX, MAX);
    riduci.scorri(pagina, 300 - SOGLIA_PX, MAX);
    expect(stati).toEqual([]);
  });

  it('uno scorrimento lento, pochi pixel alla volta, si somma', () => {
    riduci.scorri(pagina, 300, MAX);
    for (let y = 302; y <= 300 + SOGLIA_PX + 2; y += 2) riduci.scorri(pagina, y, MAX);
    expect(stati).toEqual([true]);
  });

  it('il rimbalzo oltre il fondo non e\' uno scorrimento verso l\'alto', () => {
    riduci.scorri(pagina, 900, 1000);
    riduci.scorri(pagina, 1000, 1000);
    expect(stati).toEqual([true]);
    // iOS va oltre il fondo e torna: conta il fondo, che non si e' mosso.
    riduci.scorri(pagina, 1060, 1000);
    riduci.scorri(pagina, 1000, 1000);
    expect(stati).toEqual([true]);
  });

  it('tirando oltre la cima (pull-to-refresh) e\' intera', () => {
    riduci.scorri(pagina, -80, MAX);
    expect(stati).toEqual([false]);
  });

  it('ogni pagina ha il suo punto: quello di un\'altra tab non conta', () => {
    const altra = {};
    riduci.scorri(pagina, 800, MAX);
    // L'altra pagina e' molto piu' su: per lei e' il primo evento, non uno scorrimento in su di 700.
    riduci.scorri(altra, 100, MAX);
    expect(stati).toEqual([]);
    riduci.scorri(altra, 100 + SOGLIA_PX + 1, MAX);
    expect(stati).toEqual([true]);
  });
});

/**
 * Senza scrollEvents ion-content non manda ionScroll, e la barra non saprebbe
 * mai che si sta scorrendo: vale per ognuna delle quattro pagine radice.
 */
describe('le pagine radice delle tab dicono quando scorrono', () => {
  it.each([
    'src/app/pages/scheda-list/scheda-list.component.html',
    'src/app/pages/dieta/dieta.component.html',
    'src/app/pages/corsa/corsa.component.html',
    'src/app/pages/account/account.component.html'
  ])('%s', async file => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    const html: string = fs.readFileSync(file, 'utf8');
    expect(html).toMatch(/<ion-content[^>]*\[scrollEvents\]="true"/);
  });
});
