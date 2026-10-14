import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoginComponent, GOOGLE_FERMO_MS } from './login.component';
import { PROFILE_MISSING } from '../../core/services/auth.service';

/**
 * Il tasto "Continua con Google".
 *
 * Il popup non ha un tempo massimo, e nell'app installata su iOS puo' non
 * rispondere mai: con il tasto spento per sempre l'unica uscita era ricaricare
 * l'app. Qui si prova che dopo un po' il tasto torna premibile, e che il
 * tentativo vecchio non scrive piu' sulla schermata quando ne parte uno nuovo.
 */
function differita<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function pagina() {
  const auth = { loginWithGoogle: vi.fn() };
  const nav = { navigateRoot: vi.fn(), navigateForward: vi.fn() };
  const cdr = { detectChanges: vi.fn() };
  const c = new LoginComponent(auth as any, nav as any, cdr as any);
  return { c, auth, nav };
}

/** Lascia girare le promesse gia' risolte, senza far avanzare il tempo. */
const lasciaGirare = () => vi.advanceTimersByTimeAsync(0);

describe('LoginComponent — accesso con Google', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('con Google in attesa un secondo tocco, subito, non apre un\'altra finestra', async () => {
    const { c, auth } = pagina();
    auth.loginWithGoogle.mockReturnValue(differita().promise);

    void c.loginWithGoogle();
    void c.loginWithGoogle();

    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(c.googleLoading).toBe(true);
    expect(c.googleFermo).toBe(false);
  });

  it('dopo il tempo d\'attesa il tasto torna premibile e un tocco apre una finestra nuova', async () => {
    const { c, auth } = pagina();
    auth.loginWithGoogle.mockReturnValue(differita().promise);

    void c.loginWithGoogle();
    await vi.advanceTimersByTimeAsync(GOOGLE_FERMO_MS);

    // Ancora in attesa: la finestra vecchia potrebbe essere aperta davvero.
    expect(c.googleLoading).toBe(true);
    expect(c.googleFermo).toBe(true);

    void c.loginWithGoogle();
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(2);
    expect(c.googleFermo).toBe(false);
  });

  it('il tentativo sostituito, chiuso da Firebase, non scrive errori sulla schermata', async () => {
    const { c, auth, nav } = pagina();
    const vecchio = differita();
    const nuovo = differita();
    auth.loginWithGoogle.mockReturnValueOnce(vecchio.promise).mockReturnValueOnce(nuovo.promise);

    void c.loginWithGoogle();
    await vi.advanceTimersByTimeAsync(GOOGLE_FERMO_MS);
    void c.loginWithGoogle();

    // Firebase chiude la finestra vecchia: il suo tentativo finisce cosi'.
    vecchio.reject({ code: 'auth/cancelled-popup-request' });
    await lasciaGirare();
    expect(c.googleLoading).toBe(true);
    expect(c.googleError).toBe('');

    nuovo.resolve({});
    await lasciaGirare();
    expect(nav.navigateRoot).toHaveBeenCalledTimes(1);
    expect(nav.navigateRoot).toHaveBeenCalledWith(['/scheda']);
    expect(c.googleLoading).toBe(false);
  });

  it('il successo in ritardo del tentativo sostituito non tocca la schermata', async () => {
    const { c, auth, nav } = pagina();
    const vecchio = differita();
    const nuovo = differita();
    auth.loginWithGoogle.mockReturnValueOnce(vecchio.promise).mockReturnValueOnce(nuovo.promise);

    void c.loginWithGoogle();
    await vi.advanceTimersByTimeAsync(GOOGLE_FERMO_MS);
    void c.loginWithGoogle();

    vecchio.resolve({});
    await lasciaGirare();

    // Ora parla il tentativo nuovo: quello vecchio non porta via dalla pagina
    // e non spegne il "Un attimo..." di quello che e' ancora in corso.
    expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(c.googleLoading).toBe(true);

    nuovo.resolve({});
    await lasciaGirare();
    expect(nav.navigateRoot).toHaveBeenCalledTimes(1);
    expect(c.googleLoading).toBe(false);
  });

  it('se la finestra risponde dopo l\'attesa, senza un nuovo tocco, si entra', async () => {
    const { c, auth, nav } = pagina();
    const d = differita();
    auth.loginWithGoogle.mockReturnValue(d.promise);

    void c.loginWithGoogle();
    await vi.advanceTimersByTimeAsync(GOOGLE_FERMO_MS);
    d.resolve({});
    await lasciaGirare();

    expect(nav.navigateRoot).toHaveBeenCalledWith(['/scheda']);
    expect(c.googleLoading).toBe(false);
    expect(c.googleFermo).toBe(false);
  });

  it('un errore rimette il tasto a posto e non lascia timer accesi', async () => {
    const { c, auth, nav } = pagina();
    auth.loginWithGoogle.mockRejectedValue({ code: 'auth/popup-blocked' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await c.loginWithGoogle();

    expect(c.googleError).toContain('popup');
    expect(c.googleLoading).toBe(false);
    expect(c.googleFermo).toBe(false);
    expect(nav.navigateRoot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('un account Google nuovo va a finire l\'iscrizione', async () => {
    const { c, auth, nav } = pagina();
    auth.loginWithGoogle.mockRejectedValue({ code: PROFILE_MISSING });

    await c.loginWithGoogle();

    expect(nav.navigateForward).toHaveBeenCalledWith(['/registrati'], { queryParams: { completa: '1' } });
    expect(c.googleError).toBe('');
    expect(c.googleLoading).toBe(false);
  });
});
