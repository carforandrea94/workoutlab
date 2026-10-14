import { Injectable, signal, effect } from '@angular/core';
import { AppStateService, ThemeMode } from './app-state.service';
import { AuthService } from '../core/services/auth.service';

const THEME_CACHE_KEY = 'themePreference';

@Injectable({ providedIn: 'root' })
export class ThemeService {

  /**
   * Tema chiaro/scuro: inizializzato dalla cache locale (se l'utente ha
   * gia' scelto esplicitamente in passato) o dalla preferenza di sistema,
   * poi allineato al valore salvato sull'account non appena disponibile.
   */
  mode = signal<ThemeMode>(this.initialMode());

  constructor(private appState: AppStateService, private auth: AuthService) {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.mode());
    });

    // Aspetta che l'autenticazione sia risolta prima di leggere l'account:
    // altrimenti currentUser() e' ancora null (crash) all'avvio dell'app.
    effect(() => {
      if (!this.auth.authReady() || !this.auth.currentUser()) return;
      this.appState.load().then(state => {
        if (state.themeMode && state.themeMode !== this.mode()) {
          this.mode.set(state.themeMode);
          localStorage.setItem(THEME_CACHE_KEY, state.themeMode);
        }
      }).catch(e => console.error('Lettura dello stato utente fallita:', e));
    });
  }

  private initialMode(): ThemeMode {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    if (cached === 'dark' || cached === 'light') return cached;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /**
   * Se l'utente non ha mai scelto esplicitamente un tema, non scriviamo
   * mai un valore su Firestore: l'app continua a seguire la preferenza
   * di sistema anche se cambia in futuro. Solo la prima scelta manuale
   * "fissa" la preferenza sull'account.
   */
  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(THEME_CACHE_KEY, mode);
    this.appState.patchField('themeMode', mode).catch(() => { /* gia' segnalato da AppStateService */ });
  }
}
