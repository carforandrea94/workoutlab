import { Component, forwardRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { BilancioSettimanaComponent } from '../../components/bilancio-settimana/bilancio-settimana.component';
import { FormaCardComponent } from '../../components/forma-card/forma-card.component';
import { ProgressiComponent } from './progressi.component';

const riletture = { forma: vi.fn(), bilancio: vi.fn() };

// I due pezzi leggono mezza app (misure, sedute, corsa, pasti): qui conta come la
// pagina li mette e quando li fa rileggere, non cosa dicono. La pagina li cerca
// per classe (@ViewChild): i finti si fanno trovare con lo stesso nome.
@Component({
  selector: 'app-forma-card', standalone: true, template: '<p class="finto-forma">corpo</p>',
  providers: [{ provide: FormaCardComponent, useExisting: forwardRef(() => FormaFinta) }]
})
class FormaFinta {
  refresh(): void { riletture.forma(); }
}

@Component({
  selector: 'app-bilancio-settimana', standalone: true, template: '<p class="finto-bilancio">settimana</p>',
  providers: [{ provide: BilancioSettimanaComponent, useExisting: forwardRef(() => BilancioFinto) }]
})
class BilancioFinto {
  async refresh(): Promise<void> { riletture.bilancio(); }
}

/**
 * Progressi: la settimana scorsa, il corpo, il lavoro e il tonnellaggio in una
 * tab a se', non piu' in mezzo al profilo di Account.
 */
describe('ProgressiComponent', () => {
  function monta() {
    riletture.forma.mockClear();
    riletture.bilancio.mockClear();
    TestBed.configureTestingModule({ imports: [ProgressiComponent], providers: providerPagina() });
    TestBed.overrideComponent(ProgressiComponent, {
      remove: { imports: [FormaCardComponent, BilancioSettimanaComponent] },
      add: { imports: [FormaFinta, BilancioFinto] }
    });
    const fixture = TestBed.createComponent(ProgressiComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('si chiama Progressi, in testata e nel titolo grande che scorrendo si riduce', () => {
    const { root } = monta();
    const titoli = Array.from(root.querySelectorAll('ion-title')).map(t => t.textContent!.trim());
    expect(titoli).toEqual(['Progressi', 'Progressi']);
    expect(root.querySelector('ion-title[size="large"]')).toBeTruthy();
    expect(root.querySelector('ion-header[collapse="condense"]')).toBeTruthy();
  });

  it('prima la settimana scorsa, poi il corpo, il lavoro e il tonnellaggio', () => {
    const { root } = monta();
    const ordine = Array.from(root.querySelectorAll('.wrap > *')).map(e => e.tagName.toLowerCase());
    expect(ordine).toEqual(['app-bilancio-settimana', 'app-forma-card']);
  });

  it('la pagina è una lista iOS che manda gli eventi di scorrimento alla barra delle tab', () => {
    const { root } = monta();
    const contenuto = root.querySelector('ion-content') as HTMLElement & { scrollEvents?: boolean };
    expect(contenuto.classList.contains('liste-ios')).toBe(true);
    expect(contenuto.scrollEvents).toBe(true);
  });

  it('al primo ingresso i pezzi si leggono da soli e la pagina non li rilegge', () => {
    const { fixture } = monta();
    fixture.componentInstance.ionViewWillEnter();
    expect(riletture.forma).not.toHaveBeenCalled();
    expect(riletture.bilancio).not.toHaveBeenCalled();
  });

  it('rientrando da un\'altra tab (o da Misure) rilegge corpo e settimana', () => {
    const { fixture } = monta();
    fixture.componentInstance.ionViewWillEnter();
    fixture.componentInstance.ionViewWillEnter();
    expect(riletture.forma).toHaveBeenCalledTimes(1);
    expect(riletture.bilancio).toHaveBeenCalledTimes(1);
    fixture.componentInstance.ionViewWillEnter();
    expect(riletture.forma).toHaveBeenCalledTimes(2);
    expect(riletture.bilancio).toHaveBeenCalledTimes(2);
  });
});
