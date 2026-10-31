import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmbienteSuono, ContestoSuonoLike, PREFERENZE_SEGNALE_KEY,
  leggiPreferenze, salvaPreferenze, sbloccaAudio, segnala, suona
} from './segnale.util';

/**
 * Su iPhone installato dalla Home la vibrazione non esiste e il recupero
 * finiva in silenzio: il suono e' l'unico canale che resta. L'audio del
 * browser si sostituisce con un finto che ricorda cosa gli e' stato chiesto.
 */

/** Un archivio in memoria, o uno che si rifiuta (finestra privata). */
function archivio(valore: string | null = null, rifiuta = false) {
  let v = valore;
  return {
    getItem: vi.fn((k: string) => { if (rifiuta) throw new Error('negato'); return k === PREFERENZE_SEGNALE_KEY ? v : null; }),
    setItem: vi.fn((k: string, nuovo: string) => { if (rifiuta) throw new Error('negato'); if (k === PREFERENZE_SEGNALE_KEY) v = nuovo; }),
    valore: () => v
  };
}

interface Finto {
  contesto: ContestoSuonoLike & { state: string };
  oscillatori: any[];
  guadagni: any[];
  sorgenti: any[];
}

function contestoFinto(stato = 'running'): Finto {
  const oscillatori: any[] = [];
  const guadagni: any[] = [];
  const sorgenti: any[] = [];
  const c: any = {
    state: stato,
    currentTime: 10,
    destination: { id: 'uscita' },
    resume: vi.fn(async () => { c.state = 'running'; }),
    createOscillator: () => {
      const o = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillatori.push(o);
      return o;
    },
    createGain: () => {
      const g = {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn()
      };
      guadagni.push(g);
      return g;
    },
    createBuffer: vi.fn(() => ({ buffer: true })),
    createBufferSource: () => {
      const s = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
      sorgenti.push(s);
      return s;
    }
  };
  return { contesto: c, oscillatori, guadagni, sorgenti };
}

const ambiente = (finto: Finto | null, crea = true): AmbienteSuono =>
  ({ crea: crea && finto ? () => finto.contesto : null, contesto: null });

describe('preferenze del segnale', () => {
  it('senza niente di salvato, suono e vibrazione sono accesi', () => {
    expect(leggiPreferenze(archivio())).toEqual({ suono: true, vibrazione: true });
  });

  it('rilegge quello che e\' stato salvato', () => {
    const a = archivio();
    salvaPreferenze({ suono: false, vibrazione: true }, a);
    expect(leggiPreferenze(a)).toEqual({ suono: false, vibrazione: true });
  });

  it('un valore rovinato o di forma diversa non spegne niente', () => {
    expect(leggiPreferenze(archivio('{non json'))).toEqual({ suono: true, vibrazione: true });
    expect(leggiPreferenze(archivio('{"suono":"no"}'))).toEqual({ suono: true, vibrazione: true });
    expect(leggiPreferenze(archivio('null'))).toEqual({ suono: true, vibrazione: true });
  });

  it('un campo che manca resta acceso, quello presente si rispetta', () => {
    expect(leggiPreferenze(archivio('{"vibrazione":false}'))).toEqual({ suono: true, vibrazione: false });
  });

  it('dove l\'archivio si rifiuta (finestra privata) non lancia', () => {
    const a = archivio(null, true);
    expect(() => salvaPreferenze({ suono: false, vibrazione: false }, a)).not.toThrow();
    expect(leggiPreferenze(a)).toEqual({ suono: true, vibrazione: true });
  });

  it('senza archivio (null) si usano i valori di partenza', () => {
    expect(leggiPreferenze(null)).toEqual({ suono: true, vibrazione: true });
    expect(() => salvaPreferenze({ suono: false, vibrazione: false }, null)).not.toThrow();
  });
});

describe('sbloccaAudio', () => {
  it('senza Web Audio non fa niente', () => {
    const amb = ambiente(null);
    expect(() => sbloccaAudio(amb)).not.toThrow();
    expect(amb.contesto).toBeNull();
  });

  it('crea il contesto al primo tocco e lo riprende se e\' sospeso', () => {
    const f = contestoFinto('suspended');
    const amb = ambiente(f);
    sbloccaAudio(amb);
    expect(amb.contesto).toBe(f.contesto);
    expect(f.contesto.resume).toHaveBeenCalledTimes(1);
  });

  it('fa partire un buffer vuoto dentro il gesto: il trucco che iOS richiede', () => {
    const f = contestoFinto('suspended');
    sbloccaAudio(ambiente(f));
    expect(f.sorgenti).toHaveLength(1);
    expect(f.sorgenti[0].start).toHaveBeenCalledWith(0);
    expect(f.sorgenti[0].connect).toHaveBeenCalledWith(f.contesto.destination);
  });

  it('ai tocchi successivi non ricrea niente e, se gira gia\', non lo riprende', () => {
    const f = contestoFinto('suspended');
    const crea = vi.fn(() => f.contesto);
    const amb: AmbienteSuono = { crea, contesto: null };
    sbloccaAudio(amb);          // crea e riprende: ora e' in esecuzione
    sbloccaAudio(amb);
    sbloccaAudio(amb);
    expect(crea).toHaveBeenCalledTimes(1);
    expect(f.contesto.resume).toHaveBeenCalledTimes(1);
  });

  it('se il sistema l\'ha sospeso (telefonata, app in secondo piano) il tocco dopo lo riprende', () => {
    const f = contestoFinto('running');
    const amb = ambiente(f);
    sbloccaAudio(amb);
    f.contesto.state = 'interrupted';
    sbloccaAudio(amb);
    expect(f.contesto.resume).toHaveBeenCalledTimes(1);
  });

  it('un contesto chiuso si rifa', () => {
    const primo = contestoFinto('running');
    const secondo = contestoFinto('running');
    const amb: AmbienteSuono = { crea: vi.fn().mockReturnValueOnce(primo.contesto).mockReturnValueOnce(secondo.contesto), contesto: null };
    sbloccaAudio(amb);
    primo.contesto.state = 'closed';
    sbloccaAudio(amb);
    expect(amb.contesto).toBe(secondo.contesto);
  });

  it('se la creazione lancia non si rompe e non tiene mezzo contesto', () => {
    const amb: AmbienteSuono = { crea: () => { throw new Error('no'); }, contesto: null };
    expect(() => sbloccaAudio(amb)).not.toThrow();
    expect(amb.contesto).toBeNull();
  });

  it('un resume rifiutato non e\' un errore', async () => {
    const f = contestoFinto('suspended');
    f.contesto.resume = vi.fn(() => Promise.reject(new Error('serve un gesto')));
    expect(() => sbloccaAudio(ambiente(f))).not.toThrow();
    await Promise.resolve();
  });
});

describe('suona', () => {
  function pronto(stato = 'running') {
    const f = contestoFinto(stato);
    const amb = ambiente(f);
    amb.contesto = f.contesto;
    return { f, amb };
  }

  it('a fine recupero fa tre note che salgono, e poi si ripete', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori).toHaveLength(6);
    const chiamate = f.oscillatori.map(o => o.frequency.setValueAtTime.mock.calls[0]);
    expect(chiamate.map(([hz]) => hz)).toEqual([1047, 1319, 1568, 1047, 1319, 1568]);
    // Dentro la figura ogni nota viene dopo la precedente e piu' in alto; la figura si ripete un secondo dopo.
    expect(chiamate.map(([, t]) => Math.round((t - 10) * 100) / 100)).toEqual([0, 0.2, 0.4, 1, 1.2, 1.4]);
    expect(f.oscillatori[0].start).toHaveBeenCalledWith(10);
    // Ogni nota si ferma da sola, subito dopo la coda.
    expect(f.oscillatori[0].stop.mock.calls[0][0]).toBeGreaterThan(10.16);
    expect(f.oscillatori[5].stop.mock.calls[0][0]).toBeGreaterThan(11.4 + 0.34);
  });

  it('a fine pausa fa una nota sola, piu\' bassa e piu\' lunga di quelle del recupero', () => {
    const { f, amb } = pronto();
    suona('fine-pausa', amb);
    expect(f.oscillatori).toHaveLength(1);
    expect(f.oscillatori[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
    expect(f.oscillatori[0].stop.mock.calls[0][0]).toBeGreaterThan(10.4);
  });

  it('la serie confermata non suona: succede venti volte a seduta', () => {
    const { f, amb } = pronto();
    suona('serie', amb);
    expect(f.oscillatori).toHaveLength(0);
  });

  it('ogni nota ha attacco e coda, senza i clic di un\'onda tagliata di netto', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    const g = f.guadagni[0].gain;
    expect(g.setValueAtTime.mock.calls[0][0]).toBeGreaterThan(0);          // mai zero: la rampa esponenziale non lo regge
    // Si sente con la musica e il rumore della palestra, ma senza superare il pieno (distorcerebbe).
    expect(g.linearRampToValueAtTime.mock.calls[0][0]).toBeGreaterThanOrEqual(0.7);
    expect(g.linearRampToValueAtTime.mock.calls[0][0]).toBeLessThanOrEqual(1);
    expect(g.exponentialRampToValueAtTime.mock.calls[0][0]).toBeLessThan(0.001);
    expect(g.exponentialRampToValueAtTime.mock.calls[0][1]).toBeGreaterThan(g.linearRampToValueAtTime.mock.calls[0][1]);
  });

  it('l\'onda e\' triangolare: le armoniche in piu\' bucano il rumore e la cassa del telefono le rende', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori.every(o => o.type === 'triangle')).toBe(true);
  });

  it('oscillatore, guadagno e uscita sono collegati in fila', () => {
    const { f, amb } = pronto();
    suona('fine-pausa', amb);
    expect(f.oscillatori[0].connect).toHaveBeenCalledWith(f.guadagni[0]);
    expect(f.guadagni[0].connect).toHaveBeenCalledWith(f.contesto.destination);
  });

  it('se nessun tocco ha ancora sbloccato l\'audio, sta zitto', () => {
    const f = contestoFinto();
    const amb = ambiente(f);              // contesto ancora null
    expect(() => suona('fine-recupero', amb)).not.toThrow();
    expect(f.oscillatori).toHaveLength(0);
  });

  it('con il contesto sospeso lo riprende e poi suona', async () => {
    const { f, amb } = pronto('suspended');
    suona('fine-pausa', amb);
    expect(f.oscillatori).toHaveLength(0);     // non suona su un contesto fermo: partirebbe dopo, a caso
    await Promise.resolve(); await Promise.resolve();
    expect(f.contesto.resume).toHaveBeenCalled();
    expect(f.oscillatori).toHaveLength(1);
  });

  it('se il sistema non lo lascia riprendere resta zitto senza errori', async () => {
    const { f, amb } = pronto('suspended');
    f.contesto.resume = vi.fn(() => Promise.reject(new Error('serve un gesto')));
    expect(() => suona('fine-recupero', amb)).not.toThrow();
    await Promise.resolve(); await Promise.resolve();
    expect(f.oscillatori).toHaveLength(0);
  });

  it('se il resume risponde ma il contesto resta fermo non mette in coda note che partirebbero dopo, a caso', async () => {
    const { f, amb } = pronto('suspended');
    f.contesto.resume = vi.fn(async () => { /* risolve, ma lo stato non cambia */ });
    suona('fine-recupero', amb);
    await Promise.resolve(); await Promise.resolve();
    expect(f.contesto.resume).toHaveBeenCalled();
    expect(f.oscillatori).toHaveLength(0);
  });

  it('un errore dentro il Web Audio non ferma il timer', () => {
    const { f, amb } = pronto();
    f.contesto.createOscillator = () => { throw new Error('boom'); };
    expect(() => suona('fine-recupero', amb)).not.toThrow();
  });
});

/**
 * Su iPhone il Web Audio e' muto con l'interruttore del silenzioso: durante il
 * suono la sessione audio di Safari (17+) diventa "playback", che suona
 * comunque, e poi torna "auto" perche' un contesto sempre acceso con "playback"
 * terrebbe occupato l'audio del telefono (la musica si fermerebbe).
 */
describe('suona — la sessione audio di iOS', () => {
  function conSessione() {
    const sessione = { type: 'auto' };
    const tipi: string[] = [];
    Object.defineProperty(sessione, 'type', {
      get: () => tipi.at(-1) ?? 'auto',
      set: (v: string) => { tipi.push(v); },
      configurable: true
    });
    Object.defineProperty(globalThis.navigator, 'audioSession', { value: sessione, configurable: true });
    return tipi;
  }
  function pronto() {
    const f = contestoFinto();
    const amb = ambiente(f);
    amb.contesto = f.contesto;
    return { f, amb };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    delete (globalThis.navigator as any).audioSession;
  });

  it('mentre suona e\' "playback", finito torna "auto"', () => {
    const tipi = conSessione();
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(tipi).toEqual(['playback']);
    // Prima che la sessione sia pronta non si e' ancora creato niente: l'ordine conta.
    expect(f.oscillatori.length).toBeGreaterThan(0);
    vi.advanceTimersByTime(1000);
    expect(tipi).toEqual(['playback']);            // il suono dura circa 1,75 secondi
    vi.advanceTimersByTime(1000);
    expect(tipi).toEqual(['playback', 'auto']);
  });

  it('la sessione e\' pronta prima che parta la prima nota', () => {
    const tipi = conSessione();
    const { f, amb } = pronto();
    // Si registra lo stato e si controlla dopo: un'asserzione dentro il Web Audio
    // finto la inghiottirebbe il try/catch che protegge il timer.
    let allaPrimaNota: string[] | null = null;
    const crea = f.contesto.createOscillator;
    f.contesto.createOscillator = () => { allaPrimaNota ??= [...tipi]; return crea(); };
    suona('fine-pausa', amb);
    expect(allaPrimaNota).toEqual(['playback']);
  });

  it('due suoni ravvicinati: si rilascia solo quando finiscono tutti e due', () => {
    const tipi = conSessione();
    const { amb } = pronto();
    suona('fine-pausa', amb);
    vi.advanceTimersByTime(300);
    suona('fine-pausa', amb);
    vi.advanceTimersByTime(300);                   // il primo e' finito (0,55 s), il secondo no
    expect(tipi).not.toContain('auto');
    vi.advanceTimersByTime(1000);
    expect(tipi.at(-1)).toBe('auto');
    expect(tipi.filter(x => x === 'auto')).toHaveLength(1);
  });

  it('dove la sessione non c\'e\' (Chrome, iOS vecchi) suona lo stesso', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori).toHaveLength(6);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('se la sessione rifiuta il cambio, suona lo stesso e non lancia', () => {
    Object.defineProperty(globalThis.navigator, 'audioSession', {
      value: { set type(_v: string) { throw new Error('non permesso'); } },
      configurable: true
    });
    const { f, amb } = pronto();
    expect(() => suona('fine-recupero', amb)).not.toThrow();
    expect(f.oscillatori).toHaveLength(6);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('un contesto che non gira non tocca la sessione', () => {
    const tipi = conSessione();
    const f = contestoFinto('suspended');
    f.contesto.resume = vi.fn(async () => { /* resta fermo */ });
    const amb = ambiente(f);
    amb.contesto = f.contesto;
    suona('fine-recupero', amb);
    expect(tipi).toEqual([]);
  });
});

describe('segnala', () => {
  let vibrate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  });
  afterEach(() => { delete (navigator as any).vibrate; });

  function pronto() {
    const f = contestoFinto();
    const amb = ambiente(f);
    amb.contesto = f.contesto;
    return { f, amb };
  }

  it('a fine recupero, con tutto acceso, vibra e suona', () => {
    const { f, amb } = pronto();
    segnala('fine-recupero', { preferenze: { suono: true, vibrazione: true }, suono: amb });
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(f.oscillatori).toHaveLength(6);
  });

  it('col suono spento vibra soltanto', () => {
    const { f, amb } = pronto();
    segnala('fine-recupero', { preferenze: { suono: false, vibrazione: true }, suono: amb });
    expect(vibrate).toHaveBeenCalled();
    expect(f.oscillatori).toHaveLength(0);
  });

  it('con la vibrazione spenta suona soltanto', () => {
    const { f, amb } = pronto();
    segnala('fine-recupero', { preferenze: { suono: true, vibrazione: false }, suono: amb });
    expect(vibrate).not.toHaveBeenCalled();
    expect(f.oscillatori).toHaveLength(6);
  });

  it('con tutto spento non fa niente', () => {
    const { f, amb } = pronto();
    segnala('fine-recupero', { preferenze: { suono: false, vibrazione: false }, suono: amb });
    segnala('fine-pausa', { preferenze: { suono: false, vibrazione: false }, suono: amb });
    segnala('serie', { preferenze: { suono: false, vibrazione: false }, suono: amb });
    expect(vibrate).not.toHaveBeenCalled();
    expect(f.oscillatori).toHaveLength(0);
  });

  it('la serie confermata vibra ma non suona', () => {
    const { f, amb } = pronto();
    segnala('serie', { preferenze: { suono: true, vibrazione: true }, suono: amb });
    expect(vibrate).toHaveBeenCalledWith(15);
    expect(f.oscillatori).toHaveLength(0);
  });

  it('senza preferenze passate legge quelle salvate sul dispositivo', () => {
    const { f, amb } = pronto();
    localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: false, vibrazione: true }));
    try {
      segnala('fine-recupero', { suono: amb });
      expect(vibrate).toHaveBeenCalled();
      expect(f.oscillatori).toHaveLength(0);
    } finally {
      localStorage.removeItem(PREFERENZE_SEGNALE_KEY);
    }
  });
});
