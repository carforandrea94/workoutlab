import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, OnDestroy, signal } from '@angular/core';
import {
  AMBIENTE_SUONO, AmbienteSuono, leggiPreferenze, salvaPreferenze, sbloccaAudio, suona
} from '../core/utils/segnale.util';
import { vibra, vibrazioneDisponibile } from '../core/utils/vibrazione.util';

/**
 * Le preferenze del segnale di fine recupero e lo sblocco dell'audio.
 *
 * Il suono non parte se prima non c'e' stato un tocco: il browser lo vieta, e
 * su iPhone e' piu' severo che altrove. Il primo "Fatta" dell'allenamento e'
 * gia' quel tocco, ma non si puo' sapere quale sara' il primo, quindi ogni
 * tocco dell'app prepara il contesto (costa niente se e' gia' pronto). Lo
 * schermo resta acceso durante la seduta (SchermoAccesoService), e' questo che
 * permette al timer di suonare fra una serie e l'altra.
 *
 * Va istanziato all'avvio (TabsPage lo inietta): se nascesse al primo uso, i
 * tocchi precedenti non avrebbero sbloccato niente.
 */
@Injectable({ providedIn: 'root' })
export class SegnaleService implements OnDestroy {
  readonly suono = signal(true);
  readonly vibrazione = signal(true);
  /** Dove il browser non sa vibrare (iPhone dalla Home) l'interruttore sarebbe inerte: la pagina lo nasconde. */
  readonly vibrazioneDisponibile = vibrazioneDisponibile();

  private readonly sblocca = (): void => { if (this.suono()) sbloccaAudio(this.ambiente); };
  private readonly alRientro = (): void => {
    if (this.doc.visibilityState === 'visible') this.sblocca();
  };

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    @Inject(AMBIENTE_SUONO) private ambiente: AmbienteSuono
  ) {
    const p = leggiPreferenze();
    this.suono.set(p.suono);
    this.vibrazione.set(p.vibrazione);
    // In cattura e passivi: non devono mai ritardare ne' fermare il tocco vero.
    for (const tipo of ['click', 'touchend'] as const) {
      this.doc.addEventListener(tipo, this.sblocca, { capture: true, passive: true });
    }
    this.doc.addEventListener('visibilitychange', this.alRientro);
  }

  ngOnDestroy(): void {
    for (const tipo of ['click', 'touchend'] as const) {
      this.doc.removeEventListener(tipo, this.sblocca, { capture: true });
    }
    this.doc.removeEventListener('visibilitychange', this.alRientro);
  }

  /** Accendendolo si sente com'e': e' anche il gesto che sblocca l'audio. */
  impostaSuono(attivo: boolean): void {
    if (attivo === this.suono()) return;
    this.suono.set(attivo);
    this.salva();
    if (attivo) {
      sbloccaAudio(this.ambiente);
      suona('fine-recupero', this.ambiente);
    }
  }

  /** Accendendola si sente: una vibrazione sola, quella dell'avviso piu' lieve. */
  impostaVibrazione(attiva: boolean): void {
    if (attiva === this.vibrazione()) return;
    this.vibrazione.set(attiva);
    this.salva();
    if (attiva) vibra('fine-pausa');
  }

  private salva(): void {
    salvaPreferenze({ suono: this.suono(), vibrazione: this.vibrazione() });
  }
}
