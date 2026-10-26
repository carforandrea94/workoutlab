import { DietPlan, FOOD_CATEGORIES, FoodCategory, NamedMeal } from '../../models/diet.model';
import { SceltaPasto, alimentoScelto, comboDi, opzioniMacro } from './scelta-pasto.util';
import { mondayISO, quandoBreve, dataEstesa } from './date.util';
import { weekRangeLabel } from './week-history.util';

/**
 * Lo storico della dieta: giorno per giorno, cosa si e' mangiato.
 *
 * Il giorno si salva come FOTOGRAFIA, con i nomi gia' risolti (il pasto, la
 * combinazione, gli alimenti con le quantita'), e non come riferimenti al
 * piano: il piano cambia - il coach toglie un'alternativa, si importa una
 * dieta nuova - e lo storico deve continuare a dire quello che si e' mangiato
 * quel giorno, non quello che il piano direbbe oggi.
 *
 * Un documento per giorno (users/{uid}/giorniDieta/{data}), con dentro un
 * piano per chiave: nello stesso giorno si possono segnare pasti di due piani
 * (Giorno ON e Giorno OFF), e ognuno scrive solo il suo.
 */

export interface AlimentoMangiato {
  macro: FoodCategory;
  nome: string;
  qty: string;
  /** Il piano diceva un altro alimento: quale. Assente se e' quello del piano. */
  alPostoDi?: string;
}

export interface PastoDelGiorno {
  id: string;
  nome: string;
  fatto: boolean;
  /** Il nome della combinazione, solo se il pasto ne ha piu' d'una. */
  combinazione?: string;
  alimenti: AlimentoMangiato[];
  /** "Whey 30 g": gli integratori del pasto. */
  integratori: string[];
}

export interface PianoDelGiorno {
  nome: string;
  pasti: PastoDelGiorno[];
}

export interface GiornoDieta {
  date: string;
  /** Per id del piano. */
  piani: Record<string, PianoDelGiorno>;
}

/** Un pasto com'e' nella pagina della dieta: il pasto del piano, se e' fatto, cosa si e' scelto. */
export interface PastoSegnato {
  meal: NamedMeal;
  completed: boolean;
  scelta?: SceltaPasto;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** "Riso 80 g", o solo il nome se la quantita' non c'e'. */
function conQuantita(nome: string, qty: string): string {
  return qty ? `${nome} ${qty}` : nome;
}

/** Cosa si mangia in un pasto, con la scelta del giorno: combinazione, alimenti cambiati, integratori. */
export function fotografiaPasto(p: PastoSegnato): PastoDelGiorno {
  const combo = comboDi(p.meal, p.scelta);
  const alimenti: AlimentoMangiato[] = [];
  for (const macro of FOOD_CATEGORIES) {
    const o = opzioniMacro(p.meal, combo, macro);
    const a = alimentoScelto(o, p.scelta?.macro?.[macro]);
    if (!a || !testo(a.name)) continue;
    const alimento: AlimentoMangiato = { macro, nome: testo(a.name), qty: testo(a.qty) };
    if (a.cambiato && o.base && testo(o.base.name)) alimento.alPostoDi = testo(o.base.name);
    alimenti.push(alimento);
  }
  const pasto: PastoDelGiorno = {
    id: p.meal.id,
    nome: testo(p.meal.name) || 'Pasto',
    fatto: p.completed,
    alimenti,
    integratori: (p.meal.supplements ?? [])
      .filter(s => testo(s.name))
      .map(s => conQuantita(testo(s.name), testo(s.qty)))
  };
  if ((p.meal.combinations?.length ?? 0) > 1 && combo && testo(combo.label)) pasto.combinazione = testo(combo.label);
  return pasto;
}

/** Il piano di oggi, com'e' adesso: tutti i suoi pasti, fatti e no. */
export function fotografiaPiano(piano: DietPlan, pasti: readonly PastoSegnato[]): PianoDelGiorno {
  return { nome: testo(piano.name) || 'Piano', pasti: pasti.map(fotografiaPasto) };
}

/**
 * Un giorno letto da Firestore. Quello che non si capisce si scarta qui, una
 * volta sola: un documento rotto non deve rompere la pagina.
 */
export function normalizzaGiorno(id: string, data: unknown): GiornoDieta | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const date = DATA.test(testo(d['date'])) ? testo(d['date']) : DATA.test(id) ? id : '';
  if (!date) return null;
  const piani: Record<string, PianoDelGiorno> = {};
  const grezzi = d['piani'];
  if (grezzi && typeof grezzi === 'object') {
    for (const [pianoId, grezzo] of Object.entries(grezzi as Record<string, unknown>)) {
      const g = (grezzo ?? {}) as Record<string, unknown>;
      if (!Array.isArray(g['pasti'])) continue;
      const pasti: PastoDelGiorno[] = [];
      for (const pg of g['pasti'] as unknown[]) {
        const x = (pg ?? {}) as Record<string, unknown>;
        const nome = testo(x['nome']);
        if (!nome) continue;
        const alimenti: AlimentoMangiato[] = [];
        for (const ag of Array.isArray(x['alimenti']) ? x['alimenti'] as unknown[] : []) {
          const a = (ag ?? {}) as Record<string, unknown>;
          const macro = a['macro'] as FoodCategory;
          if (!FOOD_CATEGORIES.includes(macro) || !testo(a['nome'])) continue;
          const alimento: AlimentoMangiato = { macro, nome: testo(a['nome']), qty: testo(a['qty']) };
          if (testo(a['alPostoDi'])) alimento.alPostoDi = testo(a['alPostoDi']);
          alimenti.push(alimento);
        }
        const pasto: PastoDelGiorno = {
          id: testo(x['id']) || nome,
          nome,
          fatto: x['fatto'] === true,
          alimenti,
          integratori: (Array.isArray(x['integratori']) ? x['integratori'] as unknown[] : []).map(testo).filter(Boolean)
        };
        if (testo(x['combinazione'])) pasto.combinazione = testo(x['combinazione']);
        pasti.push(pasto);
      }
      piani[pianoId] = { nome: testo(g['nome']) || 'Piano', pasti };
    }
  }
  return { date, piani };
}

/** Un giorno come lo mostra lo storico: i soli piani con almeno un pasto fatto. */
export interface RigaGiorno {
  date: string;
  /** "Oggi", "Ieri", "Lunedì 19 ottobre". */
  titolo: string;
  /** I nomi dei piani: "Giorno ON", o "Giorno ON · Giorno OFF". */
  piani: string;
  fatti: number;
  totali: number;
  /** I piani del giorno, ognuno coi soli pasti fatti. */
  dettaglio: { nome: string; pasti: PastoDelGiorno[] }[];
}

export interface SettimanaDieta {
  lunedi: string;
  /** "19 – 25 ott". */
  label: string;
  corrente: boolean;
  giorni: RigaGiorno[];
}

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Oggi", "Ieri", poi la data per esteso: "Lunedì 19 ottobre". */
export function titoloGiorno(date: string, oggi: string): string {
  const breve = quandoBreve(date, oggi);
  if (breve === 'oggi' || breve === 'ieri') return maiuscola(breve);
  return maiuscola(dataEstesa(date));
}

/** Il giorno da mostrare, o null se quel giorno non c'e' nessun pasto fatto. */
export function rigaGiorno(g: GiornoDieta, oggi: string): RigaGiorno | null {
  const dettaglio = Object.values(g.piani)
    .map(p => ({ nome: p.nome, tutti: p.pasti, pasti: p.pasti.filter(x => x.fatto) }))
    .filter(p => p.pasti.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  if (!dettaglio.length) return null;
  return {
    date: g.date,
    titolo: titoloGiorno(g.date, oggi),
    piani: dettaglio.map(p => p.nome).join(' · '),
    fatti: dettaglio.reduce((n, p) => n + p.pasti.length, 0),
    totali: dettaglio.reduce((n, p) => n + p.tutti.length, 0),
    dettaglio: dettaglio.map(p => ({ nome: p.nome, pasti: p.pasti }))
  };
}

/**
 * I giorni per settimana, dalla piu' recente. Solo le settimane con almeno un
 * giorno: lo storico dice cosa si e' mangiato, non conta i giorni senza
 * niente segnato. `max` taglia le settimane piu' vecchie (0 = tutte).
 */
export function settimaneDieta(giorni: readonly GiornoDieta[], oggi: string, max: number): { settimane: SettimanaDieta[]; nascoste: number } {
  const corrente = mondayISO(oggi);
  const perSettimana = new Map<string, RigaGiorno[]>();
  for (const g of giorni) {
    const riga = rigaGiorno(g, oggi);
    if (!riga) continue;
    const lunedi = mondayISO(riga.date);
    const elenco = perSettimana.get(lunedi);
    if (elenco) elenco.push(riga); else perSettimana.set(lunedi, [riga]);
  }
  const tutte = [...perSettimana.keys()].sort().reverse().map(lunedi => ({
    lunedi,
    label: weekRangeLabel(lunedi),
    corrente: lunedi === corrente,
    giorni: perSettimana.get(lunedi)!.sort((a, b) => b.date.localeCompare(a.date))
  }));
  const settimane = max > 0 ? tutte.slice(0, max) : tutte;
  return { settimane, nascoste: tutte.length - settimane.length };
}

/** "Riso 70 g": un alimento come si legge nello storico. */
export function testoAlimento(a: AlimentoMangiato): string {
  return conQuantita(a.nome, a.qty);
}
