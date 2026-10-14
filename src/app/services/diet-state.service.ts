import { Injectable, signal, effect } from '@angular/core';
import { AppStateService } from './app-state.service';
import { AuthService } from '../core/services/auth.service';

export type DietViewMode = 'list' | 'slider';

const VIEW_MODE_CACHE_KEY = 'dietaViewMode';

/**
 * Stato UI della schermata dieta (per ora solo la preferenza vista
 * lista/slider). Mirror di WorkoutStateService.viewMode, ma tenuto
 * separato: la preferenza vista della dieta e' indipendente da quella
 * della scheda.
 */
@Injectable({ providedIn: 'root' })
export class DietStateService {

  /**
   * Vista lista/slider del piano dieta: inizializzata dalla cache locale
   * per evitare un flash alla vista di default prima che l'account
   * (Firestore) risponda, poi allineata al valore salvato sull'account.
   */
  viewMode = signal<DietViewMode>(
    localStorage.getItem(VIEW_MODE_CACHE_KEY) === 'slider' ? 'slider' : 'list'
  );

  constructor(private appState: AppStateService, private auth: AuthService) {
    effect(() => {
      if (!this.auth.authReady() || !this.auth.currentUser()) return;
      this.appState.load().then(state => {
        if (state.dietViewMode && state.dietViewMode !== this.viewMode()) {
          this.viewMode.set(state.dietViewMode);
          localStorage.setItem(VIEW_MODE_CACHE_KEY, state.dietViewMode);
        }
      }).catch(e => console.error('Lettura dello stato utente fallita:', e));
    });
  }

  setViewMode(mode: DietViewMode): void {
    if (this.viewMode() === mode) return;
    this.viewMode.set(mode);
    localStorage.setItem(VIEW_MODE_CACHE_KEY, mode);
    this.appState.patchField('dietViewMode', mode).catch(() => { /* gia' segnalato da AppStateService */ });
  }
}
