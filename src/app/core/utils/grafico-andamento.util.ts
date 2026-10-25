/**
 * Il disegno del grafico di Andamento, calcolato qui e non scritto a stringa:
 * il componente mette solo le coordinate nel suo SVG.
 *
 * Prima l'SVG era largo 340 e veniva stirato alla larghezza della card
 * (preserveAspectRatio="none"): numeri e pallini si deformavano appena la card
 * non era larga 340. Ora il disegno si fa alla larghezza vera, in pixel.
 */

export interface PuntoMisura {
  /** yyyy-mm-dd */
  date: string;
  value: number;
}

export interface PuntoDisegnato extends PuntoMisura {
  x: number;
  y: number;
}

export interface TaccaValore { y: number; testo: string; }
export interface TaccaData { x: number; testo: string; ancora: 'start' | 'middle' | 'end'; }

export interface DisegnoAndamento {
  larghezza: number;
  altezza: number;
  /** Il riquadro dei dati: a destra resta lo spazio per i numeri dell'asse. */
  piano: { x0: number; x1: number; y0: number; y1: number };
  linea: string;
  area: string;
  punti: PuntoDisegnato[];
  valori: TaccaValore[];
  date: TaccaData[];
  /**
   * Pochi punti: si disegnano tutti. Tanti: solo l'ultimo, gli altri farebbero
   * un rosario. Con le pesate sotto la linea, mai: i punti sono loro.
   */
  conPallini: boolean;
  /** I valori del giorno sotto una linea che e' una media (vedi settimana.util): i punti grigi. */
  pesate: PuntoDisegnato[];
  /**
   * La linea del traguardo, se c'e': la quota e dove sta la sua scritta, sopra
   * la linea o, se sopra non c'e' posto, sotto.
   */
  traguardo: { y: number; scrittaY: number } | null;
}

export const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Margini del riquadro: sopra e a sinistra quanto basta al pallino col suo anello. */
const MARGINE = { sopra: 10, sinistra: 8, destra: 44, sotto: 26 };
/** Oltre questa distanza media fra due punti i pallini si vedono ancora uno per uno. */
const PASSO_PALLINI = 14;

const f = (n: number) => n.toFixed(1);

/** Con la virgola e al massimo un decimale, come ogni altro numero dell'app. */
export function numeroIt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString().replace('.', ',');
}

/** La variazione col segno: "+2,2", "-0,4", "0". */
export function variazioneIt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (r > 0 ? '+' : '') + numeroIt(r);
}

/** Arrotondata al decimale, la variazione e' nulla: si scrive "uguale", non "0 kg". */
export function uguale(n: number): boolean {
  return Math.round(n * 10) === 0;
}

/** Il giorno come numero intero, senza fusi orari: fra due date c'e' sempre un numero intero di giorni. */
export function giornoDi(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, g) / 86_400_000);
}

/** Il contrario di giornoDi. */
function isoDi(giorno: number): string {
  return new Date(giorno * 86_400_000).toISOString().slice(0, 10);
}

/** "14 lug", o "14 lug 2025" con l'anno. */
export function dataBreve(iso: string, conAnno = false): string {
  const [a, m, g] = iso.split('-').map(Number);
  return `${g} ${MESI[m - 1]}` + (conAnno ? ` ${a}` : '');
}

/** "14 luglio 2025", per lo screen reader. */
export function dataLunga(iso: string): string {
  const [a, m, g] = iso.split('-').map(Number);
  return `${g} ${MESI_LUNGHI[m - 1]} ${a}`;
}

/**
 * Le tacche dell'asse dei valori, su numeri tondi (passo 1, 2, 2,5 o 5 per
 * una potenza di dieci) che contengono tutti i dati. Prima l'asse diceva
 * 107,6 / 110,3 / 113,1: minimo, meta' e massimo, numeri che non si leggono a
 * colpo d'occhio.
 */
export function taccheValori(min: number, max: number, intervalli = 3): number[] {
  if (min === max) { min -= 1; max += 1; }
  const grezzo = (max - min) / intervalli;
  const potenza = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const norma = grezzo / potenza;
  // 2,5 solo dalle unita' in su: 0,25 vorrebbe due decimali, e le misure ne hanno uno.
  const passo = (norma <= 1 ? 1 : norma <= 2 ? 2 : norma <= 2.5 && potenza >= 1 ? 2.5 : norma <= 5 ? 5 : 10) * potenza;
  const basso = Math.floor(min / passo + 1e-9);
  const alto = Math.ceil(max / passo - 1e-9);
  const tacche: number[] = [];
  for (let k = basso; k <= alto; k++) tacche.push(Number((k * passo).toFixed(6)));
  return tacche;
}

/**
 * Le date sotto il grafico. Su un periodo lungo l'inizio di ogni mese (o di
 * uno ogni due, tre, sei: al massimo sei scritte), e a gennaio l'anno; su un
 * periodo breve il primo e l'ultimo giorno.
 */
export function taccheDate(primo: string, ultimo: string): { date: string; testo: string }[] {
  const g0 = giornoDi(primo);
  const g1 = giornoDi(ultimo);
  if (g1 - g0 < 45) {
    const conAnno = primo.slice(0, 4) !== ultimo.slice(0, 4);
    return g1 === g0
      ? [{ date: primo, testo: dataBreve(primo, conAnno) }]
      : [{ date: primo, testo: dataBreve(primo, conAnno) }, { date: ultimo, testo: dataBreve(ultimo, conAnno) }];
  }
  const [a0, m0] = primo.split('-').map(Number);
  const [a1, m1] = ultimo.split('-').map(Number);
  const mesi = (a1 - a0) * 12 + (m1 - m0);
  const passo = [1, 2, 3, 6, 12, 24, 60, 120].find(p => mesi / p <= 6) ?? 120;
  const tacche: { date: string; testo: string }[] = [];
  // Il primo del mese dopo l'inizio, poi uno ogni `passo` mesi contati da gennaio.
  for (let k = a0 * 12 + m0; k <= a1 * 12 + m1 - 1; k++) {
    const anno = Math.floor(k / 12);
    const mese = k % 12;
    if (passo < 12 ? mese % passo !== 0 : mese !== 0 || anno % (passo / 12) !== 0) continue;
    const date = `${anno}-${String(mese + 1).padStart(2, '0')}-01`;
    tacche.push({ date, testo: mese === 0 ? String(anno) : MESI[mese] });
  }
  return tacche;
}

/**
 * Il grafico: i punti in proporzione al tempo (una misura dopo tre settimane
 * sta piu' lontana di una dopo tre giorni), la scala sulle tacche tonde.
 *
 * Col traguardo (il peso da raggiungere, vedi obiettivo.util) la scala lo
 * contiene: la distanza fra la linea e il traguardo si vede per quella che e'.
 * Con le pesate (la linea e' la loro media) la scala contiene anche loro: la
 * pesata piu' alta non esce dal grafico.
 */
export function disegnaAndamento(
  punti: PuntoMisura[], larghezza: number, altezza: number, traguardo: number | null = null, pesate: readonly PuntoMisura[] = []
): DisegnoAndamento {
  const piano = {
    x0: MARGINE.sinistra,
    x1: Math.max(MARGINE.sinistra + 1, larghezza - MARGINE.destra),
    y0: MARGINE.sopra,
    y1: Math.max(MARGINE.sopra + 1, altezza - MARGINE.sotto)
  };
  const vuoto: DisegnoAndamento = { larghezza, altezza, piano, linea: '', area: '', punti: [], valori: [], date: [], conPallini: false, pesate: [], traguardo: null };
  if (!punti.length) return vuoto;

  const valori = [...punti, ...pesate].map(p => p.value);
  const conTraguardo = traguardo !== null && isFinite(traguardo);
  if (conTraguardo) valori.push(traguardo!);
  const tacche = taccheValori(Math.min(...valori), Math.max(...valori));
  const vMin = tacche[0];
  const vMax = tacche[tacche.length - 1];
  const giorni = [...punti, ...pesate].map(p => giornoDi(p.date));
  const g0 = Math.min(...giorni);
  const g1 = Math.max(...giorni);
  const xDi = (iso: string) => g1 === g0
    ? (piano.x0 + piano.x1) / 2
    : piano.x0 + (piano.x1 - piano.x0) * (giornoDi(iso) - g0) / (g1 - g0);
  const yDi = (v: number) => piano.y1 - (piano.y1 - piano.y0) * (v - vMin) / (vMax - vMin);

  const disegnati = punti.map(p => ({ ...p, x: xDi(p.date), y: yDi(p.value) }));
  const linea = disegnati.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('');
  const primo = disegnati[0];
  const ultimo = disegnati[disegnati.length - 1];
  const area = `${linea}L${f(ultimo.x)} ${f(piano.y1)}L${f(primo.x)} ${f(piano.y1)}Z`;

  const date = taccheDate(isoDi(g0), isoDi(g1)).map(t => {
    const x = xDi(t.date);
    // Vicino ai bordi la scritta si appoggia dentro invece di uscire dalla card.
    const ancora: TaccaData['ancora'] = x - piano.x0 < 16 ? 'start' : piano.x1 - x < 16 ? 'end' : 'middle';
    return { x, testo: t.testo, ancora };
  });

  return {
    larghezza, altezza, piano, linea, area,
    punti: disegnati,
    valori: tacche.map(v => ({ y: yDi(v), testo: numeroIt(v) })),
    date,
    conPallini: !pesate.length && (disegnati.length < 2 || (piano.x1 - piano.x0) / (disegnati.length - 1) >= PASSO_PALLINI),
    pesate: pesate.map(p => ({ ...p, x: xDi(p.date), y: yDi(p.value) })),
    traguardo: conTraguardo ? scrittaDelTraguardo(yDi(traguardo!), piano.y0) : null
  };
}

/** La scritta "traguardo" sta sopra la linea; troppo in alto, sotto. */
function scrittaDelTraguardo(y: number, y0: number): { y: number; scrittaY: number } {
  return { y, scrittaY: y - 5 < y0 + 9 ? y + 13 : y - 5 };
}

/** L'indice del punto piu' vicino in orizzontale: il dito cerca una data, non una linea di due pixel. */
export function puntoPiuVicino(punti: { x: number }[], x: number): number {
  let migliore = -1;
  let distanza = Infinity;
  punti.forEach((p, i) => {
    const d = Math.abs(p.x - x);
    if (d < distanza) { distanza = d; migliore = i; }
  });
  return migliore;
}
