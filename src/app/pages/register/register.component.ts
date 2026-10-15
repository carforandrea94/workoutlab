import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { NavController, IonInput, IonCheckbox, IonButton } from '@ionic/angular';
import { RequiredTrueDirective } from '../../core/directives/required-true.directive';
import { NomeCampoDirective } from '../../core/nome-campo.directive';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [NomeCampoDirective, IonButton, IonInput, IonCheckbox, RequiredTrueDirective, ...IONIC_PAGE, CommonModule, FormsModule, ...IONIC_LINKS, LucideAngularModule],
  templateUrl: './register.component.html'
})
export class RegisterComponent {
  displayName = '';
  email = '';
  password = '';

  /** L'informativa accettata. Parte spenta: un consenso prespuntato non e' un
   *  consenso, e le regole rifiutano un profilo senza. */
  privacyOk = false;

  loading = false;
  errorMsg = '';

  /** La password sul telefono si sbaglia al buio, e qui la si sta scegliendo. */
  showPassword = false;

  /**
   * Si sta finendo un'iscrizione rimasta a meta', non iniziandone una nuova:
   * l'utente su Auth c'e' gia', manca il profilo. Email e password sono gia'
   * state scelte, quindi qui si chiede solo quello che manca.
   */
  completa = false;
  /** L'indirizzo della sessione da completare, per dire di chi si tratta. */
  emailInSospeso: string | null = null;
  /** La sessione da completare e' di un account Google: nome e informativa, nessuna password. */
  completaGoogle = false;

  constructor(
    private auth: AuthService,
    private nav: NavController,
    route: ActivatedRoute
  ) {
    if (route.snapshot.queryParamMap.get('completa') === '1') {
      // Ci si arriva solo dall'accesso, con una sessione aperta senza profilo.
      // Scritto a mano nella barra degli indirizzi non vuol dire niente.
      if (this.auth.hasPendingProfile()) {
        this.completa = true;
        this.emailInSospeso = this.auth.pendingEmail();
        this.completaGoogle = this.auth.pendingIsGoogle();
        // Google il nome lo sa gia': si propone, e si puo' cambiare.
        this.displayName = this.auth.pendingDisplayName() ?? '';
      } else {
        this.nav.navigateRoot(['/login']);
      }
    }
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  /** Lascia perdere l'iscrizione a meta' e chiude la sessione. */
  async annulla(): Promise<void> {
    await this.auth.logout();
    this.nav.navigateRoot(['/login']);
  }

  async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      Object.values(form.controls).forEach(c => c.markAsTouched());
      return;
    }
    this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    );

    try {
      await Promise.race([
        this.completa
          ? this.auth.completeProfile(this.displayName)
          : this.auth.register(this.displayName, this.email, this.password),
        timeout
      ]);
      this.nav.navigateRoot(['/scheda']);
    } catch (e: any) {
      console.error('Errore registrazione:', e);
      if (e?.message === 'TIMEOUT') {
        this.errorMsg = 'La richiesta sta impiegando troppo tempo. Riprova.';
      } else if (e?.code === 'auth/email-already-in-use') {
        this.errorMsg = 'Questa email e\' gia\' registrata.';
      } else if (e?.code === 'auth/invalid-email') {
        this.errorMsg = 'Email non valida.';
      } else {
        this.errorMsg = e?.message || 'Errore durante la registrazione. Riprova.';
      }
    } finally {
      this.loading = false;
    }
  }
}
