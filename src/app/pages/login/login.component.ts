import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';

import { LucideAngularModule } from 'lucide-angular';
import { AuthService, PROFILE_MISSING } from '../../core/services/auth.service';
import { LogoComponent } from '../../components/logo/logo.component';
import { loginErrorMessage, googleErrorMessage, resetErrorMessage, RESET_SENT_MESSAGE } from '../../core/utils/auth-errors.util';
import { isNativeApp } from '../../core/utils/platform.util';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { NavController, IonInput, IonSegment, IonSegmentButton } from '@ionic/angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonSegment, IonSegmentButton, IonInput, ...IONIC_PAGE, CommonModule, FormsModule, ...IONIC_LINKS, LogoComponent, LucideAngularModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  email = '';
  password = '';

  /** Quale delle due tacche e' scelta. Prima erano tre link sotto al tasto,
   *  due dei quali dicevano quasi la stessa cosa: la scelta fra entrare e
   *  iscriversi ora si fa prima di scrivere qualcosa, non dopo. */
  mode: 'login' | 'register' = 'login';

  loading = false;
  errorMsg = '';

  /** Google ha il suo stato e il suo messaggio: il tasto sta sotto a tutte e due le tacche. */
  googleLoading = false;
  googleError = '';
  /** Nell'app nativa il tasto non c'e': vedi isNativeApp(). */
  readonly googleDisponibile = !isNativeApp();

  /** La password in chiaro: senza, su una tastiera del telefono si sbaglia al
   *  buio e non si capisce perche' l'accesso non va. */
  showPassword = false;

  /** Sta partendo l'email per reimpostare la password. */
  sendingReset = false;
  /** Il messaggio dopo la richiesta: non e' un errore, quindi ha un posto suo. */
  infoMsg = '';

  constructor(private auth: AuthService, private nav: NavController, private cdr: ChangeDetectorRef) {}

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Cambia tacca. Ripulisce i messaggi: un errore d'accesso lasciato li'
   * mentre si guarda come iscriversi parlerebbe di un'altra cosa.
   */
  setMode(mode: 'login' | 'register'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.errorMsg = '';
    this.infoMsg = '';
  }

  /**
   * Accede (o si iscrive) con Google.
   *
   * Niente timeout: il popup lo chiude chi sta scegliendo l'account, e un
   * limite di quindici secondi lo interromperebbe a meta'. Va chiamato
   * direttamente dal tocco: se prima c'e' un await il browser blocca il popup.
   */
  async loginWithGoogle(): Promise<void> {
    if (this.loading || this.googleLoading) return;
    this.googleLoading = true;
    this.googleError = '';
    this.errorMsg = '';
    this.infoMsg = '';
    this.cdr.detectChanges();

    try {
      await this.auth.loginWithGoogle();
      this.nav.navigateRoot(['/scheda']);
    } catch (e: any) {
      if (e?.code === PROFILE_MISSING) {
        // Account Google nuovo: manca solo il profilo, che si finisce nella
        // pagina di iscrizione (nome e informativa).
        this.nav.navigateForward(['/registrati'], { queryParams: { completa: '1' } });
        return;
      }
      console.error('Errore accesso con Google:', e);
      this.googleError = googleErrorMessage(e) ?? '';
    } finally {
      this.googleLoading = false;
      // L'app non usa zone.js: dopo il popup lo stato nuovo si disegna a mano,
      // altrimenti il tasto resta su "Un attimo…" o scatta NG0100 in sviluppo.
      this.cdr.detectChanges();
    }
  }

  async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      Object.values(form.controls).forEach(c => c.markAsTouched());
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = '';

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    );

    try {
      await Promise.race([this.auth.login(this.email, this.password), timeout]);
      this.nav.navigateRoot(['/scheda']);
    } catch (e: any) {
      console.error('Errore login:', e);
      // Un'iscrizione rimasta a meta': la sessione e' aperta e manca solo il
      // profilo. Invece di rimbalzare con un messaggio che non dice cosa fare,
      // si va a finirla.
      if (e?.code === PROFILE_MISSING) {
        this.nav.navigateForward(['/registrati'], { queryParams: { completa: '1' } });
        return;
      }
      this.errorMsg = loginErrorMessage(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Reimposta la password, dall'indirizzo gia' scritto nel campo: e' quello
   * che si sta provando, e farlo riscrivere altrove sarebbe un giro a vuoto.
   */
  async resetPassword(): Promise<void> {
    if (this.sendingReset) return;
    this.errorMsg = '';
    this.infoMsg = '';

    const email = this.email.trim();
    if (!email) {
      this.errorMsg = 'Scrivi la tua email qui sopra, poi tocca di nuovo.';
      return;
    }

    this.sendingReset = true;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    );

    try {
      await Promise.race([this.auth.sendPasswordReset(email), timeout]);
      this.infoMsg = RESET_SENT_MESSAGE;
    } catch (e: any) {
      console.error('Errore invio reset password:', e);
      this.errorMsg = resetErrorMessage(e);
    } finally {
      this.sendingReset = false;
    }
  }
}
