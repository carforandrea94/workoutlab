import { InjectionToken } from '@angular/core';
import { vibra, Vibrazione } from './vibrazione.util';

/**
 * Il segnale di fine recupero: il telefono e' sulla panca o in tasca, e quello
 * che serve e' sentirlo. Su iPhone installato dalla Home la vibrazione del
 * browser non esiste (vedi vibrazione.util), e il suono e' l'unico canale che
 * resta: un suono fatto col Web Audio invece di un file, cosi' non c'e'
 * niente da scaricare ne' da tenere in cache.
 *
 * Deve sentirsi: in palestra c'e' musica e rumore, e il telefono sta sulla
 * panca o in tasca. Per questo il suono e' forte e lungo, e su iPhone si
 * chiede la sessione audio "playback": di suo il Web Audio e' muto con
 * l'interruttore del silenzioso, e chi si allena col telefono in silenzioso
 * non sentirebbe niente.
 *
 * Due preferenze, per dispositivo e non per account: il suono serve sul
 * telefono in palestra e magari non sul portatile a casa.
 */

export interface PreferenzeSegnale {
  suono: boolean;
  vibrazione: boolean;
}

export const PREFERENZE_SEGNALE_KEY = 'segnaleRecupero';

type Archivio = Pick<Storage, 'getItem' | 'setItem'>;

function archivioReale(): Archivio | null {
  // In una finestra privata il solo accesso a localStorage puo' lanciare.
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Entrambi accesi finche' non si dice altro: un cronometro da palestra suona. */
export function leggiPreferenze(archivio: Archivio | null = archivioReale()): PreferenzeSegnale {
  try {
    const grezzo = archivio?.getItem(PREFERENZE_SEGNALE_KEY);
    if (!grezzo) return { suono: true, vibrazione: true };
    const p = JSON.parse(grezzo);
    return {
      suono: typeof p?.suono === 'boolean' ? p.suono : true,
      vibrazione: typeof p?.vibrazione === 'boolean' ? p.vibrazione : true
    };
  } catch {
    return { suono: true, vibrazione: true };
  }
}

export function salvaPreferenze(p: PreferenzeSegnale, archivio: Archivio | null = archivioReale()): void {
  try { archivio?.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify(p)); } catch { /* resta quella in memoria */ }
}

// ---- Il suono ----

/** Quello che serve del Web Audio: gli spec lo sostituiscono con un finto. */
export interface OscillatoreLike {
  type: string;
  frequency: { setValueAtTime(valore: number, quando: number): unknown };
  connect(destinazione: unknown): unknown;
  start(quando?: number): void;
  stop(quando?: number): void;
}
export interface GuadagnoLike {
  gain: {
    setValueAtTime(valore: number, quando: number): unknown;
    linearRampToValueAtTime(valore: number, quando: number): unknown;
    exponentialRampToValueAtTime(valore: number, quando: number): unknown;
  };
  connect(destinazione: unknown): unknown;
}
export interface ContestoSuonoLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatoreLike;
  createGain(): GuadagnoLike;
  createBuffer(canali: number, lunghezza: number, frequenza: number): unknown;
  createBufferSource(): { buffer: unknown; connect(destinazione: unknown): unknown; start(quando?: number): void };
}

/** Il costruttore del contesto (null dove il browser non ha il Web Audio) e il contesto una volta creato. */
export interface AmbienteSuono {
  crea: (() => ContestoSuonoLike) | null;
  contesto: ContestoSuonoLike | null;
}

function costruttoreAudio(): (() => ContestoSuonoLike) | null {
  const g = globalThis as any;
  const Contesto = g.AudioContext ?? g.webkitAudioContext;
  return Contesto ? () => new Contesto() as ContestoSuonoLike : null;
}

let reale: AmbienteSuono | null = null;

/** Uno solo per l'app: il contesto sbloccato da un tocco deve essere lo stesso che poi suona. */
export function ambienteSuonoReale(): AmbienteSuono {
  return reale ??= { crea: costruttoreAudio(), contesto: null };
}

export const AMBIENTE_SUONO = new InjectionToken<AmbienteSuono>('ambiente-suono', {
  providedIn: 'root',
  factory: ambienteSuonoReale
});

/**
 * iOS (e Chrome) tengono il suono muto finche' non c'e' un gesto dell'utente:
 * il contesto si crea e si riprende dentro un tocco, e da li' in poi il timer
 * puo' suonare anche senza che nessuno stia toccando. Si richiama a ogni tocco:
 * se il contesto gira gia' non costa niente, se il sistema l'ha sospeso (app in
 * secondo piano, telefonata) lo riprende.
 */
export function sbloccaAudio(ambiente: AmbienteSuono = ambienteSuonoReale()): void {
  if (!ambiente.crea) return;
  try {
    if (!ambiente.contesto || ambiente.contesto.state === 'closed') {
      const c = ambiente.crea();
      ambiente.contesto = c;
      // Il trucco storico di iOS: un buffer vuoto fatto partire dentro il gesto.
      const sorgente = c.createBufferSource();
      sorgente.buffer = c.createBuffer(1, 1, 22050);
      sorgente.connect(c.destination);
      sorgente.start(0);
    }
    if (ambiente.contesto.state !== 'running') ambiente.contesto.resume().catch(() => {});
  } catch {
    ambiente.contesto = null;
  }
}

interface Nota { hz: number; dopo: number; durata: number }

/**
 * Fine recupero: tre note che salgono (do, mi, sol), due volte. Le note stanno
 * sopra i mille hertz perche' e' li' che la cassa di un telefono rende di piu',
 * e la ripetizione si nota anche con la musica addosso; la figura che sale e'
 * riconoscibile e diversa da un avviso qualunque. Fine pausa: una nota sola,
 * perche' e' un avviso meno importante. La serie confermata non suona: succede
 * venti volte a seduta, e per quello basta il tocco.
 */
const FIGURA_RECUPERO: Nota[] = [
  { hz: 1047, dopo: 0, durata: 0.16 },
  { hz: 1319, dopo: 0.2, durata: 0.16 },
  { hz: 1568, dopo: 0.4, durata: 0.34 }
];
const NOTE: Partial<Record<Vibrazione, Nota[]>> = {
  'fine-recupero': [...FIGURA_RECUPERO, ...FIGURA_RECUPERO.map(n => ({ ...n, dopo: n.dopo + 1 }))],
  'fine-pausa': [{ hz: 880, dopo: 0, durata: 0.4 }]
};

/** Forte: il telefono sta in tasca o sulla panca, con la musica della palestra. */
const VOLUME = 0.8;
/** Il piu' basso che l'inviluppo esponenziale accetta: a zero la rampa non si puo' calcolare. */
const SILENZIO = 0.0001;

/** La sessione audio di Safari/iOS (17 e successivi); non c'e' altrove. */
interface SessioneAudioLike { type: string }

function sessioneAudio(): SessioneAudioLike | null {
  const s = (globalThis as any).navigator?.audioSession;
  return s && typeof s === 'object' ? s : null;
}

/** Quanti suoni stanno ancora suonando: la sessione si rilascia solo quando finiscono tutti. */
let inRiproduzione = 0;

/**
 * Per la durata del suono la sessione e' "playback", che suona anche con il
 * silenzioso; finito, torna "auto". Solo mentre suona e non al primo tocco:
 * un contesto audio che resta acceso con "playback" terrebbe occupato l'audio
 * del telefono per tutto l'allenamento, e la musica si fermerebbe.
 */
function sessionePerSuonare(durata: number): void {
  const sessione = sessioneAudio();
  if (!sessione) return;
  try { sessione.type = 'playback'; } catch { return; }
  inRiproduzione++;
  setTimeout(() => {
    if (--inRiproduzione > 0) return;
    try { sessione.type = 'auto'; } catch { /* resta com'e': non e' un errore */ }
  }, (durata + 0.15) * 1000);
}

function suonaOra(c: ContestoSuonoLike, note: Nota[]): void {
  if (c.state !== 'running') return;
  sessionePerSuonare(Math.max(...note.map(n => n.dopo + n.durata)));
  const t0 = c.currentTime;
  for (const n of note) {
    const inizio = t0 + n.dopo;
    const osc = c.createOscillator();
    const guadagno = c.createGain();
    // Triangolare e non sinusoidale: le armoniche in piu' la fanno "bucare"
    // il rumore e la cassa del telefono le rende meglio di un tono puro.
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.hz, inizio);
    // Attacco rapido e coda che si spegne: senza, l'inizio e la fine della
    // nota fanno "clic".
    guadagno.gain.setValueAtTime(SILENZIO, inizio);
    guadagno.gain.linearRampToValueAtTime(VOLUME, inizio + 0.015);
    guadagno.gain.exponentialRampToValueAtTime(SILENZIO, inizio + n.durata);
    osc.connect(guadagno);
    guadagno.connect(c.destination);
    osc.start(inizio);
    osc.stop(inizio + n.durata + 0.02);
  }
}

/** Mai sbloccato (nessun tocco ancora) o senza Web Audio: non succede niente, e non e' un errore. */
export function suona(tipo: Vibrazione, ambiente: AmbienteSuono = ambienteSuonoReale()): void {
  const note = NOTE[tipo];
  const c = ambiente.contesto;
  if (!note || !c) return;
  try {
    if (c.state === 'running') { suonaOra(c, note); return; }
    // Sospeso dal sistema: si prova a riprenderlo. Se il browser lo permette
    // la nota parte (un attimo in ritardo), altrimenti si resta zitti.
    c.resume().then(() => suonaOra(c, note)).catch(() => {});
  } catch { /* un suono mancato non deve fermare il timer */ }
}

// ---- La porta unica ----

/**
 * Il segnale con quello che l'utente ha scelto. E' l'unico punto da cui
 * partono vibrazione e suono: chi spegne il suono dalle Impostazioni deve
 * poter contare che non parta da nessun'altra parte.
 */
export function segnala(
  tipo: Vibrazione,
  opzioni: { preferenze?: PreferenzeSegnale; suono?: AmbienteSuono } = {}
): void {
  const p = opzioni.preferenze ?? leggiPreferenze();
  if (p.vibrazione) vibra(tipo);
  if (p.suono) suona(tipo, opzioni.suono);
}
