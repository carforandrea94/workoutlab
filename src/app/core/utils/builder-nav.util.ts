/**
 * La navigazione DENTRO l'editor del protocollo.
 *
 * L'editor e' una pagina sola, ma ha livelli: sull'elenco (livello 0) si sceglie
 * una scheda - Scheda, Dieta, Corsa, Info - e da Scheda e Dieta si scende: un
 * giorno e poi un esercizio, un piano e poi un pasto. Qui, senza toccare il
 * resto, si ricava da dove si e' il livello, il titolo della testata, l'etichetta
 * della freccia e da che parte e' arrivata la schermata nuova.
 */
export type SchedaBuilder = 'scheda' | 'dieta' | 'corsa' | 'info';

/** Nell'ordine in cui compaiono nel selettore. */
export const ORDINE_SCHEDE: readonly SchedaBuilder[] = ['scheda', 'dieta', 'corsa', 'info'];

export interface PosizioneBuilder {
  scheda: SchedaBuilder;
  giorno: { label: string } | null;
  esercizio: { name: string; isNew: boolean } | null;
  piano: { id: string; name: string } | null;
  pasto: { id: string; name: string } | null;
}

export type LivelloBuilder = 0 | 1 | 2;

/** Quanto in profondita' si e': 0 l'elenco della scheda, 1 un giorno o un piano, 2 un esercizio o un pasto. */
export function livelloBuilder(p: PosizioneBuilder): LivelloBuilder {
  if (p.scheda === 'scheda') return p.esercizio ? 2 : p.giorno ? 1 : 0;
  if (p.scheda === 'dieta') return p.piano && p.pasto ? 2 : p.piano ? 1 : 0;
  return 0;
}

/** Una chiave per ogni schermata distinta: cambia quando cambia cio' che si vede, non mentre si scrive il nome. */
export function chiaveBuilder(p: PosizioneBuilder): string {
  const l = livelloBuilder(p);
  if (p.scheda === 'scheda') return l === 0 ? 'scheda' : l === 1 ? 'scheda/giorno' : 'scheda/giorno/esercizio';
  if (p.scheda === 'dieta') {
    return l === 0 ? 'dieta' : l === 1 ? `dieta/piano:${p.piano!.id}` : `dieta/piano:${p.piano!.id}/pasto:${p.pasto!.id}`;
  }
  return p.scheda;
}

/** Il titolo della testata: dice dove si e', come il nome della pagina nelle altre schermate. */
export function titoloBuilder(p: PosizioneBuilder): string {
  const l = livelloBuilder(p);
  if (l === 0) return 'Protocollo';
  if (p.scheda === 'scheda') {
    return l === 1
      ? p.giorno!.label.trim() || 'Giorno senza nome'
      : p.esercizio!.name.trim() || (p.esercizio!.isNew ? 'Nuovo esercizio' : 'Esercizio senza nome');
  }
  return l === 1 ? p.piano!.name.trim() || 'Piano senza nome' : p.pasto!.name.trim() || 'Pasto senza nome';
}

/** Dove porta la freccia, detto a chi non la vede. */
export function etichettaSuBuilder(p: PosizioneBuilder): string {
  const l = livelloBuilder(p);
  if (l === 0) return 'Indietro';
  if (p.scheda === 'scheda') return l === 1 ? 'Torna ai giorni' : 'Torna al giorno';
  return l === 1 ? 'Torna ai piani' : 'Torna al piano';
}

/** Cosa fa il tasto "Fatto" della testata, detto a chi non lo vede. */
export function etichettaFattoBuilder(p: PosizioneBuilder): string {
  const l = livelloBuilder(p);
  if (p.scheda === 'scheda') return l === 1 ? 'Salva il giorno' : 'Salva l\'esercizio';
  return l === 1 ? 'Fatto con il piano' : 'Fatto con il pasto';
}

function profondita(chiave: string): number {
  return chiave.split('/').length - 1;
}

/**
 * Da che parte entra la schermata nuova: dopo, se si scende o si va a una
 * scheda piu' a destra; prima se si sale o si va a una piu' a sinistra.
 */
export function direzioneBuilder(da: string | null, a: string): 'avanti' | 'indietro' {
  if (!da) return 'avanti';
  const schedaDa = ORDINE_SCHEDE.indexOf(da.split('/')[0] as SchedaBuilder);
  const schedaA = ORDINE_SCHEDE.indexOf(a.split('/')[0] as SchedaBuilder);
  if (schedaDa !== schedaA) return schedaA > schedaDa ? 'avanti' : 'indietro';
  return profondita(a) >= profondita(da) ? 'avanti' : 'indietro';
}
