import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { ToastComponent } from './components/toast/toast.component';
import { ThemeService } from './services/theme.service';
import { chiudiIntroAllaPrimaPagina } from './core/intro';

/**
 * La radice dell'app. Non sa piu' niente di titoli, frecce e pulsanti: nella
 * versione Ionic ogni pagina ha il suo ion-header, e la barra in basso e' di
 * TabsPage. Qui restano solo le cose davvero globali: l'outlet di Ionic, i
 * il toast, l'aggiornamento della PWA e l'uscita dell'intro dell'avvio
 * (core/intro.ts), che index.html disegna prima di Angular.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastComponent],
  template: `
    <!-- Vedi .statusbar-strip in styles.css: sta fuori da ion-app apposta. -->
    <div class="statusbar-strip" aria-hidden="true"></div>
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
    <app-toast></app-toast>
  `
})
export class App implements OnInit {
  // ThemeService si inietta qui anche se non si usa: e' il costruttore ad
  // applicare il tema salvato, e deve succedere prima della prima pagina.
  constructor(private swUpdate: SwUpdate, private theme: ThemeService, router: Router) {
    chiudiIntroAllaPrimaPagina(router);
  }

  ngOnInit(): void {
    this.setupAutoUpdate();
  }

  /**
   * Se il service worker rileva una nuova versione deployata, la attiva e
   * ricarica la pagina in automatico: evita che l'utente resti bloccato su
   * codice vecchio in cache aspettando il normale ciclo "serve due refresh".
   * Nelle app native (Capacitor) il service worker e' spento e qui non
   * succede niente: li' gli aggiornamenti passano dagli store.
   */
  private setupAutoUpdate(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is any => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.swUpdate.activateUpdate().then(() => window.location.reload());
      });

    this.swUpdate.checkForUpdate().catch(() => { /* offline o check fallito, ignora */ });

    // Rete di sicurezza: se per qualsiasi motivo risultano registrazioni SW
    // multiple/orfane per questa origine, le ripulisce cosi' non restano
    // versioni vecchie in esecuzione in parallelo a quella corrente.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        if (regs.length > 1) {
          console.warn(`Trovate ${regs.length} registrazioni service worker, ripulisco le obsolete.`);
          regs.slice(1).forEach(r => r.unregister());
        }
      });
    }
  }
}
