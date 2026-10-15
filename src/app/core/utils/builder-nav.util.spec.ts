import {
  PosizioneBuilder, chiaveBuilder, direzioneBuilder, etichettaFattoBuilder, etichettaSuBuilder, livelloBuilder, titoloBuilder
} from './builder-nav.util';

const base: PosizioneBuilder = { scheda: 'scheda', giorno: null, esercizio: null, piano: null, pasto: null };
const inGiorno = (label = 'Petto'): PosizioneBuilder => ({ ...base, giorno: { label } });
const inEsercizio = (name = 'Panca', isNew = false): PosizioneBuilder => ({ ...inGiorno(), esercizio: { name, isNew } });
const inPiano = (name = 'Giorno ON'): PosizioneBuilder => ({ ...base, scheda: 'dieta', piano: { id: 'p1', name } });
const inPasto = (name = 'Colazione'): PosizioneBuilder => ({ ...inPiano(), pasto: { id: 'm1', name } });

describe('navigazione dentro l\'editor del protocollo', () => {
  describe('livelloBuilder', () => {
    it('sull\'elenco e\' 0, in un giorno 1, in un esercizio 2', () => {
      expect(livelloBuilder(base)).toBe(0);
      expect(livelloBuilder(inGiorno())).toBe(1);
      expect(livelloBuilder(inEsercizio())).toBe(2);
    });

    it('nella dieta: piano 1, pasto 2', () => {
      expect(livelloBuilder({ ...base, scheda: 'dieta' })).toBe(0);
      expect(livelloBuilder(inPiano())).toBe(1);
      expect(livelloBuilder(inPasto())).toBe(2);
    });

    it('Corsa e Info non hanno livelli, anche se un giorno e\' rimasto aperto', () => {
      expect(livelloBuilder({ ...inGiorno(), scheda: 'corsa' })).toBe(0);
      expect(livelloBuilder({ ...inPiano(), scheda: 'info' })).toBe(0);
    });

    it('un giorno aperto non conta nella dieta, un piano aperto non conta nella scheda', () => {
      expect(livelloBuilder({ ...inGiorno(), scheda: 'dieta' })).toBe(0);
      expect(livelloBuilder({ ...inPiano(), scheda: 'scheda' })).toBe(0);
    });
  });

  describe('titoloBuilder', () => {
    it('sull\'elenco dice Protocollo', () => {
      expect(titoloBuilder(base)).toBe('Protocollo');
    });

    it('in un giorno dice il nome del giorno, in un esercizio il suo nome', () => {
      expect(titoloBuilder(inGiorno('Petto e tricipiti'))).toBe('Petto e tricipiti');
      expect(titoloBuilder(inEsercizio('Panca piana'))).toBe('Panca piana');
    });

    it('con il nome vuoto dice cos\'e\', e distingue il nuovo dall\'esistente', () => {
      expect(titoloBuilder(inGiorno('  '))).toBe('Giorno senza nome');
      expect(titoloBuilder(inEsercizio('', true))).toBe('Nuovo esercizio');
      expect(titoloBuilder(inEsercizio('', false))).toBe('Esercizio senza nome');
    });

    it('nella dieta dice il piano e il pasto', () => {
      expect(titoloBuilder(inPiano('Rifeed'))).toBe('Rifeed');
      expect(titoloBuilder(inPasto('Cena'))).toBe('Cena');
      expect(titoloBuilder(inPiano(''))).toBe('Piano senza nome');
      expect(titoloBuilder(inPasto(''))).toBe('Pasto senza nome');
    });
  });

  describe('etichette', () => {
    it('la freccia dice dove porta', () => {
      expect(etichettaSuBuilder(base)).toBe('Indietro');
      expect(etichettaSuBuilder(inGiorno())).toBe('Torna ai giorni');
      expect(etichettaSuBuilder(inEsercizio())).toBe('Torna al giorno');
      expect(etichettaSuBuilder(inPiano())).toBe('Torna ai piani');
      expect(etichettaSuBuilder(inPasto())).toBe('Torna al piano');
    });

    it('il tasto Fatto dice cosa fa', () => {
      expect(etichettaFattoBuilder(inGiorno())).toBe('Salva il giorno');
      expect(etichettaFattoBuilder(inEsercizio())).toBe('Salva l\'esercizio');
      expect(etichettaFattoBuilder(inPiano())).toBe('Fatto con il piano');
      expect(etichettaFattoBuilder(inPasto())).toBe('Fatto con il pasto');
    });
  });

  describe('chiaveBuilder', () => {
    it('cambia da una schermata all\'altra', () => {
      const chiavi = [base, inGiorno(), inEsercizio(), { ...base, scheda: 'dieta' as const }, inPiano(), inPasto(),
        { ...base, scheda: 'corsa' as const }, { ...base, scheda: 'info' as const }].map(chiaveBuilder);
      expect(new Set(chiavi).size).toBe(chiavi.length);
    });

    it('non cambia mentre si scrive il nome', () => {
      expect(chiaveBuilder(inGiorno('P'))).toBe(chiaveBuilder(inGiorno('Petto')));
      expect(chiaveBuilder(inEsercizio('', true))).toBe(chiaveBuilder(inEsercizio('Panca', true)));
      expect(chiaveBuilder(inPiano('N'))).toBe(chiaveBuilder(inPiano('Nuova dieta')));
    });

    it('cambia fra due piani diversi', () => {
      const altro: PosizioneBuilder = { ...base, scheda: 'dieta', piano: { id: 'p2', name: 'x' } };
      expect(chiaveBuilder(altro)).not.toBe(chiaveBuilder(inPiano()));
    });
  });

  describe('direzioneBuilder', () => {
    it('scendere entra da destra, salire da sinistra', () => {
      expect(direzioneBuilder(chiaveBuilder(base), chiaveBuilder(inGiorno()))).toBe('avanti');
      expect(direzioneBuilder(chiaveBuilder(inGiorno()), chiaveBuilder(inEsercizio()))).toBe('avanti');
      expect(direzioneBuilder(chiaveBuilder(inEsercizio()), chiaveBuilder(inGiorno()))).toBe('indietro');
      expect(direzioneBuilder(chiaveBuilder(inGiorno()), chiaveBuilder(base))).toBe('indietro');
    });

    it('cambiando scheda dipende da dove sta la nuova', () => {
      expect(direzioneBuilder('scheda', 'dieta')).toBe('avanti');
      expect(direzioneBuilder('dieta', 'info')).toBe('avanti');
      expect(direzioneBuilder('info', 'scheda')).toBe('indietro');
      expect(direzioneBuilder('corsa', 'dieta')).toBe('indietro');
    });

    it('la prima schermata entra come se si scendesse', () => {
      expect(direzioneBuilder(null, 'scheda')).toBe('avanti');
    });
  });
});
