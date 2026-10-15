import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController, IonInput, IonContent, IonSegment, IonSegmentButton, IonButton } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { Sex } from '../../core/models/user.model';
import { dividiNome, componiNome } from '../../core/utils/nome.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { HEIGHT_MIN_CM, HEIGHT_MAX_CM } from '../../core/utils/height.util';
import { validaProfilo, ErroriProfilo, NASCITA_MIN } from '../../core/utils/profile-completeness.util';
import { NomeCampoDirective } from '../../core/nome-campo.directive';

/**
 * La schermata dei dati dell'account che mancano.
 *
 * Ci si arriva dopo l'accesso (la guardia dell'app) quando manca almeno uno fra
 * nome, cognome, data di nascita, sesso e altezza. Quello che c'e' gia' arriva
 * precompilato: da Google, per dire, il nome e' gia' noto. L'iscrizione chiede
 * solo il nome e l'informativa per non allungare il primo passo; questi dati
 * servono alle formule di composizione corporea (eta', sesso, altezza) e si
 * dichiarano una volta.
 *
 * "Più tardi" lascia entrare per questa sessione: se i dati mancano ancora, la
 * schermata ricompare al prossimo accesso.
 */
@Component({
  selector: 'app-benvenuto',
  standalone: true,
  imports: [NomeCampoDirective, IonButton, IonContent, IonInput, IonSegment, IonSegmentButton, CommonModule, FormsModule],
  templateUrl: './benvenuto.component.html'
})
export class BenvenutoComponent {
  nome: string;
  cognome: string;
  birthDate: string;
  sex: Sex | null;
  /** Il campo e' un numero, ma finche' si scrive puo' essere vuoto: da qui number | null. */
  heightCm: number | null;

  readonly oggi = todayLocalISO();
  readonly nascitaMin = NASCITA_MIN;
  readonly altezzaMin = HEIGHT_MIN_CM;
  readonly altezzaMax = HEIGHT_MAX_CM;

  /** Gli errori compaiono solo dopo il primo tentativo di salvare: non prima che si sia scritto qualcosa. */
  tentato = false;
  errori: ErroriProfilo = {};
  saving = false;
  errorMsg = '';

  constructor(private auth: AuthService, private nav: NavController) {
    const utente = auth.currentUser();
    const { nome, cognome } = dividiNome(utente ?? {});
    this.nome = nome;
    this.cognome = cognome;
    this.birthDate = utente?.birthDate ?? '';
    this.sex = utente?.sex ?? null;
    this.heightCm = utente?.heightCm ?? null;
  }

  setSex(sex: Sex): void {
    this.sex = sex;
    this.rivaluta();
  }

  /** Dopo il primo tentativo gli errori si aggiornano mentre si corregge. */
  rivaluta(): void {
    if (this.tentato) this.errori = this.valida();
  }

  private valida(): ErroriProfilo {
    return validaProfilo({
      nome: this.nome, cognome: this.cognome, birthDate: this.birthDate,
      sex: this.sex, heightCm: this.heightCm
    }, this.oggi);
  }

  async salva(): Promise<void> {
    if (this.saving) return;
    this.tentato = true;
    this.errori = this.valida();
    this.errorMsg = '';
    if (Object.keys(this.errori).length > 0) return;

    this.saving = true;
    const nome = this.nome.trim();
    const cognome = this.cognome.trim();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));

    try {
      // Una scrittura sola: nome, cognome e nome intero insieme (il nome intero
      // e' quello che l'app mostra ovunque), piu' nascita, sesso e altezza.
      await Promise.race([
        this.auth.patchBody({
          firstName: nome,
          lastName: cognome,
          displayName: componiNome(nome, cognome),
          birthDate: this.birthDate,
          sex: this.sex,
          heightCm: Math.round(Number(this.heightCm))
        }),
        timeout
      ]);
      this.nav.navigateRoot(['/scheda']);
    } catch (e: any) {
      console.error('Errore salvataggio dati account:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La richiesta sta impiegando troppo tempo. Riprova.'
        : 'Non sono riuscito a salvare. Controlla la connessione e riprova.';
    } finally {
      this.saving = false;
    }
  }

  /** Entra senza compilare: la schermata ricompare al prossimo accesso, se i dati mancano ancora. */
  piuTardi(): void {
    this.auth.onboardingRimandato = true;
    this.nav.navigateRoot(['/scheda']);
  }
}
