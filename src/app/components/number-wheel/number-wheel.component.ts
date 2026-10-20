import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter,
  Input, OnChanges, Output, SimpleChanges, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WheelSpec, wheelValues, wheelIndexAt, wheelIndexOf, wheelOffsetOfIndex, wheelWindow
} from '../../core/utils/wheel.util';

/** Quante tacche per lato si disegnano intorno al valore. Centoventi mezzi
 *  chili sono sessanta chili in su e sessanta in giu': qualunque correzione
 *  di una serie ci sta dentro, e i salti piu' grossi si scrivono. */
export const WHEEL_NOTCHES = 120;

/** Altezza di una tacca, in px. Lo stesso numero sta nel foglio di stile
 *  (.wheel-wrap.corta .wheel-item): se i due divergono, la ruota sceglie un
 *  valore diverso da quello che mostra al centro. */
export const WHEEL_ITEM_H = 36;

/**
 * Una ruota di numeri che si puo' anche scrivere.
 *
 * Si scorre per i cambi piccoli - mezzo chilo, una ripetizione - e si tocca il
 * numero al centro per scriverlo, che e' la via rapida quando il salto e'
 * grosso: da 30 a 60 kg sono sessanta tacche, ma due cifre sulla tastiera.
 * E' anche il motivo per cui scrivere resta: senza, il passo fine renderebbe
 * scomodo tutto quello che non e' vicino.
 *
 * Un numero scritto fuori dalla griglia (32,3 con passo 0,5) non viene
 * arrotondato: entra nella ruota al posto suo. Arrotondarlo vorrebbe dire
 * cambiare un numero che qualcuno ha scritto apposta.
 *
 * Da tastiera e con uno screen reader la ruota e' UN controllo, non centinaia:
 * un "spinbutton" con un solo tab-stop (le tacche sono solo per il dito, fuori
 * dall'albero di accessibilita' e dal Tab). Freccia su/giu' cambia di un passo,
 * Pag su/giu' di dieci, Invio o una cifra aprono la scrittura. Il verso e' quello
 * dei campi numerici (su = di piu'), non quello in cui scorre la ruota.
 */
@Component({
  selector: 'app-number-wheel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="wheel-wrap corta" [class.disabled]="disabled" [class.writing]="editing">
  <div class="wheel-band" aria-hidden="true">
    <span class="unit" *ngIf="unit && !editing">{{ unit }}</span>
  </div>

  <!-- Si scrive dentro la banda, al posto del numero: e' lo stesso punto in
       cui lo si legge, quindi non c'e' niente da cercare. -->
  <input *ngIf="editing" #field class="wheel-write" type="text" inputmode="decimal"
    [(ngModel)]="draft" (keydown.enter)="commit(true)" (keydown.escape)="cancel()" (blur)="commit()"
    [attr.aria-label]="label || 'Valore'">

  <div class="wheel" #track (scroll)="onScroll()" (keydown)="onKey($event)"
    role="spinbutton"
    [attr.tabindex]="disabled || editing ? -1 : 0"
    [attr.aria-label]="label || null"
    [attr.aria-valuemin]="min" [attr.aria-valuemax]="max"
    [attr.aria-valuenow]="valoreAttuale"
    [attr.aria-valuetext]="testoValore"
    [attr.aria-disabled]="disabled ? 'true' : null"
    [attr.aria-hidden]="editing ? 'true' : null">
    <button type="button" class="wheel-item" *ngFor="let v of values; let i = index"
      tabindex="-1" aria-hidden="true"
      [class.on]="i === index"
      [disabled]="disabled"
      (click)="onItem(i)">{{ show(v) }}</button>
  </div>
</div>`
})
export class NumberWheelComponent implements AfterViewInit, OnChanges {
  /** Il valore scelto. null quando non si e' ancora scelto niente. */
  @Input() value: number | null = null;
  /** Il valore del protocollo, mostrato finche' non si sceglie. */
  @Input() placeholder: number | null = null;
  @Input() min = 0;
  /** Il tetto vero, non quello disegnato: la ruota ne mostra un pezzo per
   *  volta e lo allunga quando ci si arriva. */
  @Input() max = 1000;
  @Input() step = 0.5;
  @Input() unit = '';
  @Input() disabled = false;
  @Input() label = '';

  @Output() valueChange = new EventEmitter<number>();

  @ViewChild('track') trackEl?: ElementRef<HTMLDivElement>;
  @ViewChild('field') fieldEl?: ElementRef<HTMLInputElement>;

  values: number[] = [];
  index = 0;
  editing = false;
  draft = '';

  private get spec(): WheelSpec {
    return { min: this.min, max: this.max, step: this.step };
  }

  /** La porzione disegnata adesso. Si allunga, non si restringe mai durante
   *  uno scorrimento: cambiare l'elenco sotto le dita farebbe saltare la ruota. */
  private finestra: WheelSpec = { min: 0, max: 0, step: 1 };

  /** Quello su cui la ruota sta ferma: il valore scelto, o il suggerito. */
  private get current(): number | null {
    return this.value ?? this.placeholder;
  }

  /** Il numero che la ruota dichiara (null: ancora niente, nemmeno un suggerito). */
  get valoreAttuale(): number | null {
    return this.current;
  }

  /** Come lo legge uno screen reader: col numero, l'unita' e se e' ancora solo il suggerito. */
  get testoValore(): string | null {
    const v = this.current;
    if (v === null) return null;
    const unita = this.unit ? ' ' + this.unit : '';
    return `${this.show(v)}${unita}${this.value === null ? ', suggerito' : ''}`;
  }

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(ch: SimpleChanges): void {
    // Se il valore e' gia' dentro la porzione disegnata non si rifa' niente:
    // lo scorrimento emette a ogni tacca, e rifare l'elenco ogni volta
    // significherebbe ricostruire la ruota mentre la si gira.
    const dentro = this.values.length > 0 && this.current !== null
      && this.current >= this.finestra.min && this.current <= this.finestra.max;
    if (!dentro) {
      this.rebuild();
      this.centre('auto');
      return;
    }
    // Un valore scritto da fuori (il foglio "Che peso metto", il massimale
    // nella card) va anche fatto vedere: la ruota ci scorre. L'eco del proprio
    // scorrimento no: onScroll ha gia' portato l'indice li', e la ruota e' gia'
    // ferma su quel numero - riportarcela litigherebbe col dito.
    const i = wheelIndexOf(this.values, this.current);
    const daFuori = i !== this.index;
    this.index = i;
    if (ch['placeholder']) this.centre('auto');
    else if (daFuori) this.centre('smooth');
  }

  ngAfterViewInit(): void {
    // Al primo disegno si salta, non si scorre: un'animazione da un valore mai
    // mostrato sarebbe solo un tremolio.
    this.centre('auto');
  }

  /** Come si scrive un numero qui: virgola, e niente decimali inutili. */
  show(v: number): string {
    return v.toString().replace('.', ',');
  }

  onScroll(): void {
    const el = this.trackEl?.nativeElement;
    if (!el || this.editing) return;
    const i = wheelIndexAt(el.scrollTop, WHEEL_ITEM_H, this.values.length);
    if (i === this.index) return;
    this.index = i;
    this.valueChange.emit(this.values[i]);
    this.allunga();
  }

  /**
   * Arrivati in cima, si aggiungono altre tacche. Si aggiungono solo IN FONDO
   * all'elenco: metterne davanti sposterebbe tutti gli indici e la ruota
   * scatterebbe sotto le dita. Per scendere sotto la finestra si scrive.
   */
  private allunga(): void {
    if (this.index < this.values.length - 3) return;
    if (this.finestra.max >= this.max) return;
    this.finestra = {
      ...this.finestra,
      max: Math.min(this.max, this.finestra.max + WHEEL_NOTCHES * this.step)
    };
    this.values = wheelValues(this.finestra, this.current);
    this.cdr.detectChanges();
  }

  /** Tocco su una tacca: quella al centro si scrive, le altre ci si portano. */
  onItem(i: number): void {
    if (this.disabled) return;
    if (i === this.index) { this.edit(); return; }
    this.index = i;
    this.valueChange.emit(this.values[i]);
    this.scrollTo(i, 'smooth');
  }

  /** La ruota da tastiera: frecce e Pag per muoversi, Invio o una cifra per scrivere. */
  onKey(e: KeyboardEvent): void {
    if (this.disabled || this.editing || e.ctrlKey || e.metaKey || e.altKey) return;
    // Un tasto premuto su una tacca (col mouse) non e' per la ruota.
    if (e.target !== this.trackEl?.nativeElement) return;

    const passi: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in passi) {
      e.preventDefault();
      this.porta(this.index + passi[e.key]);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      this.edit();
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      this.edit(e.key);
    }
  }

  /** Alla tacca i, senza uscire dall'elenco. Si salta, non si scorre piano: da tastiera e' un passo, non un gesto. */
  private porta(i: number): void {
    const n = Math.max(0, Math.min(this.values.length - 1, i));
    if (n === this.index) return;
    this.index = n;
    this.valueChange.emit(this.values[n]);
    this.scrollTo(n, 'auto');
    this.allunga();
  }

  /** Apre la scrittura. Con `inizio` (una cifra premuta sulla ruota) parte da quella, senza selezionarla: la cifra dopo non deve cancellarla. */
  edit(inizio?: string): void {
    if (this.disabled) return;
    this.editing = true;
    this.draft = inizio ?? (this.current === null ? '' : this.show(this.current));
    this.cdr.detectChanges();
    const campo = this.fieldEl?.nativeElement;
    if (!campo) return;
    const posiziona = () => {
      // Il focus va dato a mano: select() non lo da' in ogni browser, e da tastiera
      // (Invio o una cifra sulla ruota) senza il campo non riceve piu' nulla.
      campo.focus({ preventScroll: true });
      if (inizio === undefined) campo.select();
      else campo.setSelectionRange(campo.value.length, campo.value.length);
    };
    posiziona();
    // ngModel scrive il valore nel campo un giro dopo: fino ad allora il campo e'
    // vuoto e la selezione non seleziona niente, la cifra successiva si accoderebbe.
    void Promise.resolve().then(posiziona);
  }

  /** Esc: si esce dalla scrittura senza toccare il valore, e il focus torna sulla ruota. */
  cancel(): void {
    if (!this.editing) return;
    this.editing = false;
    this.cdr.detectChanges();
    this.centre('auto');
    this.trackEl?.nativeElement.focus();
  }

  /** Chiude la scrittura. Un numero fuori forbice si riporta dentro, uno
   *  illeggibile lascia le cose come stavano. */
  commit(restituisciFocus = false): void {
    if (!this.editing) return;
    this.editing = false;

    const n = parseFloat(this.draft.replace(',', '.'));
    if (isFinite(n)) {
      const v = Math.min(this.max, Math.max(this.min, n));
      this.rebuild(v);
      this.index = wheelIndexOf(this.values, v);
      this.valueChange.emit(this.values[this.index]);
    }
    this.cdr.detectChanges();
    this.centre('auto');
    // Con Invio il campo sparisce con il focus dentro: senza questo la tastiera
    // ripartirebbe dall'inizio della pagina.
    if (restituisciFocus) this.trackEl?.nativeElement.focus();
  }

  private rebuild(extra?: number): void {
    const attorno = extra ?? this.current;
    this.finestra = wheelWindow(this.spec, attorno, WHEEL_NOTCHES);
    this.values = wheelValues(this.finestra, attorno);
    const i = wheelIndexOf(this.values, this.current);
    this.index = i < 0 ? 0 : i;
  }

  private centre(behavior: ScrollBehavior): void {
    // Dopo un giro di disegno: prima le tacche non esistono ancora e lo
    // scorrimento finirebbe su un contenitore vuoto.
    setTimeout(() => this.scrollTo(this.index, behavior));
  }

  private scrollTo(i: number, behavior: ScrollBehavior): void {
    this.trackEl?.nativeElement.scrollTo({ top: wheelOffsetOfIndex(i, WHEEL_ITEM_H), behavior });
  }
}
