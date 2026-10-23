import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MeasurementDataService } from '../../services/measurement-data.service';
import {
  MeasureCategory,
  MeasureField,
  MeasurementEntry,
  MeasurementKey,
  CATEGORY_LABELS,
  PESO_FIELDS,
  PLICHE_FIELDS,
  CENTIMETRI_FIELDS
} from '../../models/measurement.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import {
  IonContent, IonSpinner, IonButton, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel, IonNote,
  IonRadioGroup, IonRadio, IonAccordionGroup, IonAccordion
} from '@ionic/angular';
import { GraficoAndamentoComponent } from '../../components/grafico-andamento/grafico-andamento.component';
import { PuntoMisura, dataBreve, dataLunga, numeroIt, uguale, variazioneIt } from '../../core/utils/grafico-andamento.util';

interface FieldOption {
  field: MeasureField;
  hasData: boolean;
  lastValue: string | null;
}

/** Una riga della tabella sotto il grafico: gli stessi numeri, senza doverli cercare col dito. */
interface RigaMisurazione {
  date: string;
  data: string;
  valore: string;
  cambio: string;
}

/** Nell'ordine della pagina e del segmento in cima. */
export const CATEGORIE_ANDAMENTO: MeasureCategory[] = ['peso', 'pliche', 'centimetri'];

/**
 * L'andamento di una misura alla volta. In cima il segmento sceglie il gruppo
 * (peso, pliche, centimetri), poi la card col grafico, sotto la lista delle
 * misure del gruppo e la tabella delle misurazioni.
 *
 * Prima le diciassette misure stavano tutte in una lista sola sotto il
 * grafico, e il peso aveva un gruppo per una riga sola che ripeteva il titolo.
 */
@Component({
  selector: 'app-misure-analytics',
  standalone: true,
  imports: [
    IonButton, IonSpinner, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel, IonNote, IonRadioGroup, IonRadio,
    IonAccordionGroup, IonAccordion, ...IONIC_PAGE, ...IONIC_REFRESH, CommonModule, GraficoAndamentoComponent
  ],
  templateUrl: './misure-analytics.component.html'
})
export class MisureAnalyticsComponent implements OnInit {
  readonly categorie = CATEGORIE_ANDAMENTO;
  readonly nomiCategorie = CATEGORY_LABELS;

  gruppi: Record<MeasureCategory, FieldOption[]> = { peso: [], pliche: [], centimetri: [] };
  categoria: MeasureCategory = 'peso';
  /** L'ultima misura vista in ogni gruppo: tornando al gruppo si ritrova quella. */
  private sceltaPerGruppo: Partial<Record<MeasureCategory, MeasurementKey>> = {};

  selectedKey: MeasurementKey = 'peso';
  selectedField: MeasureField | null = null;

  punti: PuntoMisura[] = [];
  righe: RigaMisurazione[] = [];
  hasAnyHistory = false;
  /** Per lo screen reader, a ogni cambio di misura. */
  annuncio = '';

  @ViewChild(IonContent) content?: IonContent;

  private allEntries: MeasurementEntry[] = [];
  loading = true;
  errorMsg = '';

  constructor(
    private data: MeasurementDataService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.load(true));
  }

  ngOnInit(): void {
    this.load();
  }

  /** Le misure del gruppo mostrato. */
  get opzioni(): FieldOption[] {
    return this.gruppi[this.categoria];
  }

  haDati(cat: MeasureCategory): boolean {
    return this.gruppi[cat].some(o => o.hasData);
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

      this.gruppi = { peso: buildGroup(PESO_FIELDS), pliche: buildGroup(PLICHE_FIELDS), centimetri: buildGroup(CENTIMETRI_FIELDS) };

      // Ricaricando resta la misura che si guardava; la prima volta, la prima che ha dei dati.
      const tutte = CATEGORIE_ANDAMENTO.flatMap(c => this.gruppi[c]);
      const ancora = this.selectedField && tutte.find(o => o.field.key === this.selectedKey && o.hasData);
      const scelta = ancora || tutte.find(o => o.hasData) || tutte[0];
      this.selectField(scelta.field);
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

  /** Il segmento in cima: si torna all'ultima misura vista nel gruppo, o alla prima che ha dei dati. */
  cambiaCategoria(valore: unknown): void {
    const cat = valore as MeasureCategory;
    if (!CATEGORIE_ANDAMENTO.includes(cat) || cat === this.categoria || !this.haDati(cat)) return;
    const gruppo = this.gruppi[cat];
    const ricordata = gruppo.find(o => o.field.key === this.sceltaPerGruppo[cat] && o.hasData);
    const scelta = ricordata || gruppo.find(o => o.hasData)!;
    this.selectField(scelta.field);
    this.cdr.detectChanges();
  }

  /** La scelta dalla lista (ion-radio-group). */
  sceltaDallaLista(valore: unknown): Promise<void> {
    const o = this.opzioni.find(x => x.field.key === valore);
    return o ? this.scegli(o.field) : Promise.resolve();
  }

  /**
   * La scelta fatta dall'utente, dalla lista: il grafico sta in cima e la lista
   * sotto, e scegliendo "Quadricipite Sx" in fondo il grafico cambiava fuori
   * vista. Se la pagina e' scesa, si torna su dal grafico (piano, o di colpo
   * per chi ha ridotto le animazioni); se si e' gia' in cima non si muove niente.
   */
  async scegli(field: MeasureField): Promise<void> {
    this.selectField(field);
    this.cdr.detectChanges();
    const content = this.content;
    if (!content) return;
    const scorsa = (await content.getScrollElement()).scrollTop;
    if (scorsa <= 24) return;
    await content.scrollToTop(this.movimentoRidotto() ? 0 : 300);
  }

  private movimentoRidotto(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  selectField(field: MeasureField): void {
    this.selectedKey = field.key;
    this.selectedField = field;
    const cat = CATEGORIE_ANDAMENTO.find(c => this.gruppi[c].some(o => o.field.key === field.key));
    if (cat) {
      this.categoria = cat;
      this.sceltaPerGruppo[cat] = field.key;
    }

    const history = this.allEntries.slice().reverse(); // dal piu' vecchio al piu' recente
    this.punti = history
      .map(e => ({ date: e.date, value: this.data.parseMeasureValue(e[field.key] as string | null) }))
      .filter((p): p is PuntoMisura => p.value !== null);

    const conAnno = this.punti.length > 0 && this.punti[0].date.slice(0, 4) !== this.punti[this.punti.length - 1].date.slice(0, 4);
    this.righe = this.punti.map((p, i) => ({
      date: p.date,
      data: dataLunga(p.date),
      valore: numeroIt(p.value),
      cambio: i === 0 ? 'Prima misura'
        : uguale(p.value - this.punti[i - 1].value) ? 'Uguale alla precedente'
        : `${variazioneIt(p.value - this.punti[i - 1].value)} ${field.unit} dalla precedente`
    })).reverse();

    const ultimo = this.punti[this.punti.length - 1];
    const primo = this.punti[0];
    this.annuncio = !ultimo
      ? `${field.label}: nessuna misurazione`
      : this.punti.length < 2
        ? `${field.label}: ${numeroIt(ultimo.value)} ${field.unit}, una sola misurazione`
        : `${field.label}: ${numeroIt(ultimo.value)} ${field.unit}, ` + (uguale(ultimo.value - primo.value)
          ? `uguale al ${dataBreve(primo.date, conAnno)}`
          : `${variazioneIt(ultimo.value - primo.value)} ${field.unit} dal ${dataBreve(primo.date, conAnno)}`);
  }

  isSelected(field: MeasureField): boolean {
    return this.selectedKey === field.key;
  }
}
