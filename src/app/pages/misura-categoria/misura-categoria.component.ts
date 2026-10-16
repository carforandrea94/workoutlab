import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { MeasurementDataService, UltimiValori } from '../../services/measurement-data.service';
import { dataEstesa, quandoBreve, todayLocalISO } from '../../core/utils/date.util';
import { MeasureCategory, MeasureField, CATEGORY_FIELDS, CATEGORY_LABELS } from '../../models/measurement.model';
import { MeasureCategoryStateService } from '../../services/measure-category-state.service';
import { ToastService } from '../../services/toast.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { NavController, IonFooter, IonInput, IonSpinner, IonButton, IonRouterOutlet } from '@ionic/angular';
import { ConModificheNonSalvate } from '../../core/guards/modifiche-non-salvate.guard';
import { senzaSwipeIndietro } from '../../core/swipe-indietro';
import { NomeCampoDirective } from '../../core/nome-campo.directive';

@Component({
  selector: 'app-misura-categoria',
  standalone: true,
  imports: [NomeCampoDirective, IonButton, IonFooter, IonInput, IonSpinner, ...IONIC_PAGE, CommonModule, FormsModule],
  templateUrl: './misura-categoria.component.html'
})
export class MisuraCategoriaComponent implements OnInit, OnDestroy, ConModificheNonSalvate {
  category!: MeasureCategory;
  fields: MeasureField[] = [];
  title = '';

  isEdit = false;
  originalDate = '';
  dateValue = '';
  maxDate = todayLocalISO();

  values: Record<string, string | null> = {};
  /** L'ultima volta di ogni campo: la riga "Ultimo 82 kg · 3 ott" sotto il campo, in una misura nuova. */
  ultimi: UltimiValori = {};

  errorMsg = '';
  loading = true;

  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private paramSub: Subscription | null = null;

  /**
   * Una misura nuova ha la sua bozza, che si salva da sola mentre si scrive e
   * riappare all'apertura: uscire non fa perdere niente. Una in modifica no -
   * i valori cambiati restano a schermo finche' non si salva - e per quella
   * c'e' la guardia, con quello che c'era all'apertura come termine di confronto.
   */
  private baseline = '';
  private uscitaConsentita = false;
  private get swipe() { return senzaSwipeIndietro(this.outlet); }

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    private data: MeasurementDataService,
    private cdr: ChangeDetectorRef,
    public measureState: MeasureCategoryStateService,
    private toast: ToastService,
    @Optional() private outlet: IonRouterOutlet | null = null
  ) {}

  ngOnInit(): void {
    this.measureState.registerSaveHandler(() => this.save());
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.category = params.get('categoria') as MeasureCategory;
      if (!CATEGORY_FIELDS[this.category]) {
        this.nav.navigateBack(['/misure']);
        return;
      }
      this.fields = CATEGORY_FIELDS[this.category];
      this.title = CATEGORY_LABELS[this.category];
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    // Chi scrive e se ne va entro mezzo secondo non ha ancora la bozza
    // salvata: si scrive adesso, o l'ultimo pezzo andrebbe perso.
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
      if (!this.isEdit && this.hasAnyValue()) this.data.saveDraft(this.category, this.values);
    }
    this.measureState.registerSaveHandler(null);
  }

  ionViewWillEnter(): void {
    this.uscitaConsentita = false;
    // La guardia c'e' solo in modifica (vedi baseline): li' lo swipe va spento.
    if (this.route.snapshot.queryParamMap.get('date')) this.swipe.spegni();
  }

  ionViewWillLeave(): void {
    this.swipe.riaccendi();
  }

  /** Una misura nuova e' sempre di oggi: lo dice la pagina, invece di lasciarlo supporre. */
  get oggiEsteso(): string {
    return dataEstesa(todayLocalISO());
  }

  /** "Ultimo 82 kg · 3 ott". Solo in una misura nuova: in modifica il valore e' di una data passata e "ultimo" direbbe altro. */
  ultimo(field: MeasureField): string | null {
    const u = this.ultimi[field.key];
    return u ? `Ultimo ${u.value} ${field.unit} · ${quandoBreve(u.date)}` : null;
  }

  get etichettaSalva(): string {
    if (this.measureState.saving()) return 'Salvo…';
    return this.isEdit ? 'Salva modifiche' : 'Salva';
  }

  private fotografia(): string {
    return JSON.stringify([this.dateValue, this.values]);
  }

  /** Valori o data cambiati in una misura in modifica: vedi uscitaSenzaPerdite. */
  haModificheNonSalvate(): boolean {
    return this.isEdit && !this.uscitaConsentita && this.baseline !== '' && this.fotografia() !== this.baseline;
  }

  private emptyValues(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    this.fields.forEach(f => { out[f.key] = null; });
    return out;
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';
    const dateParam = this.route.snapshot.queryParamMap.get('date');
    this.isEdit = !!dateParam;

    // Una lettura Firestore puo' restare sospesa a tempo indeterminato senza
    // mai risolversi ne' rigettarsi (stesso motivo per cui FirebaseService
    // forza il long-polling): senza un limite di tempo il catch qui sotto non
    // verrebbe mai raggiunto e la schermata resterebbe a caricare per sempre.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      if (this.isEdit) {
        this.ultimi = {};
        this.originalDate = dateParam!;
        this.dateValue = dateParam!;
        this.values = await Promise.race([
          this.data.getCategoryValues(this.category, dateParam!),
          timeout
        ]);
        this.baseline = this.fotografia();
      } else {
        this.dateValue = todayLocalISO();
        this.values = this.emptyValues();
        const [ultimi, draft] = await Promise.race([
          Promise.all([this.data.getLastValuesWithDate(), this.data.loadDraft(this.category)]),
          timeout
        ]);
        this.ultimi = ultimi;
        if (draft) this.values = draft;
      }
    } catch (e: any) {
      console.error('Errore caricamento misura:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onInput(): void {
    if (this.isEdit) return;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => { this.draftTimer = null; this.data.saveDraft(this.category, this.values); }, 500);
  }

  hasAnyValue(): boolean {
    return this.fields.some(f => !!this.values[f.key]);
  }

  /**
   * Pesarsi e salvare dice subito di quanto e' cambiato dall'ultima volta: e' la
   * cosa che si vuole sapere appena scesi dalla bilancia, e prima la si trovava
   * solo nell'Account. Le altre misure dicono soltanto che sono salvate.
   */
  private messaggioSalvato(): string {
    if (this.category !== 'peso') return 'Misurazione salvata';
    const ora = this.data.parseMeasureValue(this.values['peso']);
    if (ora === null) return 'Peso salvato';
    const prima = this.data.parseMeasureValue(this.ultimi['peso']?.value);
    const kg = `Peso salvato: ${this.data.formatMeasureNumber(ora)} kg`;
    if (prima === null) return kg;
    const diff = Math.round((ora - prima) * 10) / 10;
    if (diff === 0) return `${kg}, come l'ultima volta`;
    return `${kg}, ${diff > 0 ? '+' : ''}${this.data.formatMeasureNumber(diff)} dall'ultima volta`;
  }

  async save(): Promise<void> {
    if (!this.hasAnyValue()) return;
    if (this.dateValue > this.maxDate) {
      this.errorMsg = 'Non puoi registrare una misurazione in una data futura.';
      this.cdr.detectChanges();
      return;
    }
    if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }
    this.errorMsg = '';
    this.measureState.saving.set(true);

    if (!this.isEdit) {
      const ok = await this.data.saveCategoryToday(this.category, this.values);
      this.measureState.saving.set(false);
      if (ok) {
        await this.data.clearDraft(this.category);
        this.toast.success(this.messaggioSalvato());
        this.nav.navigateBack(['/misure']);
      } else {
        this.toast.error('Errore durante il salvataggio. Riprova.');
      }
      return;
    }

    const result = await this.data.moveCategoryEntry(this.category, this.originalDate, this.dateValue, this.values);
    this.measureState.saving.set(false);
    if (result === 'ok') {
      this.toast.success('Misurazione aggiornata ✓');
      this.uscitaConsentita = true;
      this.nav.navigateBack(['/misure/storico', this.dateValue]);
    } else if (result === 'collision') {
      this.errorMsg = 'Esiste già una misurazione di questo tipo in questa data.';
      this.cdr.detectChanges();
      this.toast.error('Esiste già una misurazione di questo tipo in questa data.');
    } else {
      this.toast.error('Errore durante il salvataggio. Riprova.');
    }
  }
}
