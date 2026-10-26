import { Injectable, signal } from '@angular/core';
import { Diet } from '../models/diet.model';
import { CicloDieta } from '../core/utils/dieta-ciclo.util';

@Injectable({ providedIn: 'root' })
export class DietDataService {

  diet: Diet = [];

  /** ON/OFF o ciclica, dal protocollo attivo. Un signal: la Dieta lo legge per dire il piano di oggi. */
  readonly ciclo = signal<CicloDieta>({ tipo: 'onoff', inizio: null });

  applyDiet(diet: Diet, ciclo: CicloDieta = { tipo: 'onoff', inizio: null }): void {
    this.diet = diet;
    this.ciclo.set(ciclo);
  }

  getPlan(id: string) {
    return this.diet.find(p => p.id === id) ?? null;
  }
}
