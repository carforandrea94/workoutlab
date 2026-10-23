import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, Routes, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { MisureComponent } from './pages/misure/misure.component';

@Component({ standalone: true, template: '' })
class Vuota {}

/** Le pagine sotto TabsPage: il primo segmento dell'indirizzo e' la pila (la tab) in cui stanno. */
const dentroLeTab = (routes.find(r => r.path === '' && r.children)?.children ?? []) as Route[];

/**
 * Misure non e' piu' una tab: le sue pagine stanno nella pila di Account,
 * sotto /account/misure, e i vecchi indirizzi (/misure/...) portano li'.
 * L'andamento non e' piu' una pagina a parte: e' Misure stessa.
 */
describe('rotte — Misure dentro Account', () => {
  const pagine = dentroLeTab.filter(r => r.loadComponent && r.path?.includes('misure'));

  it('le quattro pagine delle misure stanno nella pila di Account', () => {
    expect(pagine.map(r => r.path)).toEqual([
      'account/misure', 'account/misure/storico', 'account/misure/:categoria', 'account/misure/storico/:key'
    ]);
  });

  it('Misure e\' il grafico dell\'andamento; il vecchio indirizzo dell\'andamento e\' solo un rimando', async () => {
    const pagina = await (pagine.find(r => r.path === 'account/misure')!.loadComponent!() as Promise<unknown>);
    expect(pagina).toBe(MisureComponent);
    const andamento = dentroLeTab.find(r => r.path === 'account/misure/analytics')!;
    expect(andamento.loadComponent).toBeUndefined();
    expect(andamento.redirectTo).toBe('account/misure');
  });

  it('storico e il rimando dell\'andamento vengono prima di :categoria, che altrimenti li prenderebbe', () => {
    const i = (p: string) => dentroLeTab.findIndex(r => r.path === p);
    expect(i('account/misure/storico')).toBeLessThan(i('account/misure/:categoria'));
    expect(i('account/misure/analytics')).toBeLessThan(i('account/misure/:categoria'));
  });

  it('la pagina di una categoria tiene la guardia delle modifiche non salvate', () => {
    expect(pagine.find(r => r.path === 'account/misure/:categoria')?.canDeactivate?.length).toBe(1);
  });

  it('sotto /misure non resta nessuna pagina, solo i rimandi', () => {
    const vecchie = dentroLeTab.filter(r => r.path === 'misure' || r.path?.startsWith('misure/'));
    expect(vecchie.length).toBe(5);
    expect(vecchie.every(r => !r.loadComponent && typeof r.redirectTo === 'string')).toBe(true);
  });

  describe('i vecchi indirizzi', () => {
    // Le rotte vere, con al posto delle pagine una pagina vuota: conta dove si arriva.
    async function vaiA(url: string): Promise<string> {
      const prova: Routes = dentroLeTab
        .filter(r => r.redirectTo !== undefined ? r.path !== '' : r.path?.startsWith('account/misure'))
        .map(r => (r.loadComponent ? { path: r.path, component: Vuota } : r));
      TestBed.configureTestingModule({ providers: [provideRouter(prova)] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      return router.url;
    }

    it.each([
      ['/misure', '/account/misure'],
      ['/misure/storico', '/account/misure/storico'],
      ['/misure/analytics', '/account/misure'],
      ['/account/misure/analytics', '/account/misure'],
      ['/misure/peso', '/account/misure/peso'],
      ['/misure/storico/2026-05-01', '/account/misure/storico/2026-05-01']
    ])('%s porta a %s', async (vecchio, nuovo) => {
      expect(await vaiA(vecchio)).toBe(nuovo);
    });

    it('anche coi parametri: si modifica la stessa misurazione', async () => {
      expect(await vaiA('/misure/pliche?date=2026-05-01')).toBe('/account/misure/pliche?date=2026-05-01');
    });
  });
});
