import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Il worker di pdf.js deve avere la stessa versione della libreria: se no
 * pdf.js rifiuta il PDF ("The API version 6.4.299 does not match the Worker
 * version 6.1.200") e l'import da PDF non parte. Il worker non si copia a mano:
 * lo prende il build dal pacchetto installato.
 */
describe('il worker di pdf.js', () => {
  let fs: any;
  beforeAll(async () => {
    const nome = 'node:fs';
    fs = await import(/* @vite-ignore */ nome);
  });
  const testo = (p: string) => fs.readFileSync(p, 'utf8') as string;

  it('lo copia il build dalla build "legacy" del pacchetto installato, nella radice del sito', () => {
    const angular = JSON.parse(testo('angular.json'));
    const assets: any[] = angular.projects.workoutlab.architect.build.options.assets;
    expect(assets).toContainEqual({ glob: 'pdf.worker.min.mjs', input: 'node_modules/pdfjs-dist/legacy/build', output: '/' });
  });

  it('non c\'e\' piu\' una copia a mano in public/: sovrascriverebbe quella giusta', () => {
    expect(fs.existsSync('public/pdf.worker.min.mjs')).toBe(false);
  });

  it('il worker del pacchetto e la libreria sono della stessa versione', () => {
    const versione = JSON.parse(testo('node_modules/pdfjs-dist/package.json')).version;
    expect(testo('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).toContain(`"${versione}"`);
    expect(testo('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).toContain(`"${versione}"`);
  });

  it('il servizio lo chiede allo stesso dominio, con la versione nell\'indirizzo', () => {
    const servizio = testo('src/app/services/pdf-import.service.ts');
    expect(servizio).toContain("from 'pdfjs-dist/legacy/build/pdf.mjs'");
    expect(servizio).toContain('pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;');
  });
});
