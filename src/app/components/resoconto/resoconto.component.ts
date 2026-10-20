import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IonAvatar, IonBadge, IonItem, IonLabel, IonList, IonListHeader, IonSegment, IonSegmentButton } from '@ionic/angular';
import { IconaComponent } from '../icona/icona.component';
import { AsseRagnatela, RagnatelaComponent } from '../ragnatela/ragnatela.component';
import {
  Andamento, ConfrontoEsercizio, Misura, SessionSummary, andamento, variazione
} from '../../core/utils/session-summary.util';
import { formatKg } from '../../core/utils/tonnage.util';
import { MAX_TRUSTED_REPS } from '../../core/utils/load-estimate.util';

export type Metrica = 'forza' | 'volume';

/** Una riga dell'elenco: l'esercizio, il suo numero e com'e' andata nella metrica scelta. */
export interface RigaResoconto {
  n: number;
  e: ConfrontoEsercizio;
  misura: Misura | null;
  andamento: Andamento | null;
  /** "+13%", "+30 rip.", "uguale"; '' senza confronto. */
  delta: string;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function giorno(iso: string): Date | null {
  const d = new Date(iso + 'T00:00:00');
  return iso && !isNaN(d.getTime()) ? d : null;
}

/** "20 ottobre" */
export function dataLunga(iso: string): string {
  const d = giorno(iso);
  return d ? `${d.getDate()} ${MESI[d.getMonth()]}` : '';
}

/** "20/10" */
export function dataCorta(iso: string): string {
  const d = giorno(iso);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '';
}

/** "1:14:37", come il cronometro della sessione. */
export function durata(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

const segno = (n: number) => (n > 0 ? '+' : '−');
const virgola = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La variazione come si legge in una riga: per cento, o ripetizioni quando la forza sono le ripetizioni. */
export function testoDelta(m: Misura | null): string {
  const a = andamento(m);
  if (!m || a === null || m.prima === null) return '';
  if (a === 'pari') return 'uguale';
  if (m.unita === 'rip') return `${segno(m.oggi - m.prima)}${Math.abs(m.oggi - m.prima)} rip.`;
  return `${segno(m.oggi - m.prima)}${Math.round(Math.abs(variazione(m)!) * 100)}%`;
}

const esercizi = (n: number) => (n === 1 ? '1 esercizio' : `${n} esercizi`);

/**
 * Il resoconto di una seduta: alla fine dell'allenamento, e nello storico per
 * ogni seduta passata. Prima era una pagina mezza vuota con due riquadri e una
 * lista dei record; ora dice com'e' andata esercizio per esercizio rispetto
 * all'ultima volta che si era fatto lo stesso giorno.
 *
 * In alto i tre numeri (serie, volume, record), poi la ragnatela con un raggio
 * per esercizio e, sotto, l'elenco: che e' anche la tabella della ragnatela,
 * con le stesse cifre, per chi non la guarda o non la vede. Forza e Volume
 * cambiano la misura di tutti e due insieme.
 *
 * La prima volta che si fa un giorno non c'e' niente da confrontare: niente
 * ragnatela, solo quello che si e' fatto.
 */
@Component({
  selector: 'app-resoconto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonList, IonListHeader, IonItem, IonLabel, IonAvatar, IonBadge, IonSegment, IonSegmentButton, IconaComponent, RagnatelaComponent],
  templateUrl: './resoconto.component.html'
})
export class ResocontoComponent {
  readonly resoconto = input.required<SessionSummary>();
  /** In testa "Allenamento salvato" con data e durata: a fine allenamento. Nello storico data e durata le dice gia' la pagina. */
  readonly testa = input(false);

  readonly metrica = signal<Metrica>('forza');
  /** L'esercizio scelto nella ragnatela (indice in `assi`); null = il piu' migliorato. */
  private readonly sceltoAMano = signal<number | null>(null);

  readonly limiteRip = MAX_TRUSTED_REPS;
  readonly confronto = computed(() => !!this.resoconto().previousDate);
  readonly prima = computed(() => dataLunga(this.resoconto().previousDate));

  readonly righe = computed<RigaResoconto[]>(() => {
    const forza = this.metrica() === 'forza';
    return this.resoconto().esercizi.map((e, i) => {
      const misura = forza ? e.forza : e.volume;
      return { n: i + 1, e, misura, andamento: andamento(misura), delta: testoDelta(misura) };
    });
  });

  /** I raggi: gli esercizi che nella metrica scelta hanno un confronto. */
  readonly assi = computed<(AsseRagnatela & { riga: RigaResoconto })[]>(() =>
    this.righe()
      .filter(r => r.andamento !== null)
      .map(r => ({ n: r.n, nome: r.e.nome, v: variazione(r.misura)!, andamento: r.andamento!, testo: r.delta, riga: r }))
  );

  readonly scelto = computed(() => {
    const assi = this.assi();
    if (!assi.length) return null;
    const mano = this.sceltoAMano();
    if (mano !== null && mano < assi.length) return mano;
    return assi.reduce((best, a, i) => (a.v > assi[best].v ? i : best), 0);
  });

  readonly dettaglio = computed(() => {
    const i = this.scelto();
    return i === null ? null : this.assi()[i];
  });

  readonly conti = computed(() => {
    const a = this.assi();
    return { su: a.filter(x => x.andamento === 'su').length, giu: a.filter(x => x.andamento === 'giu').length, tot: a.length };
  });

  /** "Più forte in 4 esercizi su 8, in calo in 1." */
  readonly sintesi = computed(() => {
    const { su, giu, tot } = this.conti();
    const forza = this.metrica() === 'forza';
    if (!tot) return { prima: '', forte: '', resto: 'Nessun esercizio da confrontare.' };
    if (su) {
      return {
        forte: `${esercizi(su)} su ${tot}`,
        prima: forza ? 'Più forte in ' : 'Più volume in ',
        resto: giu ? `, ${forza ? 'in calo' : 'meno'} in ${giu}.` : '.'
      };
    }
    if (giu) return { prima: '', forte: '', resto: `${forza ? 'In calo' : 'Meno volume'} in ${esercizi(giu)} su ${tot}, ${tot - giu === 0 ? 'nessuno uguale' : 'gli altri uguali'}.` };
    return { prima: '', forte: '', resto: `Tutto come il ${this.prima()}.` };
  });

  readonly quando = computed(() => {
    const r = this.resoconto();
    const d = giorno(r.date);
    const data = d ? `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}` : '';
    return [data, r.durationSec > 0 ? durata(r.durationSec) : ''].filter(Boolean).join(' · ');
  });

  readonly volume = computed(() => formatKg(this.resoconto().volumeKg));

  readonly notaVolume = computed(() => {
    const r = this.resoconto();
    if (r.volumeDeltaKg === null) return 'prima volta su questo giorno';
    const quando = dataCorta(r.previousDate);
    if (r.volumeDeltaKg === 0) return `uguale al ${quando}`;
    return `${segno(r.volumeDeltaKg)}${formatKg(Math.abs(r.volumeDeltaKg))} kg rispetto al ${quando}`;
  });

  readonly notaSerie = computed(() => {
    const r = this.resoconto();
    const mancano = r.setsTotal - r.setsDone;
    return mancano <= 0 ? 'tutte fatte' : mancano === 1 ? '1 lasciata indietro' : `${mancano} lasciate indietro`;
  });

  readonly notaRecord = computed(() => {
    if (!this.confronto()) return 'si parte da qui';
    return this.resoconto().records.length ? 'hai alzato l\'asticella' : 'stavolta nessuno';
  });

  /** La riga sotto la ragnatela per l'esercizio scelto. */
  misuraDettaglio(m: Misura | null): string {
    if (!m || m.prima === null) return '';
    if (this.metrica() === 'volume') return `${formatKg(m.oggi)} kg sollevati · prima ${formatKg(m.prima)}`;
    if (m.unita === 'rip') return `${m.oggi} ripetizioni · prima ${m.prima}`;
    return `Massimale ${virgola(m.oggi)} kg · prima ${virgola(m.prima)} kg`;
  }

  cambiaMetrica(v: unknown): void {
    if (v !== 'forza' && v !== 'volume') return;
    this.metrica.set(v);
    this.sceltoAMano.set(null);
  }

  scegli(i: number): void {
    this.sceltoAMano.set(i);
  }
}
