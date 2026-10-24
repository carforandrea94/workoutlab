import { ProgramLoad } from '../../models/workout.model';
import { RmRow } from './load-estimate.util';
import { conSconto } from './fatica.util';

/**
 * Che peso mettere su una serie, e da dove viene il numero nella ruota.
 *
 * Prima la card dell'esercizio ne mostrava quattro insieme: quello nella
 * ruota (il peso dell'ultima volta, scritto "suggerito"), quello del menu dei
 * massimali, quello della percentuale del programma e, sotto, il massimale da
 * cui venivano. Nessuno diceva quale fosse nella ruota. Qui diventano una
 * scelta: le fonti possibili, ognuna col suo numero, e quella scelta va nella
 * ruota. Nella card resta una riga sola che dice da dove viene il numero.
 */

export type FonteCarico = 'ultima' | 'rm' | 'programma';

/** L'ultima seduta in cui l'esercizio c'era: la data, e serie per serie quello che si e' fatto. */
export interface UltimaVolta {
  /** "03/10". */
  data: string;
  /** Su un cluster `load` e' null (il peso e' dei blocchi) e i blocchi sono in `blocchi`. */
  serie: { load: string | null; reps: string | null; blocchi?: { load: string | null; reps: string | null }[] }[];
}

export interface OpzioneCarico {
  chiave: FonteCarico;
  titolo: string;
  dettaglio: string;
  /** Quando quel peso e il piano del giorno non vanno d'accordo, o la stima e' larga. */
  avviso: string | null;
  kg: number;
  /** La riga nella card quando nella ruota c'e' questo peso: "come il 03/10". */
  breve: string;
}

export interface DatiCarico {
  /** La serie, da 0. */
  serie: number;
  /** Su un cluster, il blocco (da 1): le fonti parlano di lui. */
  blocco?: number;
  ultima: UltimaVolta | null;
  /** Le ripetizioni nella ruota adesso (o quelle previste). */
  ripetizioni: number | null;
  rmRows: RmRow[] | null;
  programma: ProgramLoad | null;
  /** Le ripetizioni che il piano chiede oggi. */
  previste: number | null;
  /** Oltre queste ripetizioni la stima dal massimale si allarga. */
  soglia: number;
  /**
   * Su un cluster, dal secondo blocco in poi: le ripetizioni del PRIMO. In un
   * cluster il peso e' della serie e lo decide il primo blocco; i blocchi dopo
   * vengono a venti o trenta secondi di pausa, e il peso "per le loro
   * ripetizioni" sarebbe quello di una serie fresca: su un 8+6 il blocco da 6
   * chiedeva piu' peso di quello da 8.
   */
  primoBlocco?: number | null;
  /**
   * Di quanto (in percento) scendono i pesi stimati per l'ordine degli
   * esercizi (vedi fatica.util), e perche'. Assente o 0: nessuna correzione.
   */
  fatica?: { percento: number; motivo: string } | null;
}

/** Un numero scritto come si scrive qui ("32,5") o null se non e' un peso. */
function peso(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? n : null;
}

/** Ripetizioni intere e pulite; un "8+8" di un cluster non e' un numero di ripetizioni. */
function ripetizioni(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 ? n : null;
}

/**
 * Le fonti di un peso per questa serie, nell'ordine in cui le si guarda: quello
 * che si e' fatto l'ultima volta (un fatto), quello per le ripetizioni nella
 * ruota (una stima), quello del programma (una regola). Manca quella che non
 * ha un numero.
 */
export function opzioniCarico(d: DatiCarico): OpzioneCarico[] {
  const out: OpzioneCarico[] = [];
  const sconto = d.fatica?.percento ?? 0;
  const conFatica = (testo: string) => (sconto ? `${testo}, −${sconto}% per l'ordine` : testo);

  const fatta = d.ultima?.serie[d.serie];
  const kgUltima = peso(fatta?.load);
  if (d.ultima && kgUltima !== null) {
    const rip = ripetizioni(fatta?.reps);
    out.push({
      chiave: 'ultima',
      titolo: 'Come l\'ultima volta',
      dettaglio: `Serie ${d.serie + 1}` + (d.blocco ? `, blocco ${d.blocco},` : '') + ` del ${d.ultima.data}`
        + (rip ? `, ${rip} ${rip === 1 ? 'ripetizione' : 'ripetizioni'}` : ''),
      // E' un fatto, e resta com'era; ma se oggi si arriva piu' stanchi lo si dice.
      avviso: sconto ? `${d.fatica!.motivo}: con questo peso potrebbero uscirne meno.` : null,
      kg: kgUltima,
      breve: `come il ${d.ultima.data}`
    });
  }

  // Dal secondo blocco di un cluster il peso e' quello del primo.
  const comePrimo = d.primoBlocco != null && (d.blocco ?? 1) > 1;
  const n = comePrimo ? d.primoBlocco! : d.ripetizioni;
  const riga = n !== null ? d.rmRows?.find(r => r.reps === n) : undefined;
  if (n !== null && riga) {
    out.push({
      chiave: 'rm',
      titolo: comePrimo ? 'Come il primo blocco' : `Per ${n} ${n === 1 ? 'ripetizione' : 'ripetizioni'}`,
      dettaglio: conFatica(comePrimo
        ? `${riga.percent}% del massimale, per ${n} ${n === 1 ? 'ripetizione' : 'ripetizioni'}: in un cluster il peso è della serie`
        : `${riga.percent}% del massimale stimato`),
      avviso: n > d.soglia
        ? `Sopra le ${d.soglia} ripetizioni la stima si allarga: prendila come indicazione.`
        : null,
      kg: conSconto(riga.load, sconto),
      breve: conFatica(comePrimo ? 'come il primo blocco' : `${riga.percent}% del massimale`)
    });
  }

  const p = d.programma;
  if (p && p.load > 0) {
    // E' il prezzo di una percentuale sola per tutto il programma: l'80% e' un
    // peso da otto ripetizioni, e su un giorno da dieci le dieci non escono.
    // Sotto le due di scarto si tace: e' dentro l'errore della stima.
    const scarto = d.previste !== null && Math.abs(d.previste - p.reps) >= 2;
    out.push({
      chiave: 'programma',
      titolo: `Dal programma, ${p.percent}%`,
      dettaglio: conFatica(`Circa ${p.reps} ${p.reps === 1 ? 'ripetizione' : 'ripetizioni'}`),
      avviso: scarto ? `Oggi il piano ne chiede ${d.previste}: a questo peso ne escono circa ${p.reps}.` : null,
      kg: conSconto(p.load, sconto),
      breve: conFatica(`programma ${p.percent}%`)
    });
  }

  return out;
}

const uguali = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** L'opzione che corrisponde al peso nella ruota, o null se il peso l'hai scelto tu. La prima, se due coincidono. */
export function opzioneScelta(opzioni: readonly OpzioneCarico[], kg: number | null): OpzioneCarico | null {
  if (kg === null) return null;
  return opzioni.find(o => uguali(o.kg, kg)) ?? null;
}

/**
 * Da dove viene il numero nella ruota, detto in tre parole. Con la ruota
 * ancora sul suggerimento e' la fonte del suggerimento; quando l'hai girata e
 * il peso non e' di nessuna fonte, e' tuo. null quando non c'e' niente da dire.
 */
export function fonteDelCarico(opzioni: readonly OpzioneCarico[], scritto: string, suggerito: string): string | null {
  const kgScritto = peso(scritto);
  if (kgScritto !== null) return opzioneScelta(opzioni, kgScritto)?.breve ?? 'scelto da te';
  const kgSuggerito = peso(suggerito);
  if (kgSuggerito === null) return null;
  return opzioneScelta(opzioni, kgSuggerito)?.breve ?? null;
}

// ---- Il tasto in basso ----

/**
 * Cosa fa il tasto sotto il pollice, per la card che si sta guardando.
 *
 * - la serie aperta e' da fare: la si segna (o si chiude il blocco, se e' a cluster);
 * - la serie aperta e' gia' fatta (riaperta per correggerla): si torna a quella da fare;
 * - non ce n'e' piu' nessuna da fare: si va avanti.
 */
export type AzioneInBasso =
  | { tipo: 'fatta'; serie: number; totale: number }
  | { tipo: 'blocco'; etichetta: string; chiudibile: boolean }
  | { tipo: 'torna'; serie: number }
  | { tipo: 'avanti'; chiusura: boolean };

export interface DatiAzione {
  righe: readonly { done: boolean }[];
  attiva: number | null;
  /** Sulla serie aperta, se e' a cluster: cosa dice il tasto e se la serie si puo' chiudere prima. */
  cluster: { etichetta: string; chiudibile: boolean } | null;
  /** L'esercizio e' l'ultimo: dopo c'e' la chiusura dell'allenamento. */
  ultimo: boolean;
}

export function azioneInBasso(d: DatiAzione): AzioneInBasso {
  const aperta = d.attiva !== null ? d.righe[d.attiva] : undefined;
  if (aperta && !aperta.done) {
    return d.cluster
      ? { tipo: 'blocco', etichetta: d.cluster.etichetta, chiudibile: d.cluster.chiudibile }
      : { tipo: 'fatta', serie: d.attiva! + 1, totale: d.righe.length };
  }
  const daFare = d.righe.findIndex(r => !r.done);
  if (daFare >= 0) return { tipo: 'torna', serie: daFare + 1 };
  return { tipo: 'avanti', chiusura: d.ultimo };
}
