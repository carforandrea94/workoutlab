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
 * la barra, e lo storico come fisarmonica raggruppata, con la settimana in
 * corso sempre aperta.
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
    const settimane = () => Array.from(root.querySelectorAll<HTMLElement & { value?: string; readonly?: boolean }>('ion-accordion.week'));
    const gruppo = () => root.querySelector<HTMLElement & { value?: string[]; multiple?: boolean }>('ion-accordion-group.settimane')!;
    const testo = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, '').trim() ?? null;
    return { fixture, root, nav, settimane, gruppo, testo, c: fixture.componentInstance };
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

  it('la settimana in corso sta per conto suo, fuori dalla fisarmonica: niente voci in sola lettura', () => {
    const { root, testo } = monta();
    const corrente = root.querySelector<HTMLElement>('ion-list.uscite.corrente')!;
    // In sola lettura Ionic spegne i tocchi anche del contenuto (pointer-events:none):
    // "Registra" e le corse di questa settimana stavano li' dentro e non rispondevano.
    expect(corrente.closest('ion-accordion')).toBeNull();
    expect(Array.from(root.querySelectorAll<HTMLElement & { readonly?: boolean }>('ion-accordion')).some(a => a.readonly)).toBe(false);
    expect(testo(corrente.querySelector('ion-item.runline ion-note'))).toBe('35min');
    expect(corrente.querySelectorAll('ion-item.runline').length).toBe(1);
    // Il titolo e' il testo dell'etichetta senza la nota (in jsdom textContent di
    // ion-label torna vuoto: Stencil ne riscrive gli accessori per gli slot).
    const titoli = Array.from(root.querySelectorAll('ion-list-header.sezione ion-label'))
      .map(e => e.innerHTML.replace(/<span class="sezione-nota">.*?<\/span>/, '').replace(/<[^>]*>/g, '').trim());
    expect(titoli).toEqual(['Questa settimana', 'Storico']);
  });

  it('lo storico ha solo le settimane passate, che si aprono toccandole, anche piu\' d\'una', () => {
    const { settimane, gruppo, c, fixture } = monta();
    expect(settimane().length).toBe(1);
    expect(settimane()[0].value).toBe(c.passate()[0].mondayISO);
    expect(c.passate().every(w => !w.isCurrent)).toBe(true);
    expect(gruppo().getAttribute('expand')).toBe('inset');
    expect(gruppo().multiple).toBe(true);
    expect(gruppo().value).toEqual([]);
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [settimane()[0].value] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([settimane()[0].value]);
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([]);
  });

  it('una corsa e\' una riga: giorno e tipo, fatica sotto, minuti a destra; toccata si modifica', () => {
    const { root, settimane, nav } = monta();
    const riga = root.querySelector<HTMLElement>('ion-list.uscite.corrente ion-item.runline')!;
    expect(riga.querySelector('ion-label p')!.textContent!.trim()).toBe('Facile');
    // La fatica si legge anche dalla misura del pallino, non solo dal colore.
    expect(riga.querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('5px');
    expect(settimane()[0].querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('11px');
    riga.click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/corsa/nuova'], { queryParams: { id: 'r1' } });
  });

  it('"Registra corsa" e\' una riga d\'azione senza chevron: da oggi in questa settimana, dalla domenica in una passata', () => {
    const { root, settimane, nav, c } = monta();
    const aggiungi = root.querySelector<HTMLElement & { detail?: boolean }>('ion-list.uscite.corrente ion-item.runadd')!;
    expect(aggiungi.textContent!.trim()).toBe('Registra corsa');
    expect(aggiungi.detail).toBe(false);
    aggiungi.click();
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: todayLocalISO() } });
    const passata = settimane()[0].querySelector<HTMLElement>('ion-item.runadd')!;
    expect(passata.textContent!.trim()).toBe('Registra corsa');
    passata.click();
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: c.passate()[0].sundayISO } });
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
    expect(root.querySelector('ion-accordion-group')).toBeNull();
    expect(root.querySelectorAll('ion-list.uscite.corrente ion-item').length).toBe(1);
    expect(root.querySelector('ion-list.uscite.corrente ion-item.runadd')).not.toBeNull();
    expect(c.notaSettimana).toBe(c.weekLabel);
  });
});
