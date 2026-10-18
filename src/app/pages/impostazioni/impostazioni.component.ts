import {
  Component, OnInit, ChangeDetectorRef,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Sex } from '../../core/models/user.model';
import { ThemeService } from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { AppStateService } from '../../services/app-state.service';
import { SegnaleService } from '../../services/segnale.service';
import { isIosSafariNotStandalone } from '../../core/utils/platform.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { deleteAccountErrorMessage } from '../../core/utils/auth-errors.util';
import { dividiNome, componiNome } from '../../core/utils/nome.util';
import {
  heightOptions, toWheelValue, formatHeightCm
} from '../../core/utils/height.util';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonModal, IonInput, IonSegment, IonSegmentButton, IonToggle, IonPicker, IonPickerColumn, IonPickerColumnOption, IonButton } from '@ionic/angular';
import { NomeCampoDirective } from '../../core/nome-campo.directive';
import { IconaComponent } from '../../components/icona/icona.component';

@Component({
  selector: 'app-impostazioni',
  standalone: true,
  imports: [NomeCampoDirective, IonButton, IonSegment, IonSegmentButton, IonToggle, IonPicker, IonPickerColumn, IonPickerColumnOption, IonInput, ...IONIC_PAGE, IonModal, CommonModule, FormsModule, IconaComponent],
  templateUrl: './impostazioni.component.html',
  styles: [`
    .account-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0; border-bottom: 1px solid var(--separator);
    }
    .account-row:last-child { border-bottom: none; }
    /* Il suggerimento in fondo alla card non e' una riga: senza questo
       involucro sarebbe lui l'ultimo figlio, e l'ultima riga vera terrebbe
       un separatore appeso al nulla. */
    .rows { display: flex; flex-direction: column; }
    .account-row-label {
      font-family: 'Inter', sans-serif; font-size: 13.5px; color: var(--label-2);
    }
    /* L'interruttore di Ionic, con l'etichetta come quelle delle altre righe.
       Il fondo da spento e' esplicito: Ionic lo ricava dal nero del testo, che
       sul tema scuro non si vedrebbe. */
    .settingtoggle {
      width: 100%;
      --track-background: var(--surface-raise-2);
      --handle-background: #fff;
    }
    .settingtoggle::part(label) {
      font-family: 'Inter', sans-serif; font-size: 13.5px; color: var(--label-2);
    }
    .account-row-value {
      font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--label);
      text-align: right; word-break: break-all; margin-left: 12px;
    }
    /* Un'altezza mai messa non e' un valore: si spegne, come il resto dei
       segnaposto dell'app, invece di sembrare un dato. */
    .account-row-value.unset { color: var(--label-3); font-weight: 500; }
    .heightrow {
      width: 100%; min-height: 44px; padding: 10px 0; text-align: left;
      background: none; border: none; border-bottom: none;
      color: inherit; font: inherit; cursor: pointer;
    }
    .heightrow-right {
      display: flex; align-items: center; gap: 8px; color: var(--label-3);
    }
    /* Il campo data si veste da valore: e' una riga come le altre, non un
       modulo. Il selettore lo apre il sistema. */
    .daterow {
      background: none; border: none; outline: none; padding: 0; margin-left: 12px;
      font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--label);
      text-align: right; cursor: pointer; min-height: 44px;
    }
    .daterow.unset { color: var(--label-3); }
    /* Il campo di testo si veste da valore come il campo data: e' una riga
       dell'elenco, non un modulo. Allineato a destra perche' e' li' che
       stanno tutti gli altri valori della colonna. */
    ion-input.textrow {
      flex: 1; min-width: 0; margin-left: 12px; min-height: 44px;
      --background: transparent; --color: var(--label); --placeholder-color: var(--label-3);
      --placeholder-opacity: 1; --padding-start: 0; --padding-end: 0; --padding-top: 0; --padding-bottom: 0;
      font-family: 'IBM Plex Mono', monospace; font-size: 13px; text-align: right;
    }
    .daterow:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-xs); }
    .daterow::-webkit-calendar-picker-indicator { opacity: .5; cursor: pointer; }
    /* Lo stesso stepper del recupero, in piccolo: due tasti e il valore in
       mezzo. Niente ruota - qui si cambia di rado e di poco. */
    .percentstep { display: flex; align-items: center; gap: 8px; }
    .percentval {
      font-family: 'IBM Plex Mono', monospace; font-size: var(--text-md);
      font-weight: 700; color: var(--label); font-variant-numeric: tabular-nums;
      min-width: 56px; text-align: center;
    }
    .percentstep ion-button.rest-stepbtn { min-width: 52px; font-size: var(--text-xs); }
    .settings-hint {
      font-size: var(--text-xs); line-height: 1.5; color: var(--label-3);
      margin: 10px 0 0;
    }
    /* Chiudere l'account non e' un'impostazione fra le altre: sta in fondo,
       da sola, e non porta il colore dell'accento - che nell'app vuol dire
       "fai questo". */
    ion-button.dangerbtn {
      --background: var(--state-danger-soft); --border-color: var(--state-danger-soft-border);
      --color: var(--state-danger-text); --border-radius: var(--r-md); --box-shadow: none;
      --padding-start: 16px; --padding-end: 16px; --padding-top: 0; --padding-bottom: 0;
      width: 100%; min-height: 48px; font-weight: 600; font-size: var(--text-md);
    }
    /* Dentro la riga di due, il tasto sta al passo con "Annulla": il 100% di
       larghezza se lo prenderebbe tutto, e i due tasti di una scelta devono
       pesare uguale. */
    .confirmbtns ion-button.dangerbtn { flex: 1; width: auto; }
    .sheet-err {
      font-size: var(--text-sm); line-height: 1.45; color: var(--state-danger-text);
      background: rgba(var(--state-danger-rgb), .10);
      border: 1px solid rgba(var(--state-danger-rgb), .25);
      border-radius: var(--r-sm); padding: 10px 12px; margin: 0 0 12px;
    }
    .sheet-text {
      font-size: var(--text-sm); line-height: 1.5; color: var(--label-2);
      margin: 0 0 14px;
    }
    .sheet-text b { color: var(--label); }
  `]
})
export class ImpostazioniComponent implements OnInit {
  readonly options = heightOptions();
  /** Il valore fermo al centro della ruota. E' un signal perche' lo muove
   *  l'evento di scorrimento, e l'app e' zoneless: senza, la tacca accesa
   *  resterebbe quella di partenza mentre la ruota gira. */
  readonly pick = signal(toWheelValue(null));
  heightModalOpen = false;
  saving = false;

  /** Il foglio per chiudere l'account, con la password da riscrivere. */
  deleteSheetOpen = false;
  deletePassword = '';
  deleting = false;
  deleteError = '';


  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private sessionState: WorkoutSessionStateService,
    private appState: AppStateService,
    public segnale: SegnaleService
  ) {}

  ngOnInit(): void {
    this.caricaPercentuale();
  }

  // ---- La percentuale del massimale ----
  //
  // Vale per tutto il programma: si sceglie una volta e ogni esercizio, sotto
  // al menu dei carichi, dice quanto pesa quella percentuale del SUO massimale
  // stimato. Il campo del peso non lo tocca - li' resta il suggerimento
  // dell'ultima volta, che e' l'unico numero che hai davvero sollevato.

  /** Quanto si muove a ogni tocco: mezzo disco da 2,5 kg su un massimale da
   *  cento, cioe' il piu' piccolo scalino che in palestra si vede davvero. */
  private readonly PASSO_PERCENTUALE = 2.5;
  private readonly MIN_PERCENTUALE = 40;
  private readonly MAX_PERCENTUALE = 100;
  /** Acceso per la prima volta, parte dal 75%: e' la riga delle dieci
   *  ripetizioni, cioe' quella che non contraddice un protocollo da 4x10. */
  private readonly PERCENTUALE_DI_PARTENZA = 75;

  percentuale: number | null = null;

  get percentualeAttiva(): boolean {
    return this.percentuale !== null;
  }

  get percentualeLabel(): string {
    return this.percentuale === null ? '—' : `${this.percentuale.toLocaleString('it-IT')}%`;
  }

  private async caricaPercentuale(): Promise<void> {
    try {
      const stato = await this.appState.load();
      this.percentuale = stato.loadPercent;
      this.cdr.detectChanges();
    } catch {
      // Gia' segnalato da AppStateService: qui la riga resta spenta.
    }
  }

  /** L'interruttore dice solo acceso o spento: l'ultimo valore scelto non si ricorda, si riparte dal solito. */
  impostaPercentuale(attiva: boolean): void {
    if (attiva) this.accendiPercentuale();
    else this.spegniPercentuale();
  }

  accendiPercentuale(): void {
    if (this.percentualeAttiva) return;
    this.salvaPercentuale(this.PERCENTUALE_DI_PARTENZA);
  }

  spegniPercentuale(): void {
    if (!this.percentualeAttiva) return;
    this.salvaPercentuale(null);
  }

  cambiaPercentuale(delta: number): void {
    if (this.percentuale === null) return;
    const n = Math.min(this.MAX_PERCENTUALE, Math.max(this.MIN_PERCENTUALE, this.percentuale + delta));
    if (n === this.percentuale) return;
    this.salvaPercentuale(n);
  }

  get passoPercentuale(): number {
    return this.PASSO_PERCENTUALE;
  }

  private salvaPercentuale(n: number | null): void {
    this.percentuale = n;
    this.appState.patchField('loadPercent', n).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  /**
   * Esce e ricarica la pagina invece di navigare: tutti i servizi singoli
   * (AppStateService, ProtocolBootstrapService, WorkoutDataService,
   * DietDataService...) ripartono cosi' da zero, e i dati dell'account
   * precedente non restano in memoria per il prossimo che accede da questo
   * telefono. La cache locale della sessione va svuotata a mano perche' i
   * dayId sono posizionali (day1, day2...) e non dicono di chi sono.
   */
  async logout(): Promise<void> {
    await this.auth.logout();
    this.sessionState.clearLocalCache();
    window.location.href = '/login';
  }

  openDeleteSheet(): void {
    this.deletePassword = '';
    this.deleteError = '';
    this.deleteSheetOpen = true;
    this.cdr.detectChanges();
  }

  closeDeleteSheet(): void {
    if (this.deleting) return;
    this.deleteSheetOpen = false;
    this.cdr.detectChanges();
  }

  /** Chi e' entrato solo con Google non ha una password da scrivere: conferma rifacendo l'accesso con Google. */
  get usaPassword(): boolean {
    return this.auth.usesPassword();
  }

  async confirmDelete(): Promise<void> {
    if (this.deleting || (this.usaPassword && !this.deletePassword)) return;
    this.deleting = true;
    this.deleteError = '';
    this.cdr.detectChanges();

    try {
      await this.auth.deleteAccount(this.usaPassword ? this.deletePassword : undefined);
      this.sessionState.clearLocalCache();
      window.location.href = '/login';
    } catch (e: any) {
      console.error('Errore eliminazione account:', e);
      this.deleteError = deleteAccountErrorMessage(e);
      this.deleting = false;
      this.cdr.detectChanges();
    }
  }

  get heightSet(): boolean {
    const cm = this.auth.currentUser()?.heightCm;
    return cm !== null && cm !== undefined;
  }

  get heightLabel(): string {
    const cm = this.auth.currentUser()?.heightCm;
    return this.heightSet ? `${formatHeightCm(cm)} cm` : 'Da impostare';
  }

  get nome(): string {
    return dividiNome(this.auth.currentUser() ?? {}).nome;
  }

  get cognome(): string {
    return dividiNome(this.auth.currentUser() ?? {}).cognome;
  }

  setNome(event: Event): Promise<void> {
    return this.salvaNome((event.target as HTMLInputElement).value, this.cognome);
  }

  setCognome(event: Event): Promise<void> {
    return this.salvaNome(this.nome, (event.target as HTMLInputElement).value);
  }

  /**
   * Scrive nome, cognome e il nome intero insieme.
   *
   * displayName e' quello che l'app mostra ovunque - testata dell'Account,
   * lista clienti del coach - e ricomporlo qui e'
   * l'unico modo perche' quei posti non restino indietro col nome vecchio.
   *
   * Tutti e due vuoti non si puo': resterebbero schermate senza nome e un
   * avatar senza iniziale, e le regole lo rifiutano comunque. Meglio dirlo
   * qui, invece di far tornare un permesso negato.
   */
  private async salvaNome(nome: string, cognome: string): Promise<void> {
    const utente = this.auth.currentUser();
    if (!utente) return;

    const nuovoNome = nome.trim();
    const nuovoCognome = cognome.trim();
    if (nuovoNome === this.nome && nuovoCognome === this.cognome) return;

    const intero = componiNome(nuovoNome, nuovoCognome);
    if (!intero) {
      this.toast.error('Il nome non può restare vuoto.');
      this.cdr.detectChanges();
      return;
    }

    this.auth.currentUser.set({
      ...utente, firstName: nuovoNome, lastName: nuovoCognome, displayName: intero
    });
    try {
      await this.auth.patchBody({
        firstName: nuovoNome, lastName: nuovoCognome, displayName: intero
      });
    } catch (e) {
      console.error('Salvataggio del nome fallito:', e);
      this.auth.currentUser.set(utente);
      this.toast.error('Non sono riuscito a salvare. Riprova.');
    }
    this.cdr.detectChanges();
  }

  get birthDate(): string | null {
    return this.auth.currentUser()?.birthDate ?? null;
  }

  /** Nessuno nasce domani. */
  readonly maxBirthDate = todayLocalISO();
  /** Un limite inferiore che nessun vivente supera, giusto per chiudere il
   *  campo: senza, il selettore nativo si apre sull'anno zero. */
  readonly minBirthDate = '1920-01-01';

  /**
   * La data si salva appena il selettore nativo si chiude. Il campo `date`
   * emette `change` solo con una data COMPLETA e gia' valida, quindi qui non
   * arriva mai un mezzo valore da respingere — un anno scritto a meta' resta
   * dentro il campo e non diventa un salvataggio.
   */
  async setBirthDate(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value || null;
    if (value === this.birthDate) return;
    const before = this.birthDate;
    this.auth.currentUser.set({ ...this.auth.currentUser()!, birthDate: value });
    try {
      await this.auth.patchBody({ birthDate: value });
    } catch (e) {
      console.error('Salvataggio della data di nascita fallito:', e);
      this.auth.currentUser.set({ ...this.auth.currentUser()!, birthDate: before });
      this.toast.error('Non sono riuscito a salvare. Riprova.');
    }
    this.cdr.detectChanges();
  }

  get sex(): Sex | null {
    return this.auth.currentUser()?.sex ?? null;
  }

  /**
   * Il sesso si salva al tocco, senza conferma: e' un segmentato, e la tacca
   * accesa e' gia' il riscontro. Toccare quella gia' accesa non scrive niente.
   *
   * La tacca si accende PRIMA della scrittura, cosi' il comando risponde
   * subito; se la scrittura fallisce torna dov'era, perche' una tacca accesa
   * su un valore mai salvato e' una bugia che si scopre al prossimo accesso.
   */
  async setSex(value: Sex): Promise<void> {
    const before = this.sex;
    if (before === value) return;
    this.auth.currentUser.set({ ...this.auth.currentUser()!, sex: value });
    try {
      await this.auth.patchBody({ sex: value });
    } catch (e) {
      console.error('Salvataggio del sesso fallito:', e);
      this.auth.currentUser.set({ ...this.auth.currentUser()!, sex: before });
      this.toast.error('Non sono riuscito a salvare. Riprova.');
    }
    this.cdr.detectChanges();
  }

  openHeightModal(): void {
    this.pick.set(toWheelValue(this.auth.currentUser()?.heightCm));
    this.heightModalOpen = true;
    this.cdr.detectChanges();
  }

  closeHeightModal(): void {
    this.heightModalOpen = false;
    this.cdr.detectChanges();
  }

  /** Il selettore di Ionic ha cambiato valore: arriva il numero della tacca ferma al centro. */
  onPick(value: string | number | undefined): void {
    if (value === undefined) return;
    this.pick.set(toWheelValue(Number(value)));
  }

  async saveHeightModal(): Promise<void> {
    if (this.saving) return;
    const cm = this.pick();
    if (cm === (this.auth.currentUser()?.heightCm ?? null)) {
      this.closeHeightModal();
      return;
    }
    this.saving = true;
    this.cdr.detectChanges();
    try {
      await this.auth.patchBody({ heightCm: cm });
      this.toast.success('Altezza salvata.');
      this.closeHeightModal();
    } catch (e) {
      console.error('Salvataggio altezza fallito:', e);
      this.toast.error('Non sono riuscito a salvare l\'altezza. Riprova.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  get showIosNotificationHint(): boolean {
    return isIosSafariNotStandalone();
  }

  get memberSince(): string {
    const iso = this.auth.currentUser()?.createdAt;
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

}
