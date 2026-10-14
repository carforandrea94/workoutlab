import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MeasurementDataService } from '../../services/measurement-data.service';
import {
  MeasureField,
  MeasurementKey,
  PESO_FIELDS,
  PLICHE_FIELDS,
  CENTIMETRI_FIELDS
} from '../../models/measurement.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { IonSpinner, IonButton } from '@ionic/angular';

interface FieldOption {
  field: MeasureField;
  hasData: boolean;
  lastValue: string | null;
}

@Component({
  selector: 'app-misure-analytics',
  standalone: true,
  imports: [IonButton, IonSpinner, ...IONIC_PAGE, ...IONIC_REFRESH, CommonModule],
  templateUrl: './misure-analytics.component.html'
})
export class MisureAnalyticsComponent implements OnInit {
  group1: FieldOption[] = [];
  group2: FieldOption[] = [];
  group3: FieldOption[] = [];

  selectedKey: MeasurementKey = 'peso';
  selectedField: MeasureField | null = null;

  chartSvg: SafeHtml | null = null;
  hasEnoughData = false;
  hasAnyHistory = false;

  firstValue: string | null = null;
  lastValue: string | null = null;
  delta: number | null = null;
  deltaText: string | null = null;

  private allEntries: import('../../models/measurement.model').MeasurementEntry[] = [];
  private allHistory: { date: string; value: number }[] = [];
  loading = true;
  errorMsg = '';

  constructor(
    private data: MeasurementDataService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.load(true));
  }

  ngOnInit(): void {
    this.load();
  }

  /** `silenzioso`: il gesto "tira per aggiornare" rilegge senza far sparire l'elenco dietro lo spinner. */
  async load(silenzioso = false): Promise<void> {
    if (!silenzioso) this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const [history, lastValues] = await Promise.race([
        Promise.all([this.data.loadHistory(), this.data.getLastValues()]),
        timeout
      ]);
      this.allEntries = history;
      this.hasAnyHistory = history.length > 0;

      const buildGroup = (fields: MeasureField[]): FieldOption[] =>
        fields.map(field => ({
          field,
          hasData: history.some(e => !!e[field.key]),
          lastValue: lastValues[field.key] ?? null
        }));

      this.group1 = buildGroup(PESO_FIELDS);
      this.group2 = buildGroup(PLICHE_FIELDS);
      this.group3 = buildGroup(CENTIMETRI_FIELDS);

      // Seleziona di default il primo campo con dati sufficienti (almeno 2 punti), altrimenti 'peso'
      const allOptions = [...this.group1, ...this.group2, ...this.group3];
      const firstWithData = allOptions.find(o => o.hasData);
      this.selectField(firstWithData ? firstWithData.field : this.group1[0].field);
    } catch (e: any) {
      console.error('Errore caricamento analisi misure:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento dei dati. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectField(field: MeasureField): void {
    this.selectedKey = field.key;
    this.selectedField = field;

    const history = this.allEntries.slice().reverse(); // dal piu' vecchio al piu' recente
    const points = history
      .map(e => ({ date: e.date, value: this.data.parseMeasureValue(e[field.key] as string | null) }))
      .filter((p): p is { date: string; value: number } => p.value !== null);

    this.allHistory = points;
    this.hasEnoughData = points.length >= 2;

    if (points.length >= 1) {
      this.firstValue = this.data.formatMeasureNumber(points[0].value);
      this.lastValue = this.data.formatMeasureNumber(points[points.length - 1].value);
    } else {
      this.firstValue = null;
      this.lastValue = null;
    }

    if (this.hasEnoughData) {
      const diff = points[points.length - 1].value - points[0].value;
      this.delta = Math.round(diff * 10) / 10;
      this.deltaText = (this.delta > 0 ? '+' : '') + this.data.formatMeasureNumber(this.delta);
      const svg = this.data.buildTrendSVG(points);
      this.chartSvg = this.sanitizer.bypassSecurityTrustHtml(svg);
    } else {
      this.delta = null;
      this.deltaText = null;
      this.chartSvg = null;
    }
  }

  isSelected(field: MeasureField): boolean {
    return this.selectedKey === field.key;
  }

  getDeltaClass(): string {
    if (this.delta === null || this.delta === 0) return 'delta';
    return this.delta > 0 ? 'delta up' : 'delta down';
  }
}
