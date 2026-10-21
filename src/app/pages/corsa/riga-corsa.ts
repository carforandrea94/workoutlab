import { RUN_EFFORT_LABELS, RUN_TYPE_LABELS, Run, RunEffort } from '../../models/run.model';
import { WeekGroup } from '../../core/utils/week-history.util';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/**
 * La fatica di un'uscita, detta due volte: con il colore e con la MISURA del
 * pallino, che cresce col peso della giornata.
 *
 * Il colore da solo non basterebbe. I tre hanno contrasto di sovrabbondanza
 * sulla card — oltre 5:1 in entrambi i temi, contro i 3:1 che servono a un
 * segno non testuale — ma le loro luminosita' sono quasi identiche, quindi
 * chi confonde le tinte vedrebbe tre pallini uguali. Il diametro e' il
 * secondo canale, e si legge anche senza colori.
 */
const EFFORT_STYLE: Record<RunEffort, { color: string; size: number }> = {
  facile: { color: 'var(--state-success)', size: 5 },
  giusta: { color: 'var(--accent)', size: 8 },
  dura: { color: 'var(--effort-hard)', size: 11 }
};

/**
 * Come si scrive una corsa in una riga, nella settimana in corso (Corsa) e
 * nelle settimane passate (Storico): le due pagine disegnano la stessa riga.
 */
export class RigaCorsa {
  /** "dom 27 · lento" — il giorno serve perche' dentro una settimana passata
   *  "domenica" da sola non dice piu' quale. */
  runLineLabel(run: Run): string {
    const d = new Date(run.date + 'T00:00:00');
    const giorno = isNaN(d.getTime())
      ? ''
      : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
    const tipo = RUN_TYPE_LABELS[run.type]?.toLowerCase() ?? '';
    return tipo ? `${giorno} · ${tipo}` : giorno;
  }

  effortColor(effort: RunEffort): string {
    return (EFFORT_STYLE[effort] ?? EFFORT_STYLE.giusta).color;
  }

  effortSize(effort: RunEffort): number {
    return (EFFORT_STYLE[effort] ?? EFFORT_STYLE.giusta).size;
  }

  effortLabel(effort: RunEffort): string {
    return RUN_EFFORT_LABELS[effort] ?? '';
  }

  runsLabel(w: WeekGroup): string {
    if (!w.runs.length) return 'nessuna uscita';
    return w.runs.length === 1 ? '1 uscita' : `${w.runs.length} uscite`;
  }
}
