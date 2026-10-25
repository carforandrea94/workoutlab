import { Component, OnInit, ChangeDetectorRef, Injector, ViewChild, inject } from '@angular/core';
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
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import {
  NavController, IonContent, IonSpinner, IonButton, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel, IonNote,
  IonRadioGroup, IonRadio, IonAccordionGroup, IonAccordion, IonFooter, IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular';
import { BarraAzioneDirective } from '../../core/directives/barra-azione.directive';
import { IconaComponent } from '../../components/icona/icona.component';
import { GraficoAndamentoComponent } from '../../components/grafico-andamento/grafico-andamento.component';
import { PuntoMisura, dataBreve, dataLunga, numeroIt, uguale, variazioneIt } from '../../core/utils/grafico-andamento.util';
import { AppStateService } from '../../services/app-state.service';
import { Obiettivo, normalizzaObiettivo, testoTraguardo } from '../../core/utils/obiettivo.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { mediaMobile } from '../../core/utils/settimana.util';

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

/** Il tasto in basso: registra una misura del gruppo che si sta guardando. */
export const ETICHETTA_REGISTRA: Record<MeasureCategory, string> = {
  peso: 'Registra peso',
  pliche: 'Registra pliche',
  centimetri: 'Registra centimetri'
};

/** Un gruppo senza nessuna misura: cosa manca, e dove si aggiunge. */
export const INVITO_GRUPPO: Record<MeasureCategory, string> = {
  peso: 'Ancora nessuna pesata.',
  pliche: 'Ancora nessuna plica misurata.',
  centimetri: 'Ancora nessuna circonferenza misurata.'
};

/**
 * Misure: l'andamento di una misura alla volta, e da qui se ne registrano di
 * nuove. In cima il segmento sceglie il gruppo (peso, pliche, centimetri), poi
 * la card col grafico, la lista delle misure del gruppo e la tabella delle
 * misurazioni; in basso, dove nelle tab sta la barra, il tasto che apre il
 * modulo del gruppo. Salvato, si torna qui e il punto nuovo e' sul grafico.
 *
 * Prima Misure era un elenco di tre righe (una per gruppo) e il grafico stava
 * in una pagina a parte, Andamento, raggiunta da un'icona in alto.
 */
@Component({
  selector: 'app-misure',
  standalone: true,
  imports: [
    IonButton, IonSpinner, IonSegment, IonSegmentButton, IonList, IonItem, IonLabel, IonNote, IonRadioGroup, IonRadio,
    IonAccordionGroup, IonAccordion, IonFooter, IonCard, IonCardHeader, IonCardTitle, IonCardContent, ...IONIC_PAGE, ...IONIC_LINKS, ...IONIC_REFRESH, CommonModule,
    GraficoAndamentoComponent, BarraAzioneDirective, IconaComponent
  ],
  templateUrl: './misure.component.html'
})
export class MisureComponent implements OnInit {
  readonly categorie = CATEGORIE_ANDAMENTO;
  readonly nomiCategorie = CATEGORY_LABELS;
  readonly etichettaRegistra = ETICHETTA_REGISTRA;
  readonly invito = INVITO_GRUPPO;

  gruppi: Record<MeasureCategory, FieldOption[]> = { peso: [], pliche: [], centimetri: [] };
  categoria: MeasureCategory = 'peso';
  /** L'ultima misura vista in ogni gruppo: tornando al gruppo si ritrova quella. */
  private sceltaPerGruppo: Partial<Record<MeasureCategory, MeasurementKey>> = {};

  selectedKey: MeasurementKey = 'peso';
  selectedField: MeasureField | null = null;

  punti: PuntoMisura[] = [];
  /**
   * Sul peso la linea e' la media dei sette giorni (vedi settimana.util): un
   * giorno piu' pesante non la sposta. Le pesate vere restano sotto, come
   * punti, e nella tabella. null sulle altre misure.
   */
  pesate: PuntoMisura[] | null = null;
  /** Il nome sopra il grafico: sul peso dice che la linea e' una media. */
  nomeGrafico = '';
  righe: RigaMisurazione[] = [];
  /** Per lo screen reader, a ogni cambio di misura. */
  annuncio = '';
  /**
   * Il traguardo del peso (vedi obiettivo.util): la linea sul grafico del peso,
   * e in testa quanto manca dalla media di oggi. null sulle altre misure.
   */
  traguardo: { valore: number; testo: string } | null = null;
  private obiettivo: Obiettivo | null = null;
  private readonly injector = inject(Injector);

  @ViewChild(IonContent) content?: IonContent;

  private allEntries: MeasurementEntry[] = [];
  loading = true;
  errorMsg = '';

  /** La prima entrata la carica ngOnInit; le altre (tornando dal modulo) rileggono. */
  private entrata = false;

  constructor(
    private data: MeasurementDataService,
    private cdr: ChangeDetectorRef,
    private nav: NavController
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.load(true));
  }

  ngOnInit(): void {
    this.load();
  }

  /**
   * La pagina resta viva nella pila: tornando dal modulo dopo un salvataggio
   * si rilegge, senza spinner, e resta la misura che si guardava.
   */
  ionViewWillEnter(): void {
    if (this.entrata) void this.load(true);
    this.entrata = true;
  }

  /** Il modulo del gruppo mostrato: una misura nuova e' sempre di oggi. */
  registra(): void {
    this.nav.navigateForward(['/account/misure', this.categoria]);
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
      const [history, lastValues, obiettivo] = await Promise.race([
        Promise.all([this.data.loadHistory(), this.data.getLastValues(), this.leggiObiettivo()]),
        timeout
      ]);
      this.allEntries = history;
      this.obiettivo = obiettivo;

      const buildGroup = (fields: MeasureField[]): FieldOption[] =>
        fields.map(field => ({
          field,
          hasData: history.some(e => !!e[field.key]),
          lastValue: lastValues[field.key] ?? null
        }));

      this.gruppi = { peso: buildGroup(PESO_FIELDS), pliche: buildGroup(PLICHE_FIELDS), centimetri: buildGroup(CENTIMETRI_FIELDS) };

      // La prima volta si parte dalla prima misura che ha dei dati. Ricaricando
      // (tornando dal modulo, o tirando) si resta nel gruppo: sulla misura che si
      // guardava, o sulla prima del gruppo che ha dei dati, o sul gruppo vuoto.
      const tutte = CATEGORIE_ANDAMENTO.flatMap(c => this.gruppi[c]);
      const gruppo = this.gruppi[this.categoria];
      const scelta = this.selectedField
        ? gruppo.find(o => o.field.key === this.selectedKey && o.hasData) || gruppo.find(o => o.hasData) || gruppo[0]
        : tutte.find(o => o.hasData) || tutte[0];
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

  /** Il traguardo e' un di piu' della pagina: se la lettura non va, il grafico c'e' lo stesso. */
  private async leggiObiettivo(): Promise<Obiettivo | null> {
    try {
      const stato = await this.injector.get(AppStateService).load();
      return normalizzaObiettivo(stato.obiettivo);
    } catch {
      return null;
    }
  }

  /**
   * Il segmento in cima: si torna all'ultima misura vista nel gruppo, o alla
   * prima che ha dei dati. Anche un gruppo vuoto si sceglie: e' da li' che si
   * registra la prima misura.
   */
  cambiaCategoria(valore: unknown): void {
    const cat = valore as MeasureCategory;
    if (!CATEGORIE_ANDAMENTO.includes(cat) || cat === this.categoria) return;
    const gruppo = this.gruppi[cat];
    const ricordata = gruppo.find(o => o.field.key === this.sceltaPerGruppo[cat] && o.hasData);
    const scelta = ricordata || gruppo.find(o => o.hasData) || gruppo[0];
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
    const misurazioni = history
      .map(e => ({ date: e.date, value: this.data.parseMeasureValue(e[field.key] as string | null) }))
      .filter((p): p is PuntoMisura => p.value !== null);
    const media = field.key === 'peso';
    this.punti = media ? mediaMobile(misurazioni) : misurazioni;
    this.pesate = media ? misurazioni : null;
    this.nomeGrafico = media ? `${field.label} · media di 7 giorni` : field.label;

    const conAnno = this.punti.length > 0 && this.punti[0].date.slice(0, 4) !== this.punti[this.punti.length - 1].date.slice(0, 4);
    // La tabella resta delle misurazioni vere: e' li' che si legge la pesata di un giorno.
    this.righe = misurazioni.map((p, i) => ({
      date: p.date,
      data: dataLunga(p.date),
      valore: numeroIt(p.value),
      cambio: i === 0 ? 'Prima misura'
        : uguale(p.value - misurazioni[i - 1].value) ? 'Uguale alla precedente'
        : `${variazioneIt(p.value - misurazioni[i - 1].value)} ${field.unit} dalla precedente`
    })).reverse();

    const ultimo = this.punti[this.punti.length - 1];
    const primo = this.punti[0];
    const testo = field.key === 'peso' && ultimo ? testoTraguardo(this.obiettivo, ultimo.value, todayLocalISO()) : null;
    this.traguardo = testo && this.obiettivo?.peso != null ? { valore: this.obiettivo.peso, testo } : null;
    const detto = media ? `${field.label}, media di 7 giorni` : field.label;
    this.annuncio = !ultimo
      ? `${CATEGORY_LABELS[this.categoria]}. ${INVITO_GRUPPO[this.categoria]}`
      : this.punti.length < 2
        ? `${field.label}: ${numeroIt(ultimo.value)} ${field.unit}, una sola misurazione`
        : `${detto}: ${numeroIt(ultimo.value)} ${field.unit}, ` + (uguale(ultimo.value - primo.value)
          ? `uguale al ${dataBreve(primo.date, conAnno)}`
          : `${variazioneIt(ultimo.value - primo.value)} ${field.unit} dal ${dataBreve(primo.date, conAnno)}`);
  }

  isSelected(field: MeasureField): boolean {
    return this.selectedKey === field.key;
  }
}
