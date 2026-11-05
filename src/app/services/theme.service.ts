import { Injectable, signal, computed, effect } from '@angular/core';
import { AppStateService, ThemeMode, ThemePreference } from './app-state.service';
import { AuthService } from '../core/services/auth.service';

const THEME_CACHE_KEY = 'themePreference';
const SCELTE: readonly ThemePreference[] = ['auto', 'dark', 'light'];
/** Il colore della barra di sistema del browser, uguale a quello che index.html mette all'avvio. */
const COLORE_BARRA: Record<ThemeMode, string> = { dark: '#0D0E10', light: '#F5F4F2' };

@Injectable({ providedIn: 'root' })
export class ThemeService {

  /**
   * Cosa ha scelto l'utente: Notte, Giorno o Automatico. Inizializzata dalla cache
   * locale e allineata al valore salvato sull'account non appena disponibile; chi non
   * ha mai scelto e' su Automatico.
   */
  readonly preference = signal<ThemePreference>(this.initialPreference());

  /** Il tema del telefono, che segue anche quando cambia (di sera, o dalle impostazioni di iOS). */
  private readonly sistemaChiaro = signal(this.leggiSistema());

  /** Il tema che si vede: quello scelto, o quello del telefono se si e' su Automatico. */
  readonly mode = computed<ThemeMode>(() => {
    const scelta = this.preference();
    return scelta === 'auto' ? (this.sistemaChiaro() ? 'light' : 'dark') : scelta;
  });

  constructor(private appState: AppStateService, private auth: AuthService) {
    effect(() => {
      const mode = this.mode();
      document.documentElement.setAttribute('data-theme', mode);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORE_BARRA[mode]);
    });

    // Su Automatico il tema segue il telefono: quando cambia, cambia anche qui.
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', e => this.sistemaChiaro.set(e.matches));
    } catch { /* niente matchMedia (ambienti senza schermo): resta quello letto all'avvio */ }

    // Aspetta che l'autenticazione sia risolta prima di leggere l'account:
    // altrimenti currentUser() e' ancora null (crash) all'avvio dell'app.
    effect(() => {
      if (!this.auth.authReady() || !this.auth.currentUser()) return;
      this.appState.load().then(state => {
        if (state.themeMode && SCELTE.includes(state.themeMode) && state.themeMode !== this.preference()) {
          this.preference.set(state.themeMode);
          localStorage.setItem(THEME_CACHE_KEY, state.themeMode);
        }
      }).catch(e => console.error('Lettura dello stato utente fallita:', e));
    });
  }

  private initialPreference(): ThemePreference {
    const cached = localStorage.getItem(THEME_CACHE_KEY) as ThemePreference | null;
    return cached && SCELTE.includes(cached) ? cached : 'auto';
  }

  private leggiSistema(): boolean {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
  }

  /**
   * Se l'utente non ha mai scelto, non scriviamo mai un valore su Firestore: l'app e'
   * su Automatico e segue il telefono. Ogni scelta esplicita (anche "Automatico", che e'
   * il modo di tornare indietro) si salva sul dispositivo e sull'account.
   */
  setMode(scelta: ThemePreference): void {
    this.preference.set(scelta);
    localStorage.setItem(THEME_CACHE_KEY, scelta);
    this.appState.patchField('themeMode', scelta).catch(() => { /* gia' segnalato da AppStateService */ });
  }
}
