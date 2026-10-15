import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TastoDirective } from './tasto.directive';

@Component({
  standalone: true,
  imports: [TastoDirective],
  template: `
    <div id="a" appTasto (click)="clic()">Apri</div>
    <div id="b" appTasto="checkbox" [attr.aria-checked]="spuntato()" (click)="clic()">Sì</div>
    <div id="c" appTasto (click)="clic()"><input id="campo" /></div>
    <div id="d" appTasto="radio" [attr.aria-checked]="spuntato()" (click)="clic()">Peso</div>
  `
})
class Prova {
  spuntato = signal(false);
  clic = vi.fn();
}

/**
 * Le intestazioni a fisarmonica e le righe a selezione erano <div> con un
 * click: la direttiva le rende raggiungibili da tastiera e da screen reader.
 */
describe('TastoDirective', () => {
  function monta() {
    const fixture = TestBed.createComponent(Prova);
    fixture.detectChanges();
    const el = (id: string) => fixture.nativeElement.querySelector('#' + id) as HTMLElement;
    return { fixture, el, prova: fixture.componentInstance };
  }

  const tasto = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(ev);
    return ev;
  };

  beforeEach(() => TestBed.configureTestingModule({ imports: [Prova] }));

  it('di default e\' un button, raggiungibile con Tab', () => {
    const { el } = monta();
    expect(el('a').getAttribute('role')).toBe('button');
    expect(el('a').getAttribute('tabindex')).toBe('0');
    expect(el('a').classList.contains('tasto')).toBe(true);
  });

  it('con "checkbox" ha il ruolo checkbox e lo stato che si dichiara', () => {
    const { el, fixture, prova } = monta();
    expect(el('b').getAttribute('role')).toBe('checkbox');
    expect(el('b').getAttribute('aria-checked')).toBe('false');
    prova.spuntato.set(true);
    fixture.detectChanges();
    expect(el('b').getAttribute('aria-checked')).toBe('true');
  });

  it('con "radio" ha il ruolo radio: una scelta fra piu\' righe, di cui una sola attiva', () => {
    const { el, fixture, prova } = monta();
    expect(el('d').getAttribute('role')).toBe('radio');
    expect(el('d').getAttribute('tabindex')).toBe('0');
    expect(el('d').getAttribute('aria-checked')).toBe('false');
    prova.spuntato.set(true);
    fixture.detectChanges();
    expect(el('d').getAttribute('aria-checked')).toBe('true');
  });

  it('Invio fa il click', () => {
    const { el, prova } = monta();
    tasto(el('a'), 'Enter');
    expect(prova.clic).toHaveBeenCalledTimes(1);
  });

  it('Spazio fa il click e non fa scorrere la pagina', () => {
    const { el, prova } = monta();
    const ev = tasto(el('a'), ' ');
    expect(prova.clic).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('gli altri tasti non fanno niente', () => {
    const { el, prova } = monta();
    tasto(el('a'), 'a'); tasto(el('a'), 'Escape'); tasto(el('a'), 'Tab');
    expect(prova.clic).not.toHaveBeenCalled();
  });

  it('con Ctrl, Cmd o Alt premuti non fa il click', () => {
    const { el, prova } = monta();
    tasto(el('a'), 'Enter', { ctrlKey: true });
    tasto(el('a'), 'Enter', { metaKey: true });
    tasto(el('a'), ' ', { altKey: true });
    expect(prova.clic).not.toHaveBeenCalled();
  });

  it('un tasto premuto su un campo dentro non e\' per la direttiva', () => {
    const { el, prova } = monta();
    const ev = tasto(el('campo'), ' ');
    expect(prova.clic).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});
