import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { environment } from '../../../environments/environment';

/**
 * Inizializza l'app Firebase  ed espone
 * le istanze di Firestore e Auth usate in tutta l'app.
 * Analytics viene attivato solo se supportato dal browser corrente
 * (evita errori su ambienti non-HTTPS / non compatibili).
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly auth: Auth;
  analytics: Analytics | null = null;

  private useEmulators(): boolean {
    try { return localStorage.getItem('useEmulators') === '1'; } catch { return false; }
  }

  constructor() {
    this.app = initializeApp(environment.firebase);
    // Safari (in particolare con iCloud Private Relay, content blocker o certe reti
    // mobili/aziendali) puo' bloccare in modo silenzioso lo stream WebChannel di
    // Firestore usato di default: la richiesta resta sospesa a tempo indeterminato
    // senza mai risolversi ne' rigettarsi. Forziamo il long-polling (auto-rilevato)
    // per usare normali richieste HTTP invece dello streaming, compatibili ovunque.
    this.db = initializeFirestore(this.app, {
      experimentalAutoDetectLongPolling: true
    });
    this.auth = getAuth(this.app);

    // Solo in sviluppo e solo su richiesta (localStorage.useEmulators = '1'): prova l'app
    // sugli emulatori locali di firebase.json invece che su un progetto vero.
    if (!environment.production && this.useEmulators()) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }

    isSupported()
      .then(ok => {
        if (ok) this.analytics = getAnalytics(this.app);
      })
      .catch(() => { /* analytics non disponibile in questo contesto */ });
  }
}
