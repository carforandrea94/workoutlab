import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { WorkoutSession } from '../../models/workout.model';
import { buildSessionSummary } from '../../core/utils/session-summary.util';
import { formatKg, sessionTonnage } from '../../core/utils/tonnage.util';
import { raggioDi, SCALA_RAGNATELA } from '../ragnatela/ragnatela.component';
import { ResocontoComponent, dataCorta, dataLunga, durata, testoDelta } from './resoconto.component';

type Riga = [string | null, string | null, boolean];

function seduta(date: string, esercizi: [string, Riga[]][], durationSec = 4477): WorkoutSession {
  return {
    dayId: 'd1', dayLabel: 'Petto-Spalle-Tricipiti', date, durationSec,
    exercises: esercizi.map(([name, sets]) => ({ name, sets: sets.map(([load, reps, done]) => ({ load, reps, done })) }))
  };
}

/** La seduta dello screenshot: tre record, uno in calo, tre uguali. */
const OGGI = seduta('2026-10-20', [
  ['PANCA A 45°', [['50', '5', true], ['50', '5', true]]],
  ['CROCI AI CAVI', [['20', '12', true]]],
  ['DISTENSIONI MANUBRI', [['22,5', '12', true]]],
  ['MILITARY PRESS', [['32,5', '8', true]]],
  ['ALZATE LATERALI', [['17', '12', true]]],
  ['PUSH DOWN', [['25', '10', true]]],
  ['FRENCH PRESS', [['27,5', '9', true]]],
  ['CRUNCH', [['1', '50', true]]]
]);
const PRIMA = seduta('2026-10-12', [
  ['PANCA A 45°', [['30', '8', true], ['30', '8', true]]],
  ['CROCI AI CAVI', [['20', '12', true]]],
  ['DISTENSIONI MANUBRI', [['25', '8', true]]],
  ['MILITARY PRESS', [['35', '6', true]]],
  ['ALZATE LATERALI', [['15', '12', true]]],
  ['PUSH DOWN', [['27,5', '10', true]]],
  ['FRENCH PRESS', [['30', '7', true]]],
  ['CRUNCH', [['1', '20', true]]]
]);

describe('ResocontoComponent — il resoconto di una seduta (disegno vero)', () => {
  function monta(oggi: WorkoutSession, prima: WorkoutSession | null, testa = false) {
    TestBed.configureTestingModule({ imports: [ResocontoComponent], providers: [...providerPagina()] });
    const fixture = TestBed.createComponent(ResocontoComponent);
    fixture.componentRef.setInput('resoconto', buildSessionSummary(oggi, prima));
    fixture.componentRef.setInput('testa', testa);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const tutti = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const testo = (sel: string) => tutti(sel).map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    const aggiorna = () => fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, root, tutti, testo, aggiorna };
  }

  it('a fine allenamento, in testa "Allenamento salvato", il giorno e la durata', () => {
    const { testo } = monta(OGGI, PRIMA, true);
    expect(testo('.res-title')).toEqual(['Allenamento salvato']);
    expect(testo('.res-sub')).toEqual(['Martedì 20 ottobre · 1:14:37']);
  });

  it('nello storico niente testa: data e durata le dice gia\' la pagina', () => {
    expect(monta(OGGI, PRIMA).tutti('.res-head').length).toBe(0);
  });

  it('i tre numeri: serie, volume col confronto scritto per intero, record', () => {
    const { testo } = monta(OGGI, PRIMA);
    const differenza = sessionTonnage(OGGI) - sessionTonnage(PRIMA);
    expect(testo('.res-cap')).toEqual(['Serie', 'Volume', 'Record']);
    expect(testo('.res-val')).toEqual(['9/9', `${formatKg(sessionTonnage(OGGI))}kg`, '3su 8']);
    expect(testo('.res-nota')).toEqual([
      'tutte fatte',
      `${differenza > 0 ? '+' : '−'}${formatKg(Math.abs(differenza))} kg rispetto al 12/10`,
      'hai alzato l\'asticella'
    ]);
  });

  it('la sintesi conta chi e\' migliorato e chi e\' calato', () => {
    const { testo } = monta(OGGI, PRIMA);
    expect(testo('ion-list-header.sezione')[0]).toBe('Rispetto al 12 ottobre');
    expect(testo('.rag-sintesi')).toEqual(['Più forte in 4 esercizi su 8, in calo in 1.']);
  });

  it('esercizio per esercizio: il numero, la serie migliore, prima, la variazione e il record', () => {
    const { tutti, testo } = monta(OGGI, PRIMA);
    const righe = tutti('ion-list ion-item');
    expect(righe.length).toBe(8);
    expect(testo('ion-list ion-item ion-avatar')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(testo('ion-list ion-item h2')[0]).toBe('PANCA A 45°');
    expect(testo('ion-list ion-item p')[0]).toBe('50 kg × 5 · prima 30 kg × 8');
    expect(testo('ion-list .delta')).toEqual(['+53%', 'uguale', '+5%', 'uguale', '+14%', '−8%', 'uguale', '+30 rip.']);
    // Verde il numero di chi e' migliorato, e la freccia: mai il colore da solo.
    expect(righe.map(r => r.querySelector('ion-avatar')!.classList.contains('su'))).toEqual([true, false, true, false, true, false, false, true]);
    expect(righe.map(r => !!r.querySelector('app-icona[name="arrow-up"]'))).toEqual([true, false, true, false, true, false, false, true]);
    expect(righe.map(r => !!r.querySelector('app-icona[name="arrow-down"]'))).toEqual([false, false, false, false, false, true, false, false]);
    expect(righe.map(r => r.querySelector('ion-badge')?.textContent?.trim() ?? '')).toEqual(['Record', '', '', '', 'Record', '', '', 'Record']);
    expect(testo('.res-piede')[0]).toContain('oltre le 12 ripetizioni contano le ripetizioni');
  });

  it('la ragnatela: un numero per esercizio, pulsanti veri con nome e variazione', () => {
    const { tutti } = monta(OGGI, PRIMA);
    const numeri = tutti('app-ragnatela button.rag-numero');
    expect(numeri.map(b => b.textContent?.trim())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(numeri[0].getAttribute('aria-label')).toBe('1. PANCA A 45°: +53% rispetto al 12 ottobre');
    expect(numeri.map(b => b.classList.contains('su'))).toEqual([true, false, true, false, true, false, false, true]);
    expect(numeri.map(b => b.classList.contains('giu'))).toEqual([false, false, false, false, false, true, false, false]);
    // Il disegno e' nascosto allo screen reader: le stesse cifre le ha l'elenco.
    expect(tutti('app-ragnatela svg')[0].getAttribute('aria-hidden')).toBe('true');
    // La volta scorsa e' il tratteggio; oggi il poligono pieno, con un vertice per esercizio.
    expect(tutti('app-ragnatela polygon.rag-oggi')[0].getAttribute('points')!.split(' ').length).toBe(8);
    expect(tutti('app-ragnatela polygon.rag-prima').length).toBe(1);
  });

  it('oltre il +30% la punta si ferma al bordo e diventa una freccia', () => {
    const { tutti } = monta(OGGI, PRIMA);
    // Panca (+53%) e crunch (+150%): due frecce, gli altri sei punti.
    expect(tutti('app-ragnatela polygon.rag-punto').length).toBe(2);
    expect(tutti('app-ragnatela circle.rag-punto').length).toBe(6);
    expect(raggioDi(1.5)).toBe(raggioDi(SCALA_RAGNATELA));
    expect(raggioDi(-0.9)).toBe(raggioDi(-SCALA_RAGNATELA));
    expect(raggioDi(0)).toBeGreaterThan(raggioDi(-0.15));
    expect(raggioDi(0.15)).toBeGreaterThan(raggioDi(0));
  });

  it('il dettaglio parte dal piu\' migliorato; toccando un numero si passa a quello', () => {
    const { tutti, testo, aggiorna } = monta(OGGI, PRIMA);
    expect(testo('.rag-dett-t')).toEqual(['CRUNCH50 ripetizioni · prima 20']);
    expect(tutti('button.rag-numero')[7].getAttribute('aria-pressed')).toBe('true');
    tutti('button.rag-numero')[0].click();
    aggiorna();
    expect(testo('.rag-dett-t')).toEqual(['PANCA A 45°Massimale 56,5 kg · prima 37 kg']);
    expect(testo('.rag-dett .delta')).toEqual(['+53%']);
    expect(tutti('button.rag-numero')[0].getAttribute('aria-pressed')).toBe('true');
    expect(tutti('button.rag-numero')[7].getAttribute('aria-pressed')).toBe('false');
  });

  it('Volume cambia la misura della ragnatela e dell\'elenco insieme', () => {
    const { c, testo, tutti, aggiorna } = monta(OGGI, PRIMA);
    c.cambiaMetrica('volume');
    aggiorna();
    // Carico per ripetizioni: 2 × 50 × 5 = 500 contro 2 × 30 × 8 = 480, e cosi' via. Il crunch ha 1 kg: ha un volume.
    expect(testo('ion-list .delta')).toEqual(['+4%', 'uguale', '+35%', '+24%', '+13%', '−9%', '+18%', '+150%']);
    expect(testo('.rag-sintesi')).toEqual(['Più volume in 6 esercizi su 8, meno in 1.']);
    expect(testo('.res-piede')[0]).toBe('Il volume è il carico per le ripetizioni delle serie fatte.');
    // A corpo libero non c'e' volume: la riga lo dice.
    const dip = (d: string, r: string) => seduta(d, [['PANCA', [['60', '8', true]]], ['DIP', [[null, r, true]]]]);
    expect(buildSessionSummary(dip('2026-10-20', '12'), dip('2026-10-12', '10')).esercizi[1].volume).toBeNull();
    expect(tutti('.rag-dett-t')[0].textContent).toContain('kg sollevati · prima');
    c.cambiaMetrica('niente');
    expect(c.metrica()).toBe('volume');
  });

  it('la prima volta su un giorno: niente ragnatela, e lo dice', () => {
    const { tutti, testo } = monta(OGGI, null);
    expect(tutti('app-ragnatela').length).toBe(0);
    expect(tutti('.rag-card').length).toBe(0);
    expect(testo('.res-prima-volta')[0]).toContain('prima volta che fai questo giorno');
    expect(testo('.res-nota')).toEqual(['tutte fatte', 'prima volta su questo giorno', 'si parte da qui']);
    // Le righe dicono quello che si e' fatto, senza "prima" e senza variazioni.
    expect(testo('ion-list ion-item p')[0]).toBe('50 kg × 5');
    expect(tutti('ion-list .delta').length).toBe(0);
    expect(tutti('.res-piede').length).toBe(0);
  });

  it('con meno di tre esercizi da confrontare non c\'e\' ragnatela, ma il resto si', () => {
    const due = (d: string, l: string) => seduta(d, [['PANCA', [[l, '8', true]]], ['DIP', [[null, '10', true]]]]);
    const { tutti, testo } = monta(due('2026-10-20', '60'), due('2026-10-12', '55'));
    expect(tutti('app-ragnatela').length).toBe(0);
    expect(testo('.rag-sintesi')).toEqual(['Più forte in 1 esercizio su 2.']);
    expect(tutti('.rag-dett').length).toBe(1);
  });

  it('un esercizio senza confronto sta nell\'elenco, non nella ragnatela', () => {
    const conNuovo = seduta('2026-10-20', [...OGGI.exercises.map(e => [e.name, e.sets.map(x => [x.load, x.reps, x.done])] as [string, Riga[]]), ['PULLEY', [['50', '10', true]]]]);
    const { tutti, testo } = monta(conNuovo, PRIMA);
    expect(tutti('ion-list ion-item').length).toBe(9);
    expect(testo('ion-list .delta')[8]).toBe('nuovo');
    // Otto raggi, coi numeri dell'elenco: il 9 non c'e'.
    expect(tutti('button.rag-numero').map(b => b.textContent?.trim())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(tutti('polygon.rag-oggi')[0].getAttribute('points')).not.toContain('NaN');
  });

  it('in Volume un esercizio a corpo libero dice perche\' non ha confronto', () => {
    const dip = (d: string, r: string) => seduta(d, [['PANCA', [['60', '8', true]]], ['DIP', [[null, r, true]]]]);
    const { c, testo, aggiorna } = monta(dip('2026-10-20', '12'), dip('2026-10-12', '10'));
    expect(testo('ion-list .delta')).toEqual(['uguale', '+2 rip.']);
    c.cambiaMetrica('volume');
    aggiorna();
    expect(testo('ion-list .delta')).toEqual(['uguale', 'corpo libero']);
  });

  it('un esercizio nuovo e\' segnato come nuovo; le serie lasciate indietro si contano', () => {
    const oggi = seduta('2026-10-20', [['PANCA', [['60', '8', true], ['60', '8', false]]], ['PULLEY', [['50', '10', true]]]]);
    const prima = seduta('2026-10-12', [['PANCA', [['60', '8', true]]]]);
    const { testo } = monta(oggi, prima);
    expect(testo('ion-list .delta')).toEqual(['uguale', 'nuovo']);
    expect(testo('.res-nota')[0]).toBe('1 lasciata indietro');
    expect(testo('.res-nota')[2]).toBe('stavolta nessuno');
  });
});

describe('ResocontoComponent — come si scrivono le cose', () => {
  it('date e durata', () => {
    expect(dataLunga('2026-10-12')).toBe('12 ottobre');
    expect(dataCorta('2026-10-02')).toBe('02/10');
    expect(dataLunga('')).toBe('');
    expect(durata(4477)).toBe('1:14:37');
    expect(durata(605)).toBe('10:05');
  });

  it('la variazione: per cento, ripetizioni, uguale, niente', () => {
    expect(testoDelta({ oggi: 113, prima: 100, unita: 'kg' })).toBe('+13%');
    expect(testoDelta({ oggi: 91, prima: 100, unita: 'kg' })).toBe('−9%');
    expect(testoDelta({ oggi: 101, prima: 100, unita: 'kg' })).toBe('uguale');
    expect(testoDelta({ oggi: 50, prima: 20, unita: 'rip' })).toBe('+30 rip.');
    expect(testoDelta({ oggi: 8, prima: 10, unita: 'rip' })).toBe('−2 rip.');
    expect(testoDelta({ oggi: 50, prima: null, unita: 'kg' })).toBe('');
    expect(testoDelta(null)).toBe('');
  });
});
