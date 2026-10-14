import { NgZone, ApplicationRef, Injectable } from '@angular/core';

/**
 * L'SDK Firebase "puro" (non integrato con Angular tramite AngularFire) puo'
 * risolvere le proprie Promise fuori dalla zone di Angular: i dati si
 * aggiornano correttamente in memoria, ma la vista non viene ridisegnata
 * per mostrarli, dando l'impressione di un caricamento bloccato per sempre
 * (si "sblocca" solo se scatta un altro evento zone-aware, es. un click).
 *
 * zone.run() da solo non e' sempre sufficiente: garantisce che il codice
 * sincrono al suo interno giri nella zone di Angular, ma non e' detto che
 * questo da solo triggeri un nuovo ciclo di change detection. Per essere
 * sicuri al 100%, dopo aver rientrato nella zone forziamo esplicitamente
 * un tick dell'intera applicazione (in un setTimeout, cosi' avviene DOPO
 * che il .then()/await del chiamante ha gia' aggiornato lo stato).
 */
@Injectable({ providedIn: 'root' })
export class ZoneFixService {
  constructor(private zone: NgZone, private appRef: ApplicationRef) {}

  run<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      promise.then(
        value => this.zone.run(() => {
          resolve(value);
          setTimeout(() => this.appRef.tick(), 0);
        }),
        error => this.zone.run(() => {
          reject(error);
          setTimeout(() => this.appRef.tick(), 0);
        })
      );
    });
  }
}

/** @deprecated usa ZoneFixService (iniettabile) - mantenuta per compatibilita' */
export function inZone<T>(zone: NgZone, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    promise.then(
      value => zone.run(() => resolve(value)),
      error => zone.run(() => reject(error))
    );
  });
}
