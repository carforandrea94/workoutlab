import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GiornoService } from './giorno.service';

/**
 * L'orologio del giorno: a mezzanotte, o al ritorno in primo piano, il giorno
 * cambia da solo e l'app si ridisegna. Senza cambio di giorno non si tocca niente.
 */
describe('GiornoService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function monta(adesso: Date) {
    vi.useFakeTimers();
    vi.setSystemTime(adesso);
    const s = TestBed.inject(GiornoService);
    const tick = vi.spyOn(TestBed.inject(ApplicationRef), 'tick');
    return { s, tick };
  }

  it('parte dal giorno di oggi, in ora locale', () => {
    const { s } = monta(new Date(2026, 9, 25, 23, 59, 30));
    expect(s.oggi()).toBe('2026-10-25');
  });

  it('a mezzanotte da domenica passa a lunedi\' da solo, e ridisegna', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 23, 59, 30));
    vi.advanceTimersByTime(29_000);
    expect(s.oggi()).toBe('2026-10-25');
    expect(tick).not.toHaveBeenCalled();
    // Mezzanotte e il secondo di margine.
    vi.advanceTimersByTime(2_000);
    expect(s.oggi()).toBe('2026-10-26');
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('e la notte dopo ancora: il timer si riprogramma', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 23, 59, 30));
    vi.advanceTimersByTime(31_000);
    vi.advanceTimersByTime(24 * 3600_000);
    expect(s.oggi()).toBe('2026-10-27');
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('al ritorno in primo piano guarda il giorno: l\'iPhone ferma i timer delle PWA in sottofondo', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 22, 0));
    // L'app dorme: l'orologio va avanti, i timer no.
    vi.setSystemTime(new Date(2026, 9, 26, 7, 15));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.oggi()).toBe('2026-10-26');
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('anche col focus della finestra e col ritorno dalla cache del browser', () => {
    const { s } = monta(new Date(2026, 9, 25, 22, 0));
    vi.setSystemTime(new Date(2026, 9, 26, 7, 0));
    window.dispatchEvent(new Event('focus'));
    expect(s.oggi()).toBe('2026-10-26');
    vi.setSystemTime(new Date(2026, 9, 27, 7, 0));
    window.dispatchEvent(new Event('pageshow'));
    expect(s.oggi()).toBe('2026-10-27');
  });

  it('una pagina nascosta non conta: si guarda quando torna visibile', () => {
    const { s } = monta(new Date(2026, 9, 25, 22, 0));
    vi.setSystemTime(new Date(2026, 9, 26, 7, 0));
    const stato = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.oggi()).toBe('2026-10-25');
    stato.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.oggi()).toBe('2026-10-26');
  });

  it('stesso giorno: nessun ridisegno, ne\' a ogni ritorno ne\' a ogni focus', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 9, 0));
    vi.setSystemTime(new Date(2026, 9, 25, 18, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    s.controlla();
    expect(s.oggi()).toBe('2026-10-25');
    expect(tick).not.toHaveBeenCalled();
  });

  it('dopo un risveglio il timer punta alla mezzanotte nuova, non a quella passata', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 22, 0));
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 0));
    window.dispatchEvent(new Event('focus'));
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    expect(s.oggi()).toBe('2026-10-27');
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('distrutto, smette di ascoltare e di contare', () => {
    const { s, tick } = monta(new Date(2026, 9, 25, 23, 59, 30));
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(60_000);
    vi.setSystemTime(new Date(2026, 9, 27, 9, 0));
    window.dispatchEvent(new Event('focus'));
    expect(s.oggi()).toBe('2026-10-25');
    expect(tick).not.toHaveBeenCalled();
  });
});
