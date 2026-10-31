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

/**
 * Rifa a mano quello che farebbe il Web Audio: somma le onde di tutti gli
 * oscillatori, ognuna col suo inviluppo, e dice il picco. Serve ad accorgersi
 * se i colpi che si sovrappongono sommandosi superano il pieno e distorcono.
 */
function picco(f: Finto): number {
  const SR = 44100;
  const t0 = 10;                                   // il contesto finto parte da 10
  const somma = new Float32Array(SR * 3);
  f.oscillatori.forEach((o, i) => {
    const [hz, inizio] = o.frequency.setValueAtTime.mock.calls[0];
    const g = f.guadagni[i].gain;
    const [silenzio] = g.setValueAtTime.mock.calls[0];
    const [volume, fineAttacco] = g.linearRampToValueAtTime.mock.calls[0];
    const [, fine] = g.exponentialRampToValueAtTime.mock.calls[0];
    for (let k = Math.floor((inizio - t0) * SR); k < Math.min(somma.length, Math.ceil((fine - t0) * SR)); k++) {
      const t = t0 + k / SR;
      const inviluppo = t < fineAttacco
        ? silenzio + (volume - silenzio) * (t - inizio) / (fineAttacco - inizio)
        : volume * Math.pow(silenzio / volume, (t - fineAttacco) / (fine - fineAttacco));
      somma[k] += Math.sin(2 * Math.PI * hz * (t - inizio)) * inviluppo;
    }
  });
  return somma.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

describe('suona', () => {
  function pronto(stato = 'running') {
    const f = contestoFinto(stato);
    const amb = ambiente(f);
    amb.contesto = f.contesto;
    return { f, amb };
  }

  it('a fine recupero e\' una scampanellata: sette colpi ravvicinati, ognuno una campana di quattro parziali', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori).toHaveLength(28);
    const chiamate = f.oscillatori.map(o => o.frequency.setValueAtTime.mock.calls[0]);
    // Ogni colpo: la nota di base e i parziali non armonici (2,76, 5,4 e 8,93 volte).
    const rapporti = [1, 2.76, 5.4, 8.93];
    for (let colpo = 0; colpo < 7; colpo++) {
      rapporti.forEach((r, p) => {
        const [hz, t] = chiamate[colpo * 4 + p];
        expect(hz).toBeCloseTo(880 * r, 5);
        expect(t).toBeCloseTo(10 + colpo * 0.11, 5);
      });
    }
    expect(f.oscillatori[0].start).toHaveBeenCalledWith(10);
    // Ogni componente si ferma da sola, subito dopo la coda.
    expect(f.oscillatori[0].stop.mock.calls[0][0]).toBeGreaterThan(10.9);
    expect(f.oscillatori[24].stop.mock.calls[0][0]).toBeGreaterThan(10.66 + 0.9);
  });

  it('a fine pausa e\' un colpo solo, della stessa campana', () => {
    const { f, amb } = pronto();
    suona('fine-pausa', amb);
    expect(f.oscillatori).toHaveLength(4);
    expect(f.oscillatori[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
    expect(f.oscillatori.every(o => o.frequency.setValueAtTime.mock.calls[0][1] === 10)).toBe(true);
  });

  it('la serie confermata non suona: succede venti volte a seduta', () => {
    const { f, amb } = pronto();
    suona('serie', amb);
    expect(f.oscillatori).toHaveLength(0);
  });

  it('ogni componente ha attacco e coda, senza i clic di un\'onda tagliata di netto', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    const g = f.guadagni[0].gain;
    expect(g.setValueAtTime.mock.calls[0][0]).toBeGreaterThan(0);          // mai zero: la rampa esponenziale non lo regge
    // L'attacco e' una percossa: brevissimo.
    expect(g.linearRampToValueAtTime.mock.calls[0][1] - g.setValueAtTime.mock.calls[0][1]).toBeLessThanOrEqual(0.01);
    expect(g.exponentialRampToValueAtTime.mock.calls[0][0]).toBeLessThan(0.001);
    expect(g.exponentialRampToValueAtTime.mock.calls[0][1]).toBeGreaterThan(g.linearRampToValueAtTime.mock.calls[0][1]);
  });

  it('i parziali sono piu\' piano e piu\' brevi della nota di base: e\' cosi\' che suona di metallo', () => {
    const { f, amb } = pronto();
    suona('fine-pausa', amb);
    const volumi = f.guadagni.map(g => g.gain.linearRampToValueAtTime.mock.calls[0][0]);
    const fini = f.guadagni.map(g => g.gain.exponentialRampToValueAtTime.mock.calls[0][1]);
    expect(volumi.map(v => Math.round(v * 1000) / 1000)).toEqual([0.42, 0.252, 0.147, 0.084]);
    // Ogni parziale dura una frazione del colpo: 0,9 s la base, poi 0,54, 0,36 e 0,225.
    expect(fini.map(fine => Math.round((fine - 10) * 1000) / 1000)).toEqual([0.9, 0.54, 0.36, 0.225]);
  });

  it('e\' fatto di onde sinusoidali, una per parziale', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori.every(o => o.type === 'sine')).toBe(true);
  });

  // I colpi si sovrappongono e le onde si sommano: oltre il pieno il suono distorce,
  // e molto sotto non si sente. Si rifa il Web Audio a mano e si guarda il picco.
  it('la somma dei colpi che si sovrappongono resta sotto il pieno ma lo sfrutta quasi tutto', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(picco(f)).toBeGreaterThan(0.8);
    expect(picco(f)).toBeLessThanOrEqual(1);
  });

  it('anche un colpo solo (fine pausa) non distorce e si sente', () => {
    const { f, amb } = pronto();
    suona('fine-pausa', amb);
    expect(picco(f)).toBeGreaterThan(0.6);
    expect(picco(f)).toBeLessThanOrEqual(1);
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
    expect(f.oscillatori).toHaveLength(4);
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
    expect(tipi).toEqual(['playback']);            // la scampanellata dura circa 1,6 secondi
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
    vi.advanceTimersByTime(800);                   // t = 1,1 s: il primo e' finito (1,05 s), il secondo no (1,35 s)
    expect(tipi).not.toContain('auto');
    vi.advanceTimersByTime(400);
    expect(tipi.at(-1)).toBe('auto');
    expect(tipi.filter(x => x === 'auto')).toHaveLength(1);
  });

  it('dove la sessione non c\'e\' (Chrome, iOS vecchi) suona lo stesso', () => {
    const { f, amb } = pronto();
    suona('fine-recupero', amb);
    expect(f.oscillatori).toHaveLength(28);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('se la sessione rifiuta il cambio, suona lo stesso e non lancia', () => {
    Object.defineProperty(globalThis.navigator, 'audioSession', {
      value: { set type(_v: string) { throw new Error('non permesso'); } },
      configurable: true
    });
    const { f, amb } = pronto();
    expect(() => suona('fine-recupero', amb)).not.toThrow();
    expect(f.oscillatori).toHaveLength(28);
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
    expect(f.oscillatori).toHaveLength(28);
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
    expect(f.oscillatori).toHaveLength(28);
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
