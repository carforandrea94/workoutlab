import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { todayLocalISO } from '../../core/utils/date.util';
import { RunningStateService } from '../../services/running-state.service';
import { CorsaComponent } from './corsa.component';

/** Una data locale, n giorni prima di oggi. */
const giorniFa = (n: number) => {
  const d = new Date(todayLocalISO() + 'T00:00:00'); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * La Corsa con le liste di Ionic: l'obiettivo della settimana come righe con
 * la barra e le corse di questa settimana. Lo Storico si apre dal tasto in
 * alto a destra.
 */
describe('CorsaComponent — obiettivo e settimane', () => {
  function monta(opz: { goal?: any; runs?: any[] } = {}) {
    const runs = opz.runs ?? [
      { id: 'r1', run: { date: todayLocalISO(), durationMin: 35, type: 'lento', effort: 'facile' } },
      // Sette giorni fa e' sempre nella settimana prima; otto, il lunedi', e' due settimane fa.
      { id: 'r2', run: { date: giorniFa(7), durationMin: 45, type: 'lento', effort: 'dura' } }
    ];
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CorsaComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: RunningStateService, useValue: {
          runs: signal(runs), goal: signal(opz.goal === undefined ? { weeklyMinutes: 120, weeklyRuns: 3, note: 'Corsa lenta.' } : opz.goal),
          loaded: signal(true), thisWeek: signal({ minutes: 35, runs: 1 }), refresh: vi.fn(async () => {})
        } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const testo = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, '').trim() ?? null;
    return { fixture, root, nav, testo, c: fixture.componentInstance };
  }

  it('l\'obiettivo: minuti e uscite fatti su previsti, con la barra che lo dice anche a parole', () => {
    const { root, testo } = monta();
    expect(testo(root.querySelector('ion-item.obiettivo-minuti ion-note'))).toBe('35/120min');
    expect(testo(root.querySelector('ion-item.obiettivo-uscite ion-note'))).toBe('1/3');
    expect(root.querySelector('ion-item.obiettivo-minuti ion-progress-bar')!.getAttribute('aria-valuetext')).toBe('35 minuti su 120');
    expect(root.querySelector('ion-item.obiettivo-nota p')!.textContent!.trim()).toBe('Corsa lenta.');
  });

  it('senza obiettivo il gruppo dell\'obiettivo non c\'e\'', () => {
    const { root } = monta({ goal: null });
    expect(root.querySelector('ion-list.obiettivo')).toBeNull();
  });

  it('la settimana in corso: le sue corse, e niente fisarmonica (e niente voci in sola lettura)', () => {
    const { root, testo } = monta();
    const corrente = root.querySelector<HTMLElement>('ion-list.uscite.corrente')!;
    // In sola lettura Ionic spegne i tocchi anche del contenuto (pointer-events:none):
    // "Registra" e le corse di questa settimana stavano li' dentro e non rispondevano.
    expect(root.querySelector('ion-accordion')).toBeNull();
    expect(testo(corrente.querySelector('ion-item.runline ion-note'))).toBe('35min');
    expect(corrente.querySelectorAll('ion-item.runline').length).toBe(1);
    // Il titolo e' il testo dell'etichetta senza la nota (in jsdom textContent di
    // ion-label torna vuoto: Stencil ne riscrive gli accessori per gli slot).
    const titoli = Array.from(root.querySelectorAll('ion-list-header.sezione ion-label'))
      .map(e => e.innerHTML.replace(/<span class="sezione-nota">.*?<\/span>/, '').replace(/<[^>]*>/g, '').trim());
    expect(titoli).toEqual(['Questa settimana']);
  });

  it('lo Storico si apre solo dal tasto con l\'icona in alto a destra, come nella Scheda', () => {
    const { root } = monta();
    const tasti = Array.from(root.querySelectorAll<HTMLElement>('ion-header:not([collapse]) ion-buttons[slot=end] ion-button.navicon'));
    expect(tasti.length).toBe(1);
    expect(tasti[0].getAttribute('routerLink')).toBe('/corsa/storico');
    expect(tasti[0].getAttribute('routerDirection')).toBe('forward');
    expect(tasti[0].getAttribute('aria-label')).toBe('Storico');
    expect(tasti[0].querySelector('app-icona')!.getAttribute('name')).toBe('time');
    // Nella pagina non c'e' altro che porti allo storico: niente riga, niente settimane passate.
    expect(root.querySelector('ion-content [routerLink="/corsa/storico"]')).toBeNull();
    expect(root.querySelector('ion-list.voce-storico')).toBeNull();
    expect(root.querySelector('ion-accordion')).toBeNull();
  });

  it('il tasto c\'e\' anche senza corse passate: lo Storico dice da se\' che e\' vuoto', () => {
    const { root } = monta({ runs: [] });
    expect(root.querySelector('ion-buttons[slot=end] ion-button.navicon[routerLink="/corsa/storico"]')).not.toBeNull();
  });

  it('una corsa e\' una riga: giorno e tipo, fatica sotto, minuti a destra; toccata si modifica', () => {
    const { root, nav } = monta();
    const riga = root.querySelector<HTMLElement>('ion-list.uscite.corrente ion-item.runline')!;
    expect(riga.querySelector('ion-label p')!.textContent!.trim()).toBe('Facile');
    // La fatica si legge anche dalla misura del pallino, non solo dal colore.
    expect(riga.querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('5px');
    riga.click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/corsa/nuova'], { queryParams: { id: 'r1' } });
  });

  it('"Registra corsa" e\' una riga d\'azione senza chevron, da oggi', () => {
    const { root, nav } = monta();
    const aggiungi = root.querySelector<HTMLElement & { detail?: boolean }>('ion-list.uscite.corrente ion-item.runadd')!;
    expect(aggiungi.textContent!.trim()).toBe('Registra corsa');
    expect(aggiungi.detail).toBe(false);
    aggiungi.click();
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: todayLocalISO() } });
    expect(root.textContent).not.toContain('Registra un\'uscita');
  });

  it('accanto a "Questa settimana" l\'intervallo; senza obiettivo anche corse e minuti', () => {
    const conObiettivo = monta();
    expect(conObiettivo.c.notaSettimana).toBe(conObiettivo.c.weekLabel);
    TestBed.resetTestingModule();
    const senza = monta({ goal: null });
    expect(senza.c.notaSettimana).toBe(`${senza.c.weekLabel} · 1 uscita · 35 min`);
    expect(senza.root.querySelector('ion-list-header.sezione .sezione-nota')!.textContent).toBe(senza.c.notaSettimana);
  });

  it('senza corse: "Registra corsa" in questa settimana', () => {
    const { root, c } = monta({ runs: [] });
    expect(root.querySelectorAll('ion-list.uscite.corrente ion-item').length).toBe(1);
    expect(root.querySelector('ion-list.uscite.corrente ion-item.runadd')).not.toBeNull();
    expect(c.notaSettimana).toBe(c.weekLabel);
  });
});

/**
 * A mezzanotte fra domenica e lunedi', con la Corsa aperta: la settimana in
 * corso diventa quella nuova, vuota, senza toccare niente.
 */
describe('CorsaComponent — a mezzanotte', () => {
  afterEach(() => vi.useRealTimers());

  it('le corse di domenica passano alla settimana scorsa, e "Questa settimana" riparte', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 25, 23, 59, 30));
    TestBed.configureTestingModule({
      imports: [CorsaComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: { navigateForward: vi.fn() } },
        { provide: RunningStateService, useValue: {
          runs: signal([{ id: 'r1', run: { date: '2026-10-25', durationMin: 35, type: 'lento', effort: 'facile' } }]),
          goal: signal(null), loaded: signal(true), thisWeek: signal({ minutes: 35, runs: 1 }), refresh: vi.fn(async () => {})
        } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const righe = () => root.querySelectorAll('ion-list.uscite.corrente ion-item.runline').length;
    const nota = () => root.querySelector('ion-list-header.sezione .sezione-nota')!.textContent;
    expect(righe()).toBe(1);
    expect(nota()).toBe('19 – 25 ott · 1 uscita · 35 min');

    // Nessun tocco e nessun detectChanges.
    vi.advanceTimersByTime(31_000);
    expect(righe()).toBe(0);
    expect(nota()).toBe('26 ott – 1 nov · nessuna uscita');
  });
});
