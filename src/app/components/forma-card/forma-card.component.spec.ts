import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { AuthService } from '../../core/services/auth.service';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { RunningStateService } from '../../services/running-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { formatKg } from '../../core/utils/tonnage.util';
import { FormaCardComponent } from './forma-card.component';

@Component({ standalone: true, template: '' })
class Vuota {}

/**
 * Il riepilogo dell'Account come righe di lista iOS: il nome a sinistra, il
 * valore a destra; una riga senza valore dice cosa le serve e porta dove si
 * rimedia.
 */
describe('FormaCardComponent — le righe', () => {
  async function monta(opz: { profilo?: any; storico?: any[] } = {}) {
    const rotte = ['account/misure', 'account/misure/peso', 'account/misure/pliche', 'account/impostazioni'].map(path => ({ path, component: Vuota }));
    TestBed.configureTestingModule({
      imports: [FormaCardComponent],
      providers: [
        ...providerPagina(rotte),
        { provide: AuthService, useValue: { currentUser: signal(opz.profilo ?? { displayName: 'Andrea' }) } },
        { provide: MeasurementDataService, useValue: {
          loadHistory: async () => opz.storico ?? [],
          parseMeasureValue: (raw: string | null | undefined) => raw ? parseFloat(raw.replace(',', '.')) : null,
          formatMeasureNumber: (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
        } },
        { provide: WorkoutSessionsService, useValue: { listAll: async () => [] } },
        { provide: WorkoutDataService, useValue: { days: [{ id: 'd1', label: 'Petto' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }] } },
        { provide: WeeklyProgressService, useValue: { refresh: async () => {}, doneDayIds: signal(new Set(['d1'])) } },
        { provide: RunningStateService, useValue: { refresh: async () => {}, thisWeek: signal({ minutes: 75, runs: 2 }), goal: signal({ weeklyMinutes: 120 }) } }
      ]
    });
    const fixture = TestBed.createComponent(FormaCardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const riga = (titolo: string) => Array.from(root.querySelectorAll<HTMLElement>('ion-item'))
      .find(i => i.querySelector('ion-label h2')?.textContent?.trim() === titolo)!;
    const testo = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, '').trim() ?? null;
    const valore = (titolo: string) => testo(riga(titolo)?.querySelector('ion-note'));
    const sotto = (titolo: string) => riga(titolo)?.querySelector('ion-label p')?.textContent?.trim() ?? null;
    return { fixture, root, riga, valore, sotto, router: TestBed.inject(Router) };
  }

  it('i gruppi sono liste iOS con la loro intestazione', async () => {
    const { root } = await monta();
    expect(Array.from(root.querySelectorAll('ion-list-header')).map(h => h.textContent!.trim())).toEqual(['Il corpo', 'Il lavoro', 'Tonnellaggio']);
    expect(root.querySelectorAll('ion-list[inset]').length + root.querySelectorAll('ion-list.list-inset').length).toBeGreaterThan(0);
  });

  it('il corpo: i valori, senza altezza e sesso (stanno in Impostazioni), e in fondo le misure', async () => {
    const { root } = await monta({ profilo: { displayName: 'Andrea', heightCm: 180, sex: 'm' } });
    const titoli = Array.from(root.querySelectorAll('ion-list.forma-corpo > ion-item ion-label h2')).map(h => h.textContent!.trim());
    expect(titoli).toEqual(['Peso', 'BMI', 'Massa grassa', 'FFMI', 'Misure']);
  });

  it('la riga Misure apre le misure, col chevron', async () => {
    const { riga, router, fixture } = await monta();
    const misure = riga('Misure');
    expect(misure.querySelector('ion-label p')!.textContent!.trim()).toBe('Peso, centimetri e pliche, con andamento e storico');
    expect([(misure as any).button, (misure as any).detail]).toEqual([true, true]);
    misure.click();
    await fixture.whenStable();
    expect(router.url).toBe('/account/misure');
  });

  it('con i dati: il valore a destra, l\'unita\' accanto, cosa vuol dire sotto il nome', async () => {
    const { valore, sotto, riga } = await monta({
      profilo: { displayName: 'Andrea', heightCm: 180, sex: 'm' },
      storico: [{ date: '2026-10-17', peso: '82' }, { date: '2026-10-10', peso: '81,6' }]
    });
    expect(valore('Peso')).toBe('82kg');
    expect(sotto('Peso')).toBe('+0,4 kg dall\'ultima pesata');
    expect(valore('BMI')).toBe('25,3');
    // Una riga col suo valore non porta da nessuna parte.
    expect((riga('Peso') as any).button).toBeFalsy();
    expect((riga('BMI') as any).button).toBeFalsy();
  });

  it('il lavoro della settimana: giorni fatti su previsti, sedute, minuti di corsa', async () => {
    const { valore, sotto } = await monta();
    expect(valore('Questa settimana')).toBe('1/3');
    expect(sotto('Questa settimana')).toBe('ne mancano 2');
    expect(valore('Sedute')).toBe('0tot.');
    expect(sotto('Sedute')).toBe('la prima è quella che costa');
    expect(valore('Corsa, questa settimana')).toBe('75min');
    expect(sotto('Corsa, questa settimana')).toBe('obiettivo 120 · ne mancano 45');
  });

  it('senza dati ogni riga dice cosa le serve, in accento, e porta dove si rimedia', async () => {
    const { valore, riga, router, fixture } = await monta();
    expect(valore('Peso')).toBe('Pesati');
    expect(valore('BMI')).toBe('Mettil\'altezza');
    expect(valore('Massa grassa')).toBe('Completailprofilo');
    expect(valore('FFMI')).toBe('—');
    for (const t of ['Peso', 'BMI', 'Massa grassa']) {
      expect(riga(t).querySelector('ion-note')!.classList.contains('azione')).toBe(true);
      expect((riga(t) as any).detail).toBe(true);
    }

    riga('Peso').click();
    await fixture.whenStable();
    expect(router.url).toBe('/account/misure/peso');
    riga('BMI').click();
    await fixture.whenStable();
    expect(router.url).toBe('/account/impostazioni');
  });

  it('la massa grassa senza pliche porta alle pliche, se il profilo e\' completo', async () => {
    const { valore, riga, router, fixture } = await monta({ profilo: { displayName: 'Andrea', heightCm: 180, sex: 'm', birthDate: '1994-03-12' } });
    expect(valore('Massa grassa')).toBe('Vaiallepliche');
    riga('Massa grassa').click();
    await fixture.whenStable();
    expect(router.url).toBe('/account/misure/pliche');
  });

  it('il tonnellaggio: il totale, poi un giorno per riga col suo peso o un trattino', async () => {
    const { fixture, valore, sotto, root } = await monta();
    fixture.componentInstance.rotation.set({
      days: [{ label: 'Petto', kg: 9000, date: '2026-10-15' }, { label: 'Gambe', kg: null, date: '' }] as any,
      totalKg: 9000, missing: 1
    });
    fixture.detectChanges();
    // Il numero come lo scrive formatKg (in italiano "9.000"), l'unita' accanto.
    expect(valore('Totale')).toBe(formatKg(9000) + 'kg');
    expect(valore('Petto')).toBe(formatKg(9000) + 'kg');
    expect(sotto('Petto')).toBe('ultima seduta 15.10');
    expect(valore('Gambe')).toBe('—');
    expect(root.querySelector('.nota-gruppo')!.textContent!.replace(/\s+/g, ' ')).toContain('Restano 1 giorni da allenare');
  });
});
