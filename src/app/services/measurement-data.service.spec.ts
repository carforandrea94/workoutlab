import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock condivisa: vedi src/test-support/firestore-mock.ts per il perche' non
// puo' vivere qui dentro (isolate: false condivide i moduli fra i file).
vi.mock('firebase/firestore', async () => (await import('../../test-support/firestore-mock')).firestoreMock);

import { mockDocs } from '../../test-support/firestore-mock';

import type { MeasurementDataService } from './measurement-data.service';

/**
 * I moduli sono condivisi fra i file di test (isolate: false): se un altro file
 * ha gia' caricato questo servizio, il servizio ha gia' legato le funzioni VERE
 * di firebase/firestore e la mock non lo raggiungerebbe — fallimento a
 * intermittenza, dipendente dall'ordine dei file. Ricaricarlo qui, dopo la
 * registrazione della mock, lo lega alla mock.
 */
async function makeService(): Promise<MeasurementDataService> {
  vi.resetModules();
  const { MeasurementDataService } = await import('./measurement-data.service');
  return new MeasurementDataService(
    { db: {} } as any,
    { currentUser: () => ({ uid: 'u1' }) } as any,
    {} as any,
    { run: (p: Promise<any>) => p } as any
  );
}

describe('MeasurementDataService.moveCategoryEntry', () => {
  let service: MeasurementDataService;

  beforeEach(async () => {
    mockDocs.clear();
    service = await makeService();
  });

  it('sposta i campi della categoria in una nuova data senza collisioni, pulendo l\'origine', async () => {
    mockDocs.set('2026-07-01', { date: '2026-07-01', peso: '80', cmVita: '90' });

    const result = await service.moveCategoryEntry('peso', '2026-07-01', '2026-07-05', { peso: '80' });

    expect(result).toBe('ok');
    expect(mockDocs.get('2026-07-05')).toMatchObject({ peso: '80' });
    expect(mockDocs.get('2026-07-01')).toMatchObject({ peso: null, cmVita: '90' });
  });

  it('blocca lo spostamento se la data di destinazione ha gia\' valori della stessa categoria', async () => {
    mockDocs.set('2026-07-01', { date: '2026-07-01', peso: '80' });
    mockDocs.set('2026-07-05', { date: '2026-07-05', peso: '82' });

    const result = await service.moveCategoryEntry('peso', '2026-07-01', '2026-07-05', { peso: '80' });

    expect(result).toBe('collision');
    expect(mockDocs.get('2026-07-01')).toMatchObject({ peso: '80' });
    expect(mockDocs.get('2026-07-05')).toMatchObject({ peso: '82' });
  });

  it('elimina la voce di origine se resta senza valori in nessuna categoria dopo lo spostamento', async () => {
    mockDocs.set('2026-07-01', { date: '2026-07-01', peso: '80' });

    await service.moveCategoryEntry('peso', '2026-07-01', '2026-07-05', { peso: '80' });

    expect(mockDocs.has('2026-07-01')).toBe(false);
  });

  it('con la stessa data, aggiorna solo i campi della categoria senza toccare le altre', async () => {
    mockDocs.set('2026-07-01', { date: '2026-07-01', peso: '80', cmVita: '90' });

    const result = await service.moveCategoryEntry('peso', '2026-07-01', '2026-07-01', { peso: '81' });

    expect(result).toBe('ok');
    expect(mockDocs.get('2026-07-01')).toMatchObject({ peso: '81', cmVita: '90' });
  });
});

describe('MeasurementDataService.parseMeasureValue', () => {
  let service: MeasurementDataService;

  beforeEach(async () => {
    service = await makeService();
  });

  it('interpreta la virgola italiana come separatore decimale', () => {
    expect(service.parseMeasureValue('109,5')).toBe(109.5);
    expect(service.parseMeasureValue('110,9')).toBe(110.9);
  });

  it('funziona anche con valori gia\' col punto come separatore', () => {
    expect(service.parseMeasureValue('109.5')).toBe(109.5);
  });

  it('restituisce null per valori nulli, vuoti o non numerici', () => {
    expect(service.parseMeasureValue(null)).toBeNull();
    expect(service.parseMeasureValue(undefined)).toBeNull();
    expect(service.parseMeasureValue('')).toBeNull();
    expect(service.parseMeasureValue('abc')).toBeNull();
  });

  it('la differenza tra due valori con virgola mantiene la precisione decimale', () => {
    const diff = service.parseMeasureValue('109,5')! - service.parseMeasureValue('110,9')!;
    expect(Math.round(diff * 10) / 10).toBe(-1.4);
  });
});

describe('MeasurementDataService.formatMeasureNumber', () => {
  let service: MeasurementDataService;

  beforeEach(async () => {
    service = await makeService();
  });

  it('mostra i decimali con la virgola italiana', () => {
    expect(service.formatMeasureNumber(-1.4)).toBe('-1,4');
    expect(service.formatMeasureNumber(2.3)).toBe('2,3');
  });

  it('non aggiunge decimali superflui per i numeri interi', () => {
    expect(service.formatMeasureNumber(3)).toBe('3');
    expect(service.formatMeasureNumber(-2)).toBe('-2');
  });
});
