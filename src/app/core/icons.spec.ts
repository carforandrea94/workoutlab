import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { APP_ICONS } from './icons';

/**
 * Un nome di icona sbagliato non rompe la compilazione: Lucide non trova nulla
 * e disegna il vuoto, in silenzio. Qui ogni nome usato nei template viene
 * montato davvero e si controlla che produca un <svg> con dentro qualcosa.
 */
@Component({
  standalone: true,
  imports: [LucideAngularModule],
  template: `<lucide-icon [name]="name"></lucide-icon>`
})
class IconHost {
  name = '';
}

/** Gli stessi nomi che compaiono nei template, in kebab-case. */
const USED = [
  'chart-line', 'check', 'chevron-down', 'chevron-right', 'circle-plus',
  'dumbbell', 'eye', 'eye-off', 'file-text', 'file-up', 'gallery-horizontal',
  'grip-vertical', 'history', 'info',
  'list', 'pause', 'play', 'plus', 'ruler', 'save', 'search',
  'settings',
  'shopping-cart', 'sport-shoe', 'square-pen', 'timer', 'trash-2', 'user',
  'utensils', 'x'
];

describe('icone Lucide', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconHost],
      providers: [importProvidersFrom(LucideAngularModule.pick(APP_ICONS))]
    }).compileComponents();
  });

  it.each(USED)('disegna "%s"', (name) => {
    const fixture = TestBed.createComponent(IconHost);
    fixture.componentInstance.name = name;
    fixture.detectChanges();
    const svg: SVGElement | null = fixture.nativeElement.querySelector('svg');
    expect(svg, `nessun <svg> per "${name}"`).toBeTruthy();
    expect(svg!.children.length, `"${name}" e' vuoto`).toBeGreaterThan(0);
  });

  it('registra solo le icone che i template usano davvero', () => {
    const registrate = Object.keys(APP_ICONS).length;
    expect(registrate).toBe(USED.length);
  });
});
