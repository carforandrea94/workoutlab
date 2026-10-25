import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonSpinner } from '@ionic/angular';
import { IONIC_PAGE } from '../../core/ionic-page';
import { AppStateService } from '../../services/app-state.service';
import { todayLocalISO } from '../../core/utils/date.util';
import {
  NOMI_OBIETTIVO, Obiettivo, PESO_MASSIMO, PESO_MINIMO, SPIEGAZIONI_OBIETTIVO, TIPI_OBIETTIVO, TipoObiettivo,
  conTraguardoDiPeso, normalizzaObiettivo, pesoTraguardo
} from '../../core/utils/obiettivo.util';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Il mio obiettivo: una scelta fra quattro e, per chi lavora sul peso, un
 * traguardo facoltativo con la data. Come nelle Impostazioni di iOS si salva
 * mentre si sceglie: la scelta col tocco, il peso quando si esce dal campo.
 * Il traguardo si legge dove si guarda il peso, nel grafico di Misure.
 */
@Component({
  selector: 'app-obiettivo',
  standalone: true,
  imports: [
    IonButton, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup, IonSpinner,
    ...IONIC_PAGE, CommonModule
  ],
  templateUrl: './obiettivo.component.html'
})
export class ObiettivoComponent implements OnInit {
  readonly tipi = TIPI_OBIETTIVO;
  readonly nomi = NOMI_OBIETTIVO;
  readonly spiegazioni = SPIEGAZIONI_OBIETTIVO;
  readonly oggi = todayLocalISO();
  readonly pesoMinimo = PESO_MINIMO;
  readonly pesoMassimo = PESO_MASSIMO;

  readonly caricamento = signal(true);
  readonly errore = signal('');
  readonly obiettivo = signal<Obiettivo | null>(null);
  /** Il peso scritto non e' un peso da traguardo: si dice, e non si salva. */
  readonly pesoSbagliato = signal(false);

  readonly conTraguardo = computed(() => conTraguardoDiPeso(this.obiettivo()?.tipo));
  /** Il peso nel campo, con la virgola. */
  readonly pesoScritto = computed(() => {
    const p = this.obiettivo()?.peso;
    return p == null ? '' : String(p).replace('.', ',');
  });

  constructor(private appState: AppStateService) {}

  ngOnInit(): void {
    void this.carica();
  }

  async carica(): Promise<void> {
    this.caricamento.set(true);
    this.errore.set('');
    try {
      const stato = await this.appState.load();
      this.obiettivo.set(normalizzaObiettivo(stato.obiettivo));
    } catch (e) {
      console.error('Lettura dell\'obiettivo fallita:', e);
      this.errore.set('Non riesco a leggere il tuo obiettivo. Controlla la connessione e riprova.');
    } finally {
      this.caricamento.set(false);
    }
  }

  /** Cambiando obiettivo il traguardo resta se ha ancora senso (da massa a grasso), sparisce se no. */
  scegli(tipo: TipoObiettivo | null | undefined): void {
    if (!tipo || !TIPI_OBIETTIVO.includes(tipo) || tipo === this.obiettivo()?.tipo) return;
    const prima = this.obiettivo();
    const tiene = conTraguardoDiPeso(tipo);
    this.pesoSbagliato.set(false);
    this.salva({ tipo, peso: tiene ? prima?.peso ?? null : null, entro: tiene ? prima?.entro ?? null : null });
  }

  /** Vuoto toglie il traguardo, e con lui la data. */
  impostaPeso(raw: string | number | null | undefined): void {
    const o = this.obiettivo();
    if (!o) return;
    const t = String(raw ?? '').trim();
    if (!t) {
      this.pesoSbagliato.set(false);
      if (o.peso !== null) this.salva({ ...o, peso: null, entro: null });
      return;
    }
    const peso = pesoTraguardo(t);
    this.pesoSbagliato.set(peso === null);
    if (peso === null || peso === o.peso) return;
    this.salva({ ...o, peso });
  }

  impostaData(evento: Event): void {
    const o = this.obiettivo();
    if (!o || o.peso === null) return;
    const v = (evento.target as HTMLInputElement | null)?.value ?? '';
    const entro = DATA.test(v) ? v : null;
    if (entro !== o.entro) this.salva({ ...o, entro });
  }

  private salva(o: Obiettivo): void {
    this.obiettivo.set(o);
    // Un errore lo segnala gia' AppStateService, con un avviso.
    this.appState.patchField('obiettivo', o).catch(() => { /* gia' segnalato */ });
  }
}
