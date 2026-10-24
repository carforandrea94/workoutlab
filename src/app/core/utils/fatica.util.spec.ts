import { describe, expect, it } from 'vitest';
import { MASSIMO_FATICA, PASSO_FATICA, conSconto, primaDelloStessoGruppo, scontoFatica } from './fatica.util';

/** L'ordine degli esercizi: piu' esercizi dello stesso gruppo davanti, pesi un po' piu' bassi. */
describe('fatica per l\'ordine', () => {
  it('conta gli esercizi dello stesso gruppo che vengono prima', () => {
    const gruppi = ['Petto', 'Spalle', 'Petto', 'Tricipiti', 'Petto'];
    expect(primaDelloStessoGruppo(gruppi, 0)).toBe(0);
    expect(primaDelloStessoGruppo(gruppi, 2)).toBe(1);
    expect(primaDelloStessoGruppo(gruppi, 4)).toBe(2);
    expect(primaDelloStessoGruppo(gruppi, 3)).toBe(0);
  });

  it('un gruppo sconosciuto non conta, ne\' come esercizio ne\' davanti', () => {
    expect(primaDelloStessoGruppo([undefined, 'Petto', null, 'Petto'], 3)).toBe(1);
    expect(primaDelloStessoGruppo(['Petto', null], 1)).toBe(0);
    expect(primaDelloStessoGruppo(['Petto'], -1)).toBe(0);
  });

  it('5% per ogni esercizio in piu\' davanti, fino al 10%', () => {
    expect(PASSO_FATICA).toBe(5);
    expect(MASSIMO_FATICA).toBe(10);
    expect(scontoFatica(1, 0)).toBe(5);
    expect(scontoFatica(2, 0)).toBe(10);
    expect(scontoFatica(4, 1)).toBe(10);
  });

  it('stesso ordine, o meno esercizi davanti: niente sconto (e mai un aumento)', () => {
    expect(scontoFatica(1, 1)).toBe(0);
    expect(scontoFatica(0, 2)).toBe(0);
    expect(scontoFatica(NaN, 0)).toBe(0);
  });

  it('il peso scontato va al mezzo chilo', () => {
    expect(conSconto(80, 5)).toBe(76);
    expect(conSconto(77.5, 5)).toBe(73.5);
    expect(conSconto(80, 10)).toBe(72);
    expect(conSconto(80, 0)).toBe(80);
  });
});
