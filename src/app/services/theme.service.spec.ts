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

/** Un telefono che puo' cambiare tema: dice "chiaro" e avvisa gli ascoltatori. */
function telefonoCheCambia(chiaroAllInizio: boolean) {
  const ascoltatori: ((e: { matches: boolean }) => void)[] = [];
  (window as any).matchMedia = (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' ? chiaroAllInizio : false,
    media: query,
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => { ascoltatori.push(f); },
    removeEventListener: () => {}
  });
  return { cambia: (chiaro: boolean) => ascoltatori.forEach(f => f({ matches: chiaro })) };
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

  describe('Automatico', () => {
    const nuovo = (stato: any = { themeMode: null }, utente = true) => {
      const calls: [string, unknown][] = [];
      const appStateStub = {
        load: () => Promise.resolve(stato),
        patchField: (path: string, value: unknown) => { calls.push([path, value]); return Promise.resolve(); }
      } as any;
      const authStub = { authReady: () => utente, currentUser: () => (utente ? { uid: 'u1' } : null) } as any;
      const service = TestBed.runInInjectionContext(() => new ThemeService(appStateStub, authStub));
      TestBed.flushEffects();
      return { service, calls };
    };

    it('chi non ha mai scelto e\' su Automatico, e segue il telefono', () => {
      stubMatchMedia(true);
      const { service } = nuovo();
      expect(service.preference()).toBe('auto');
      expect(service.mode()).toBe('light');
    });

    it('su Automatico, quando il telefono cambia tema cambia anche l\'app (e la barra del browser)', () => {
      document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#000000">');
      const telefono = telefonoCheCambia(false);
      const { service } = nuovo();
      expect(service.mode()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      telefono.cambia(true);
      TestBed.flushEffects();

      expect(service.mode()).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#F5F4F2');
      document.querySelector('meta[name="theme-color"]')!.remove();
    });

    it('con un tema fisso il telefono non conta, nemmeno quando cambia', () => {
      const telefono = telefonoCheCambia(false);
      localStorage.setItem('themePreference', 'dark');
      const { service } = nuovo();
      telefono.cambia(true);
      TestBed.flushEffects();
      expect(service.preference()).toBe('dark');
      expect(service.mode()).toBe('dark');
    });

    it('tornare su Automatico si salva, sul dispositivo e sull\'account', () => {
      stubMatchMedia(true);
      localStorage.setItem('themePreference', 'dark');
      const { service, calls } = nuovo();
      expect(service.mode()).toBe('dark');

      service.setMode('auto');

      expect(service.preference()).toBe('auto');
      expect(service.mode()).toBe('light');
      expect(localStorage.getItem('themePreference')).toBe('auto');
      expect(calls).toEqual([['themeMode', 'auto']]);
    });

    it('"auto" salvato sull\'account arriva anche sugli altri dispositivi', async () => {
      stubMatchMedia(true);
      localStorage.setItem('themePreference', 'dark');
      const { service } = nuovo({ themeMode: 'auto' });
      await Promise.resolve();
      await Promise.resolve();
      expect(service.preference()).toBe('auto');
      expect(localStorage.getItem('themePreference')).toBe('auto');
    });

    it('un valore sconosciuto, in cache o sull\'account, non rompe il tema: si resta dove si era', async () => {
      stubMatchMedia(false);
      localStorage.setItem('themePreference', 'viola');
      const { service } = nuovo({ themeMode: 'arcobaleno' });
      await Promise.resolve();
      await Promise.resolve();
      expect(service.preference()).toBe('auto');
      expect(service.mode()).toBe('dark');
      expect(localStorage.getItem('themePreference')).toBe('viola');
    });
  });
});
