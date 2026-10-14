import { normalizeMeasurement, PLICHE_FIELDS, CENTIMETRI_FIELDS } from './measurement.model';

/** Un documento com'era scritto con lo schema precedente. */
const VECCHIO = {
  date: '2026-08-26',
  peso: '108',
  plicaPetto: '12',
  plicaAddome: '31',
  plicaVita: '25',
  plicaSottoscapolareSx: '15',
  plicaSottoscapolareDx: '11',
  plicaSovrailiacaSx: '20',
  plicaSovrailiacaDx: '13',
  plicaAscellareSx: '9',
  plicaAscellareDx: '9',
  plicaTricipiteSx: '14',
  plicaTricipiteDx: '15',
  plicaGambaSx: '32',
  plicaGambaDx: '28',
  cmPetto: '110',
  cmAddome: '95',
  cmVita: '91',
  cmGambaSx: '64',
  cmGambaDx: '65',
  cmBicipiteSx: '42',
  cmBicipiteDx: '43',
  cmPolpaccioSx: '40',
  cmPolpaccioDx: '40',
  cmCavigliaSx: '24',
  cmCavigliaDx: '24'
};

describe('normalizeMeasurement — schema vecchio', () => {
  it('porta i siti a valore unico sui nomi nuovi', () => {
    const e = normalizeMeasurement(VECCHIO);
    expect(e.plicaAddominale).toBe('31');
    expect(e.plicaPettorale).toBe('12');
  });

  // Il foglio vuole un valore solo dove l'app ne teneva due.
  it('fa la media dei due lati', () => {
    const e = normalizeMeasurement(VECCHIO);
    expect(e.plicaSottoscapolare).toBe('13');   // (15 + 11) / 2
    expect(e.plicaIliaca).toBe('16,5');         // (20 + 13) / 2
    expect(e.plicaTricipite).toBe('14,5');      // (14 + 15) / 2
    expect(e.plicaQuadricipite).toBe('30');     // (32 + 28) / 2
  });

  it('con un lato solo misurato tiene quello', () => {
    const e = normalizeMeasurement({ ...VECCHIO, plicaTricipiteDx: null });
    expect(e.plicaTricipite).toBe('14');
  });

  it('rinomina le circonferenze che cambiano solo nome', () => {
    const e = normalizeMeasurement(VECCHIO);
    expect(e.cmTorace).toBe('110');
    expect(e.cmQuadricipiteDx).toBe('65');
    expect(e.cmQuadricipiteSx).toBe('64');
  });

  it('lascia stare quelle che il nome non l\'hanno cambiato', () => {
    const e = normalizeMeasurement(VECCHIO);
    expect(e.cmVita).toBe('91');
    expect(e.cmBicipiteDx).toBe('43');
    expect(e.cmBicipiteSx).toBe('42');
  });

  // Il foglio non le prende: restano su Firestore e non si leggono piu'.
  it('non inventa i siti nuovi che il vecchio schema non aveva', () => {
    const e = normalizeMeasurement(VECCHIO);
    expect(e.plicaLombare).toBeNull();
    expect(e.cmFianchi).toBeNull();
    expect(e.cmSpalle).toBeNull();
  });

  it('non lascia in giro chiavi che non sono del modello', () => {
    const e = normalizeMeasurement(VECCHIO) as any;
    ['plicaVita', 'plicaAscellareSx', 'plicaGambaDx', 'cmAddome', 'cmPolpaccioSx', 'cmPetto']
      .forEach(k => expect(e[k]).toBeUndefined());
  });
});

describe('normalizeMeasurement — schema nuovo', () => {
  it('un documento gia\' nuovo passa intatto', () => {
    const nuovo = {
      date: '2026-09-26', peso: '107',
      plicaAddominale: '21', plicaIliaca: '13', plicaPettorale: '8',
      plicaTricipite: '11', plicaSottoscapolare: '10', plicaLombare: '32',
      plicaQuadricipite: '25',
      cmVita: '91,5', cmFianchi: '99', cmTorace: '109', cmSpalle: '130',
      cmBicipiteDx: '43,5', cmBicipiteSx: '42', cmQuadricipiteDx: '66', cmQuadricipiteSx: '65'
    };
    expect(normalizeMeasurement(nuovo)).toEqual(nuovo);
  });

  /*
   * Il caso che deciderebbe in silenzio: se una corrispondenza dal vecchio
   * scavalcasse un valore nuovo, una rilevazione modificata a mano tornerebbe
   * al dato vecchio senza che nessuno se ne accorga.
   */
  it('il valore nuovo vince su quello vecchio', () => {
    const misto = { ...VECCHIO, plicaAddominale: '21', cmTorace: '109' };
    const e = normalizeMeasurement(misto);
    expect(e.plicaAddominale).toBe('21');
    expect(e.cmTorace).toBe('109');
  });
});

describe('normalizeMeasurement — documenti rotti', () => {
  it('regge null e undefined', () => {
    expect(normalizeMeasurement(null).date).toBe('');
    expect(normalizeMeasurement(undefined).peso).toBeNull();
  });

  it('regge un documento senza nessun campo', () => {
    const e = normalizeMeasurement({ date: '2026-01-01' });
    expect(e.date).toBe('2026-01-01');
    [...PLICHE_FIELDS, ...CENTIMETRI_FIELDS]
      .forEach(f => expect(e[f.key]).toBeNull());
  });

  it('tratta la stringa vuota come un valore assente', () => {
    const e = normalizeMeasurement({ date: '2026-01-01', plicaAddominale: '   ' });
    expect(e.plicaAddominale).toBeNull();
  });

  it('scarta un valore che non e\' testo', () => {
    const e = normalizeMeasurement({ date: '2026-01-01', plicaAddominale: 31 });
    expect(e.plicaAddominale).toBeNull();
  });
});
