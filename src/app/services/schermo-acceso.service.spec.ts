import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchermoAccesoService, WAKE_LOCK, WakeLockSentinelLike } from './schermo-acceso.service';
import { WorkoutSessionStateService } from './workout-session-state.service';

/**
 * Il recupero si legge col telefono appoggiato: lo schermo non deve spegnersi
 * fra una serie e l'altra, ne' restare acceso quando l'allenamento e' finito.
 */
describe('SchermoAccesoService', () => {
  /** Un blocco finto: sa se e' stato rilasciato e lo puo' perdere "dal browser". */
  function sentinella(): WakeLockSentinelLike & { perdi(): void; rilascia: ReturnType<typeof vi.fn> } {
    let cb: (() => void) | null = null;
    const s: any = {
      released: false,
      addEventListener: (_: 'release', f: () => void) => { cb = f; },
      rilascia: vi.fn(async () => { s.released = true; cb?.(); }),
      release() { return s.rilascia(); },
      perdi() { s.released = true; cb?.(); }
    };
    return s;
  }

  function monta(opzioni: { api?: boolean; sessione?: any } = {}) {
    const blocchi: ReturnType<typeof sentinella>[] = [];
    const request = vi.fn(async () => { const s = sentinella(); blocchi.push(s); return s; });
    const attiva = signal<any>(opzioni.sessione ?? null);
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutSessionStateService, useValue: { activeSession: attiva } },
        { provide: WAKE_LOCK, useValue: opzioni.api === false ? null : { request } }
      ]
    });
    const servizio = TestBed.inject(SchermoAccesoService);
    const aggiorna = async () => { TestBed.tick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
    return { servizio, attiva, request, blocchi, aggiorna };
  }

  const nascondi = () => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  const mostra = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => { delete (document as any).visibilityState; });

  it('senza una sessione non chiede niente', async () => {
    const { request, aggiorna } = monta();
    await aggiorna();
    expect(request).not.toHaveBeenCalled();
  });

  it('con una sessione in corso chiede lo schermo acceso, una volta sola', async () => {
    const { request, attiva, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    await aggiorna();
    expect(request).toHaveBeenCalledWith('screen');
    // La sessione si aggiorna a ogni cambio (nome, bozza...): non deve richiedere ogni volta.
    attiva.set({ dayId: 'd1', pausedAt: null, extra: 1 });
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('avviando la sessione dopo, parte da li\'', async () => {
    const { request, attiva, aggiorna } = monta();
    await aggiorna();
    attiva.set({ dayId: 'd1', pausedAt: null });
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('in pausa rilascia, e riprendendo lo richiede', async () => {
    const { request, blocchi, attiva, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    await aggiorna();
    attiva.set({ dayId: 'd1', pausedAt: '2026-10-15T10:00:00Z' });
    await aggiorna();
    expect(blocchi[0].rilascia).toHaveBeenCalledTimes(1);

    attiva.set({ dayId: 'd1', pausedAt: null });
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a sessione finita rilascia: lo schermo non resta acceso a vuoto', async () => {
    const { blocchi, attiva, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    await aggiorna();
    attiva.set(null);
    await aggiorna();
    expect(blocchi[0].rilascia).toHaveBeenCalledTimes(1);
  });

  it('il browser lo toglie in secondo piano: al ritorno visibile si richiede', async () => {
    const { request, blocchi, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    await aggiorna();
    nascondi();
    blocchi[0].perdi();
    document.dispatchEvent(new Event('visibilitychange'));
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(1); // da nascosti non si puo' chiedere

    mostra();
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('da pagina nascosta non prova nemmeno a chiederlo', async () => {
    nascondi();
    const { request, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    await aggiorna();
    expect(request).not.toHaveBeenCalled();
  });

  it('se il sistema lo nega non succede niente, e al prossimo ritorno ci riprova', async () => {
    const { request, aggiorna } = monta({ sessione: { dayId: 'd1', pausedAt: null } });
    request.mockRejectedValueOnce(new DOMException('batteria scarica', 'NotAllowedError'));
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(1);

    mostra();
    await aggiorna();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('dove l\'API non esiste non fa niente e non si rompe', async () => {
    const { attiva, aggiorna } = monta({ api: false });
    attiva.set({ dayId: 'd1', pausedAt: null });
    await expect(aggiorna()).resolves.toBeUndefined();
  });

  it('se la sessione finisce mentre il browser sta ancora rispondendo, il blocco si rilascia subito', async () => {
    let risolvi!: (s: WakeLockSentinelLike) => void;
    const lenta = new Promise<WakeLockSentinelLike>(r => { risolvi = r; });
    const request = vi.fn(() => lenta);
    const attiva = signal<any>({ dayId: 'd1', pausedAt: null });
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutSessionStateService, useValue: { activeSession: attiva } },
        { provide: WAKE_LOCK, useValue: { request } }
      ]
    });
    TestBed.inject(SchermoAccesoService);
    TestBed.tick();
    expect(request).toHaveBeenCalledTimes(1);

    attiva.set(null);
    TestBed.tick();
    const s = sentinella();
    risolvi(s);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(s.rilascia).toHaveBeenCalled();
  });
});
