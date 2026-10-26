import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonItem, IonLabel, IonList, IonListHeader, IonSpinner, IonToggle } from '@ionic/angular';
import { IONIC_PAGE } from '../../core/ionic-page';
import { PromemoriaService, Supporto } from '../../services/promemoria.service';
import { ToastService } from '../../services/toast.service';
import { GiornoService } from '../../core/giorno.service';
import {
  ANTICIPO_MINUTI, NOMI_GIORNI, NOMI_GIORNI_LUNGHI, Promemoria, normalizzaPromemoria, prossimoPromemoria, quandoArriva
} from '../../core/utils/promemoria.util';

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Pianifica e ricorda: un interruttore, i giorni e l'ora dell'allenamento.
 * Mezz'ora prima arriva la notifica con la seduta che tocca (la manda il
 * server, vedi functions/). Come nelle Impostazioni di iOS si salva mentre si
 * sceglie.
 *
 * Il telefono puo' non permetterlo: un iPhone da Safari (serve l'app sulla
 * schermata Home), un browser senza notifiche, le notifiche bloccate, il
 * server non ancora configurato. In quei casi l'interruttore e' spento e una
 * riga dice perche' e cosa fare.
 */
@Component({
  selector: 'app-promemoria',
  standalone: true,
  imports: [IonButton, IonItem, IonLabel, IonList, IonListHeader, IonSpinner, IonToggle, ...IONIC_PAGE, CommonModule],
  templateUrl: './promemoria.component.html'
})
export class PromemoriaComponent implements OnInit {
  readonly settimana = [1, 2, 3, 4, 5, 6, 7];
  readonly nomi = NOMI_GIORNI;
  readonly nomiLunghi = NOMI_GIORNI_LUNGHI;

  readonly caricamento = signal(true);
  readonly errore = signal('');
  readonly promemoria = signal<Promemoria>(normalizzaPromemoria(null));
  readonly supporto: Supporto;
  readonly permesso = signal<NotificationPermission | 'non-supportato'>('default');
  private readonly giorno = inject(GiornoService);
  /** Mentre si chiede il permesso e si iscrive il telefono. */
  readonly attivazione = signal(false);

  /** L'interruttore si puo' accendere; spegnere si puo' sempre. */
  readonly accendibile = computed(() => this.supporto === 'ok' && this.permesso() !== 'denied');

  /** La riga sotto l'interruttore: cosa fa, o perche' qui non si puo'. */
  readonly spiegazione = computed(() => {
    switch (this.supporto) {
      case 'non-configurato': return 'I promemoria non sono ancora disponibili: manca la configurazione del server che li manda.';
      case 'installa': return 'Su iPhone le notifiche arrivano solo all\'app sulla schermata Home: in Safari tocca Condividi, poi «Aggiungi alla schermata Home», e apri Workout Lab da lì.';
      case 'non-supportato': return 'Questo browser non riceve notifiche: da qui i promemoria non si possono attivare.';
    }
    if (this.permesso() === 'denied') {
      return 'Le notifiche di Workout Lab sono bloccate su questo telefono: riattivale dalle impostazioni del telefono, poi torna qui.';
    }
    return `${ANTICIPO_MINUTI} minuti prima di ogni allenamento ti arriva una notifica con la seduta che tocca. Se quel giorno ti sei già allenato, niente notifica.`;
  });

  /** "Il prossimo arriva oggi alle 17:30." */
  readonly prossimo = computed(() => {
    const p = this.promemoria();
    if (!p.giorni.length) return 'Scegli almeno un giorno: senza giorni non arriva nessun promemoria.';
    // Il giorno dal signal: a mezzanotte "domani" diventa "oggi" da solo.
    this.giorno.oggi();
    const adesso = new Date();
    const r = prossimoPromemoria(p, adesso);
    return r ? `Il prossimo arriva ${quandoArriva(r.invio, adesso)}.` : '';
  });

  constructor(private servizio: PromemoriaService, private toast: ToastService) {
    this.supporto = servizio.supporto();
  }

  ngOnInit(): void {
    void this.carica();
  }

  async carica(): Promise<void> {
    this.caricamento.set(true);
    this.errore.set('');
    this.permesso.set(this.servizio.permesso());
    try {
      this.promemoria.set(await this.servizio.carica());
    } catch (e) {
      console.error('Lettura dei promemoria fallita:', e);
      this.errore.set('Non riesco a leggere i tuoi promemoria. Controlla la connessione e riprova.');
    } finally {
      this.caricamento.set(false);
    }
  }

  /**
   * Accendere chiede il permesso delle notifiche: va fatto subito, dentro il
   * tocco, senza attese prima (su iPhone il permesso si chiede solo cosi').
   * Se non va l'interruttore torna spento, e la riga sotto dice perche'.
   */
  async interruttore(evento: Event): Promise<void> {
    const toggle = evento.target as HTMLIonToggleElement;
    const acceso = !!(evento as CustomEvent<{ checked: boolean }>).detail?.checked;
    const p = this.promemoria();
    if (acceso === p.attivo) return;
    if (!acceso) {
      this.promemoria.set({ ...p, attivo: false });
      this.servizio.spegni(p).catch(() => this.toast.error('Non sono riuscito a spegnere i promemoria. Riprova.'));
      return;
    }
    this.attivazione.set(true);
    const esito = await this.servizio.attiva(p);
    this.attivazione.set(false);
    this.permesso.set(this.servizio.permesso());
    if (esito === 'ok') {
      this.promemoria.set({ ...p, attivo: true });
      return;
    }
    if (toggle) toggle.checked = false;
    if (esito === 'errore') this.toast.error('Non sono riuscito ad attivare i promemoria. Riprova.');
  }

  scelto(giorno: number): boolean {
    return this.promemoria().giorni.includes(giorno);
  }

  cambiaGiorno(giorno: number): void {
    const p = this.promemoria();
    const giorni = this.scelto(giorno) ? p.giorni.filter(g => g !== giorno) : [...p.giorni, giorno].sort((a, b) => a - b);
    this.salva({ ...p, giorni });
  }

  cambiaOra(evento: Event): void {
    const ora = (evento.target as HTMLInputElement | null)?.value ?? '';
    const p = this.promemoria();
    if (!ORA.test(ora) || ora === p.ora) return;
    this.salva({ ...p, ora });
  }

  private salva(p: Promemoria): void {
    this.promemoria.set(p);
    if (p.attivo) this.servizio.cambia(p).catch(() => this.toast.error('Non sono riuscito a salvare i promemoria. Riprova.'));
  }
}
