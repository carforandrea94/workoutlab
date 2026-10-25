import { mondayISO } from './date.util';
import { addDaysISO } from './week-history.util';
import { Obiettivo, dataBreve, distanzaDalTraguardo } from './obiettivo.util';

/**
 * La settimana scorsa, letta tutta insieme: allenamenti, corsa, pasti, peso.
 *
 * L'app raccoglie questi numeri in quattro posti diversi e non li metteva mai
 * uno accanto all'altro. Il lunedi' (e finche' non la si chiude) una card in
 * Account li mostra insieme, con una frase sola che li legge rispetto
 * all'obiettivo. Si guarda la settimana chiusa, non quella in corso: e' quella
 * che si puo' giudicare.
 *
 * Il peso non e' quello di un giorno: e' la media delle pesate della
 * settimana, che un giorno piu' pesante non sposta.
 */

export interface PesoDatato {
  /** yyyy-mm-dd */
  date: string;
  value: number;
}

/** I pasti segnati come fatti in un giorno, su quanti ne aveva il piano. */
export interface PastiGiorno {
  fatti: number;
  totali: number;
}

export interface Bilancio {
  /** Il lunedi' della settimana di cui si parla. */
  lunedi: string;
  /** null: il programma non ha giorni. */
  allenamenti: { fatti: number; previsti: number } | null;
  /** obiettivo null: nessun obiettivo di minuti. */
  corsa: { minuti: number; obiettivo: number | null };
  /** null: nessun pasto segnato in quella settimana. */
  pasti: PastiGiorno | null;
  /** null: nessuna pesata in quella settimana. prima: la media della settimana prima, se c'e'. */
  peso: { media: number; prima: number | null } | null;
  /** Una frase sola su come si sta andando; null se non c'e' niente di utile da dire. */
  frase: string | null;
}

/** I giorni della media del peso. */
export const GIORNI_MEDIA = 7;
/** Quanti giorni di pasti si tengono: la settimana scorsa e un po' di margine. */
export const GIORNI_PASTI = 35;
/**
 * Oltre questo numero di settimane la previsione non si fa: un decimo di
 * chilo a settimana e' rumore della bilancia, e "in circa 81 settimane" non
 * aiuta nessuno. Si dice com'e' andata e quanto manca.
 */
export const SETTIMANE_PREVISIONE = 52;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const arrotonda = (n: number) => Math.round(n * 10) / 10;

/** Il giorno come numero intero, senza fusi orari. */
function giorno(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, g) / 86_400_000);
}

/**
 * Per ogni pesata, la media delle pesate dei sette giorni che finiscono quel
 * giorno (lui compreso). Dalla piu' vecchia, come le pesate.
 */
export function mediaMobile(pesate: readonly PesoDatato[], giorni = GIORNI_MEDIA): PesoDatato[] {
  return pesate.map(p => {
    const g = giorno(p.date);
    const finestra = pesate.filter(x => { const d = g - giorno(x.date); return d >= 0 && d < giorni; });
    return { date: p.date, value: finestra.reduce((s, x) => s + x.value, 0) / finestra.length };
  });
}

/** La media delle pesate della settimana che comincia il lunedi' dato; null senza pesate. */
export function mediaSettimana(pesate: readonly PesoDatato[], lunedi: string): number | null {
  const sue = pesate.filter(p => DATA.test(p.date) && mondayISO(p.date) === lunedi);
  return sue.length ? sue.reduce((s, p) => s + p.value, 0) / sue.length : null;
}

/**
 * Il registro dei pasti con il giorno di oggi aggiornato, senza i giorni
 * troppo vecchi per servire ancora: il documento non cresce per sempre.
 */
export function registraPasti(
  storia: Record<string, PastiGiorno> | null | undefined, oggi: string, fatti: number, totali: number
): Record<string, PastiGiorno> {
  const limite = addDaysISO(oggi, -(GIORNI_PASTI - 1));
  const out: Record<string, PastiGiorno> = {};
  for (const [data, p] of Object.entries(storia ?? {})) {
    if (DATA.test(data) && data >= limite && data !== oggi) out[data] = p;
  }
  out[oggi] = { fatti: Math.max(0, fatti), totali: Math.max(0, totali) };
  return out;
}

export interface DatiBilancio {
  oggi: string;
  sedute: readonly { dayId: string; date: string }[];
  /** I giorni del programma. */
  previsti: number;
  corse: readonly { date: string; durationMin: number }[];
  obiettivoCorsa: number | null;
  pastiGiorni: Record<string, PastiGiorno> | null | undefined;
  /** Dalla piu' vecchia. */
  pesate: readonly PesoDatato[];
  obiettivo: Obiettivo | null;
}

/**
 * Il bilancio della settimana scorsa. null se quella settimana non c'e' niente
 * di registrato: una card di zeri a chi si e' fermato non lo aiuta a ripartire.
 */
export function bilancio(d: DatiBilancio): Bilancio | null {
  if (!DATA.test(d.oggi)) return null;
  const lunedi = addDaysISO(mondayISO(d.oggi), -7);
  const domenica = addDaysISO(lunedi, 6);
  const dentro = (data: string) => DATA.test(data ?? '') && data >= lunedi && data <= domenica;

  const giorniFatti = new Set(d.sedute.filter(s => s?.dayId && dentro(s.date)).map(s => s.dayId));
  const corse = d.corse.filter(r => dentro(r?.date));
  const minuti = corse.reduce((s, r) => s + (r.durationMin > 0 ? r.durationMin : 0), 0);
  let pastiFatti = 0, pastiTotali = 0;
  for (const [data, p] of Object.entries(d.pastiGiorni ?? {})) {
    if (!dentro(data) || !(p?.totali > 0)) continue;
    pastiFatti += Math.min(p.fatti, p.totali);
    pastiTotali += p.totali;
  }
  const pasti: PastiGiorno | null = pastiTotali > 0 ? { fatti: pastiFatti, totali: pastiTotali } : null;
  const media = mediaSettimana(d.pesate, lunedi);
  const prima = mediaSettimana(d.pesate, addDaysISO(lunedi, -7));

  if (!giorniFatti.size && !corse.length && !pasti && media === null) return null;

  const b: Bilancio = {
    lunedi,
    allenamenti: d.previsti > 0 ? { fatti: Math.min(giorniFatti.size, d.previsti), previsti: d.previsti } : null,
    corsa: { minuti, obiettivo: d.obiettivoCorsa && d.obiettivoCorsa > 0 ? d.obiettivoCorsa : null },
    pasti,
    peso: media === null ? null : { media: arrotonda(media), prima: prima === null ? null : arrotonda(prima) },
    frase: null
  };
  b.frase = frase(b, d.obiettivo, d.oggi);
  return b;
}

/**
 * La frase: prima il peso rispetto al traguardo, che e' la domanda di chi ne
 * ha uno; poi la scheda completa; poi la corsa. Guarda avanti e non rimprovera:
 * un peso che va nella direzione sbagliata si dice com'e', con la distanza
 * che resta.
 */
function frase(b: Bilancio, o: Obiettivo | null, oggi: string): string | null {
  if (o?.peso != null && b.peso) {
    const { media, prima } = b.peso;
    const distanza = distanzaDalTraguardo(o, media)!;
    if (distanza.raggiunto) return `Il peso medio è al traguardo di ${kg(o.peso)} kg: obiettivo raggiunto.`;
    if (prima !== null) {
      const passo = arrotonda(media - prima);
      const giusto = o.tipo === 'grasso' ? passo < 0 : passo > 0;
      // In decimi interi: 2,1 / 0,3 in virgola mobile fa 7,000000000000001, e per eccesso 8.
      const settimane = giusto ? Math.ceil(Math.round(distanza.mancano * 10) / Math.round(Math.abs(passo) * 10)) : Infinity;
      if (settimane <= SETTIMANE_PREVISIONE) {
        const quando = settimane === 1 ? 'in circa una settimana' : `in circa ${settimane} settimane`;
        let testo = `Il peso medio ${passo < 0 ? 'scende' : 'sale'} di ${kg(Math.abs(passo))} kg a settimana: `
          + `a questo passo arrivi a ${kg(o.peso)} kg ${quando}`;
        if (o.entro) {
          const arrivo = addDaysISO(oggi, settimane * 7);
          testo += arrivo <= o.entro ? `, prima del ${dataBreve(o.entro, oggi)}` : `, dopo il ${dataBreve(o.entro, oggi)} che ti eri dato`;
        }
        return testo + '.';
      }
      const com = passo === 0 ? `è fermo a ${kg(media)} kg` : `è ${passo > 0 ? 'salito' : 'sceso'} di ${kg(Math.abs(passo))} kg`;
      return `Il peso medio ${com}: il traguardo di ${kg(o.peso)} kg è a ${kg(distanza.mancano)} kg.`;
    }
  }
  if (b.allenamenti && b.allenamenti.fatti >= b.allenamenti.previsti) return 'Scheda completa: tutti gli allenamenti della settimana fatti.';
  if (b.corsa.obiettivo && b.corsa.minuti >= b.corsa.obiettivo) return `Obiettivo di corsa raggiunto: ${b.corsa.minuti} minuti su ${b.corsa.obiettivo}.`;
  return null;
}
