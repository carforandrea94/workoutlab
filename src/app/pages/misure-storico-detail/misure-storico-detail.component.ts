import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import {
  MeasurementEntry,
  MeasureField,
  MeasureCategory,
  PESO_FIELDS,
  PLICHE_FIELDS,
  CENTIMETRI_FIELDS
} from '../../models/measurement.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { NavController, IonSpinner, IonButton } from '@ionic/angular';

interface FieldRow {
  field: MeasureField;
  value: string | null;
  delta: number | null;
  deltaText: string | null;
}

@Component({
  selector: 'app-misure-storico-detail',
  standalone: true,
  imports: [IonButton, IonSpinner, ...IONIC_PAGE, CommonModule],
  templateUrl: './misure-storico-detail.component.html'
})
export class MisureStoricoDetailComponent implements OnInit {
  entry: MeasurementEntry | null = null;
  displayDate = '';
  date = '';
  loading = true;
  errorMsg = '';

  rows1: FieldRow[] = [];
  rows2: FieldRow[] = [];
  rows3: FieldRow[] = [];

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    private data: MeasurementDataService,
    private confirm: ConfirmDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i dati possono essere cambiati altrove (salvataggi, eliminazioni). */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.load();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    this.date = this.route.snapshot.paramMap.get('key') ?? '';
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const history = await Promise.race([this.data.loadHistory(), timeout]);
      this.entry = history.find(e => e.date === this.date) ?? null;
      if (!this.entry) { this.nav.navigateBack(['/misure/storico']); return; }

      const d = new Date(this.entry.date + 'T00:00:00');
      this.displayDate = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const prev = await this.data.getPreviousEntry(this.entry.date);
      this.rows1 = this.buildRows(PESO_FIELDS, this.entry, prev);
      this.rows2 = this.buildRows(PLICHE_FIELDS, this.entry, prev);
      this.rows3 = this.buildRows(CENTIMETRI_FIELDS, this.entry, prev);
    } catch (e: any) {
      console.error('Errore caricamento dettaglio misurazione:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento della misurazione. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private buildRows(fields: MeasureField[], entry: MeasurementEntry, prev: MeasurementEntry | null): FieldRow[] {
    return fields.map(field => {
      const value = entry[field.key];
      let delta: number | null = null;
      let deltaText: string | null = null;
      const cur = this.data.parseMeasureValue(value);
      const prevVal = this.data.parseMeasureValue(prev?.[field.key]);
      if (cur !== null && prevVal !== null) {
        delta = Math.round((cur - prevVal) * 10) / 10;
        deltaText = (delta > 0 ? '+' : '') + this.data.formatMeasureNumber(delta);
      }
      return { field, value, delta, deltaText };
    });
  }

  hasValue(rows: FieldRow[]): boolean {
    return rows.some(r => !!r.value);
  }

  editCategory(category: MeasureCategory): void {
    this.nav.navigateForward(['/misure', category], { queryParams: { date: this.date } });
  }

  async deleteEntry(): Promise<void> {
    const ok = await this.confirm.confirm('Eliminare questa misurazione dallo storico?');
    if (ok) {
      await this.data.deleteEntry(this.date);
      this.nav.navigateBack(['/misure/storico']);
    }
  }
}
