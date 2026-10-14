import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot, CanActivateFn } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { ProtocolBootstrapService } from '../../services/protocol-bootstrap.service';
import { protocolGuard } from './protocol.guard';
import { profileGuard, onboardingGuard } from './profile.guard';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';

/**
 * Le guardie sono funzioni async: dopo il primo await non sono piu' nel
 * contesto di iniezione, e una inject() messa li' dentro lancia NG0203 (in
 * produzione la navigazione fallisce e l'app resta vuota). Qui ogni guardia
 * gira davvero dentro runInInjectionContext, con l'autenticazione che si
 * risolve DOPO, cosi' un'inject() tardiva fa fallire il test.
 */
describe('guardie', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  let sbloccaAuth!: () => void;
  let utente: any;
  let caricamenti: number;
  let paginaProfilo: boolean;

  const lancia = (guardia: CanActivateFn) =>
    TestBed.runInInjectionContext(() => guardia(route, state)) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    utente = null;
    caricamenti = 0;
    paginaProfilo = false;
    const ready = new Promise<void>(res => { sbloccaAuth = res; });

    const auth = {
      ready,
      currentUser: () => utente,
      profiloIncompleto: () => !!utente && utente.incompleto === true,
      onboardingRimandato: false
    };
    const bootstrap = { ensureLoaded: vi.fn(async () => { caricamenti++; }) };
    const router = { parseUrl: (url: string) => ({ url } as unknown as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ProtocolBootstrapService, useValue: bootstrap },
        { provide: Router, useValue: router }
      ]
    });
  });

  it('protocolGuard: aspetta l\'autenticazione e poi carica il protocollo, senza NG0203', async () => {
    const esito = lancia(protocolGuard);
    // L'autenticazione si risolve dopo che la guardia e' partita: e' proprio il caso che rompeva.
    await Promise.resolve();
    expect(caricamenti).toBe(0);
    sbloccaAuth();

    expect(await esito).toBe(true);
    expect(caricamenti).toBe(1);
  });

  it('authGuard: senza utente manda al login, con utente lascia passare', async () => {
    sbloccaAuth();
    expect(await lancia(authGuard)).toMatchObject({ url: '/login' });
    utente = { uid: 'u1' };
    expect(await lancia(authGuard)).toBe(true);
  });

  it('guestGuard: chi e\' gia\' dentro va nell\'app', async () => {
    sbloccaAuth();
    expect(await lancia(guestGuard)).toBe(true);
    utente = { uid: 'u1' };
    expect(await lancia(guestGuard)).toMatchObject({ url: '/scheda' });
  });

  it('profileGuard: profilo incompleto manda a /benvenuto, completo lascia passare', async () => {
    const esito = lancia(profileGuard);
    utente = { uid: 'u1', incompleto: true };
    sbloccaAuth();
    expect(await esito).toMatchObject({ url: '/benvenuto' });

    utente = { uid: 'u1', incompleto: false };
    expect(await lancia(profileGuard)).toBe(true);
  });

  it('profileGuard: "Più tardi" lascia entrare per la sessione', async () => {
    sbloccaAuth();
    utente = { uid: 'u1', incompleto: true };
    const auth = TestBed.inject(AuthService) as any;
    auth.onboardingRimandato = true;
    expect(await lancia(profileGuard)).toBe(true);
  });

  it('onboardingGuard: la schermata dei dati mancanti c\'e\' solo finche\' mancano', async () => {
    sbloccaAuth();
    utente = { uid: 'u1', incompleto: true };
    expect(await lancia(onboardingGuard)).toBe(true);
    utente = { uid: 'u1', incompleto: false };
    expect(await lancia(onboardingGuard)).toMatchObject({ url: '/scheda' });
  });
});
