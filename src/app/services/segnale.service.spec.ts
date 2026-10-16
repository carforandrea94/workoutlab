import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegnaleService } from './segnale.service';
import { AMBIENTE_SUONO, AmbienteSuono, PREFERENZE_SEGNALE_KEY } from '../core/utils/segnale.util';

/**
 * Il suono non parte se prima non c'e' stato un tocco: il servizio ascolta i
 * tocchi dell'app per sbloccarlo, e tiene le due preferenze (suono, vibrazione)
 * di questo dispositivo.
 */
describe('SegnaleService', () => {
  let oscillatori: any[];
  let contesto: any;
  let crea: ReturnType<typeof vi.fn<() => any>>;
  let ambiente: AmbienteSuono;

  beforeEach(() => {
    localStorage.removeItem(PREFERENZE_SEGNALE_KEY);
    oscillatori = [];
    contesto = {
      state: 'suspended', currentTime: 5, destination: {},
      resume: vi.fn(async () => { contesto.state = 'running'; }),
      createOscillator: () => {
        const o = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        oscillatori.push(o);
        return o;
      },
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn()
      }),
      createBuffer: vi.fn(() => ({})),
      createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: vi.fn() })
    };
    crea = vi.fn<() => any>(() => contesto);
    ambiente = { crea, contesto: null };
  });

  afterEach(() => {
    delete (navigator as any).vibrate;
    localStorage.removeItem(PREFERENZE_SEGNALE_KEY);
    delete (document as any).visibilityState;
  });

  function monta(): SegnaleService {
    TestBed.configureTestingModule({ providers: [{ provide: AMBIENTE_SUONO, useValue: ambiente }] });
    return TestBed.inject(SegnaleService);
  }

  const attendi = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

  it('parte con suono e vibrazione accesi', () => {
    const s = monta();
    expect(s.suono()).toBe(true);
    expect(s.vibrazione()).toBe(true);
  });

  it('rilegge le preferenze di questo dispositivo', () => {
    localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: false, vibrazione: false }));
    const s = monta();
    expect(s.suono()).toBe(false);
    expect(s.vibrazione()).toBe(false);
  });

  describe('sblocco dell\'audio', () => {
    it('il primo tocco in un punto qualsiasi dell\'app prepara il contesto', () => {
      monta();
      expect(crea).not.toHaveBeenCalled();
      document.body.dispatchEvent(new Event('click', { bubbles: true }));
      expect(crea).toHaveBeenCalledTimes(1);
      expect(contesto.resume).toHaveBeenCalled();
    });

    it('anche il touchend lo prepara: e\' quello che iOS riconosce come gesto', () => {
      monta();
      document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
      expect(crea).toHaveBeenCalledTimes(1);
    });

    it('lo fa in cattura: un controllo che ferma la propagazione non lo impedisce', () => {
      monta();
      const bottone = document.createElement('button');
      bottone.addEventListener('click', e => e.stopPropagation());
      document.body.appendChild(bottone);
      bottone.click();
      bottone.remove();
      expect(crea).toHaveBeenCalledTimes(1);
    });

    it('con il suono spento il tocco non crea niente', () => {
      localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: false, vibrazione: true }));
      monta();
      document.body.dispatchEvent(new Event('click', { bubbles: true }));
      expect(crea).not.toHaveBeenCalled();
    });

    it('tornando visibile dopo il secondo piano riprende il contesto sospeso', () => {
      monta();
      document.body.dispatchEvent(new Event('click', { bubbles: true }));
      contesto.state = 'interrupted';
      contesto.resume.mockClear();
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(contesto.resume).toHaveBeenCalledTimes(1);
    });

    it('nascosta non prova niente: da nascosti il browser non lo permette', () => {
      monta();
      document.body.dispatchEvent(new Event('click', { bubbles: true }));
      contesto.state = 'interrupted';
      contesto.resume.mockClear();
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(contesto.resume).not.toHaveBeenCalled();
    });

    it('smontato non ascolta piu\'', () => {
      monta();
      TestBed.resetTestingModule();
      document.body.dispatchEvent(new Event('click', { bubbles: true }));
      expect(crea).not.toHaveBeenCalled();
    });
  });

  describe('il suono', () => {
    it('accenderlo lo salva, sblocca l\'audio e fa sentire com\'e\'', async () => {
      localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: false, vibrazione: true }));
      const s = monta();
      s.impostaSuono(true);
      await attendi();
      expect(s.suono()).toBe(true);
      expect(JSON.parse(localStorage.getItem(PREFERENZE_SEGNALE_KEY)!)).toEqual({ suono: true, vibrazione: true });
      expect(crea).toHaveBeenCalledTimes(1);
      expect(oscillatori.length).toBe(2);
    });

    it('spegnerlo lo salva e non suona', async () => {
      const s = monta();
      s.impostaSuono(false);
      await attendi();
      expect(s.suono()).toBe(false);
      expect(JSON.parse(localStorage.getItem(PREFERENZE_SEGNALE_KEY)!).suono).toBe(false);
      expect(oscillatori).toHaveLength(0);
    });

    it('ripetere lo stesso valore (lo fa l\'interruttore al disegno) non suona e non salva', async () => {
      const s = monta();
      s.impostaSuono(true);
      await attendi();
      expect(oscillatori).toHaveLength(0);
      expect(localStorage.getItem(PREFERENZE_SEGNALE_KEY)).toBeNull();
    });
  });

  describe('la vibrazione', () => {
    it('dove il browser non vibra (iPhone dalla Home) l\'interruttore e\' da nascondere', () => {
      expect(monta().vibrazioneDisponibile).toBe(false);
    });

    it('dove vibra e\' disponibile', () => {
      Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true, writable: true });
      expect(monta().vibrazioneDisponibile).toBe(true);
    });

    it('accenderla si sente, spegnerla no, e si salva', () => {
      const vibrate = vi.fn(() => true);
      Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
      localStorage.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify({ suono: true, vibrazione: false }));
      const s = monta();

      s.impostaVibrazione(true);
      expect(vibrate).toHaveBeenCalledWith(200);
      expect(JSON.parse(localStorage.getItem(PREFERENZE_SEGNALE_KEY)!)).toEqual({ suono: true, vibrazione: true });

      vibrate.mockClear();
      s.impostaVibrazione(false);
      expect(vibrate).not.toHaveBeenCalled();
      expect(s.vibrazione()).toBe(false);
    });
  });
});
