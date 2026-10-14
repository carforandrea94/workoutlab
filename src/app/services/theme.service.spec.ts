import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

function stubMatchMedia(matchesLight: boolean): void {
  (window as any).matchMedia = (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' ? matchesLight : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('usa il valore in cache se presente, ignorando la preferenza di sistema', () => {
    localStorage.setItem('themePreference', 'light');
    stubMatchMedia(false);
    const appStateStub = {} as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    expect(service.mode()).toBe('light');
  });

  it('senza cache segue la preferenza di sistema (chiaro)', () => {
    stubMatchMedia(true);
    const appStateStub = {} as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    expect(service.mode()).toBe('light');
  });

  it('senza cache segue la preferenza di sistema (scuro)', () => {
    stubMatchMedia(false);
    const appStateStub = {} as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    expect(service.mode()).toBe('dark');
  });

  it('setMode aggiorna signal, localStorage e chiama patchField', () => {
    stubMatchMedia(false);
    const calls: [string, unknown][] = [];
    const appStateStub = {
      patchField: (path: string, value: unknown) => { calls.push([path, value]); return Promise.resolve(); }
    } as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));

    service.setMode('light');

    expect(service.mode()).toBe('light');
    expect(localStorage.getItem('themePreference')).toBe('light');
    expect(calls).toEqual([['themeMode', 'light']]);
  });

  it("setMode persiste sempre la scelta esplicita, anche se coincide col tema gia' attivo (es. conferma del default OS)", () => {
    stubMatchMedia(false);
    const calls: [string, unknown][] = [];
    const appStateStub = {
      patchField: (path: string, value: unknown) => { calls.push([path, value]); return Promise.resolve(); }
    } as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));

    service.setMode('dark');

    expect(localStorage.getItem('themePreference')).toBe('dark');
    expect(calls).toEqual([['themeMode', 'dark']]);
  });

  it('applica data-theme sul document al costrutto e a ogni cambio', () => {
    stubMatchMedia(false);
    const appStateStub = { patchField: () => Promise.resolve() } as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    TestBed.flushEffects();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.setMode('light');
    TestBed.flushEffects();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sincronizza da Firestore quando il tema salvato differisce da quello attivo', async () => {
    stubMatchMedia(false);
    let loadPromise!: Promise<any>;
    const appStateStub = {
      load: () => (loadPromise = Promise.resolve({ themeMode: 'light' } as any))
    } as any;
    const authStub = { authReady: () => true, currentUser: () => ({ uid: 'u1' }) } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    TestBed.flushEffects();

    await loadPromise;

    expect(service.mode()).toBe('light');
    expect(localStorage.getItem('themePreference')).toBe('light');
  });

  it("non tocca il tema se Firestore non ha un valore salvato (l'utente non ha mai scelto)", async () => {
    stubMatchMedia(false);
    let loadPromise!: Promise<any>;
    const appStateStub = {
      load: () => (loadPromise = Promise.resolve({ themeMode: null } as any))
    } as any;
    const authStub = { authReady: () => true, currentUser: () => ({ uid: 'u1' }) } as any;
    const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
    TestBed.flushEffects();

    await loadPromise;

    expect(service.mode()).toBe('dark');
  });
});
