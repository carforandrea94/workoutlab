import { describe, expect, it } from 'vitest';
import { GRUPPI_MUSCOLARI, MUSCLE_KEYWORDS, muscoloDaNome } from './muscolo.util';

/** Il gruppo muscolare si ricava dal nome: chi scrive "Panca inclinata" non sceglie anche "Petto". */
describe('muscoloDaNome', () => {
  it('riconosce ogni gruppo da un nome tipico', () => {
    expect(muscoloDaNome('Panca piana con bilanciere')).toBe('Petto');
    expect(muscoloDaNome('Croci ai cavi')).toBe('Petto');
    expect(muscoloDaNome('Alzate laterali')).toBe('Spalle');
    expect(muscoloDaNome('Military press')).toBe('Spalle');
    expect(muscoloDaNome('Pushdown corda')).toBe('Tricipiti');
    expect(muscoloDaNome('Dip alle parallele')).toBe('Tricipiti');
    expect(muscoloDaNome('Lat machine presa stretta')).toBe('Dorso');
    expect(muscoloDaNome('Rematore con manubrio')).toBe('Dorso');
    expect(muscoloDaNome('Curl con bilanciere')).toBe('Bicipiti');
    expect(muscoloDaNome('Squat')).toBe('Gambe');
    expect(muscoloDaNome('Leg press')).toBe('Gambe');
    expect(muscoloDaNome('Plank')).toBe('Core');
    expect(muscoloDaNome('Crunch inverso')).toBe('Core');
  });

  it('non conta maiuscole e minuscole', () => {
    expect(muscoloDaNome('squat')).toBe('Gambe');
    expect(muscoloDaNome('SQUAT')).toBe('Gambe');
  });

  it('con piu\' parole chiave vince la piu\' specifica: "Leg curl" e\' gambe, non bicipiti', () => {
    expect(muscoloDaNome('Leg curl')).toBe('Gambe');
    // "Gambe al petto" e' core, non gambe ne' petto.
    expect(muscoloDaNome('Gambe al petto')).toBe('Core');
    // "Curl alla panca" e' bicipiti, non petto.
    expect(muscoloDaNome('Curl alla panca Scott')).toBe('Bicipiti');
  });

  it('un nome che non dice niente, o vuoto, non indovina: null', () => {
    expect(muscoloDaNome('Esercizio misterioso')).toBeNull();
    expect(muscoloDaNome('')).toBeNull();
    expect(muscoloDaNome('   ')).toBeNull();
    expect(muscoloDaNome(null)).toBeNull();
    expect(muscoloDaNome(undefined)).toBeNull();
  });

  it('ogni gruppo delle parole chiave e\' uno dei gruppi del builder, e viceversa', () => {
    const gruppi = [...GRUPPI_MUSCOLARI].sort();
    expect(MUSCLE_KEYWORDS.map(k => k.muscle).sort()).toEqual(gruppi);
  });
});
