import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
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
 * la barra, le corse di questa settimana, e la riga che apre lo Storico.
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

  it('le settimane passate stanno nello Storico: una riga che lo apre, con la settimana scorsa', () => {
    const { root } = monta();
    const voce = root.querySelector<HTMLElement & { detail?: boolean; button?: boolean }>('ion-list.voce-storico ion-item')!;
    expect(voce.getAttribute('routerLink') ?? voce.getAttribute('ng-reflect-router-link')).toBe('/corsa/storico');
    expect(voce.getAttribute('routerDirection')).toBe('forward');
    expect(voce.detail).toBe(true);
    expect(voce.querySelector('h2')!.textContent!.trim()).toBe('Storico');
    expect(voce.querySelector('p')!.textContent!.trim()).toBe('La settimana scorsa 45 min in 1 uscita');
  });

  it('la settimana scorsa senza corse lo dice', () => {
    const { c } = monta({ runs: [
      { id: 'r1', run: { date: todayLocalISO(), durationMin: 35, type: 'lento', effort: 'facile' } },
      { id: 'r2', run: { date: giorniFa(21), durationMin: 30, type: 'lento', effort: 'giusta' } }
    ] });
    expect(c.notaStorico).toBe('La settimana scorsa nessuna uscita');
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

  it('senza corse: "Registra corsa" in questa settimana e niente storico', () => {
    const { root, c } = monta({ runs: [] });
    expect(c.passate()).toEqual([]);
    expect(root.querySelector('ion-list.voce-storico')).toBeNull();
    expect(root.querySelectorAll('ion-list.uscite.corrente ion-item').length).toBe(1);
    expect(root.querySelector('ion-list.uscite.corrente ion-item.runadd')).not.toBeNull();
    expect(c.notaSettimana).toBe(c.weekLabel);
  });
});
