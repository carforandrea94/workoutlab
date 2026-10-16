import { beforeAll, describe, expect, it } from 'vitest';

/**
 * L'app scrive i testi in italiano con le lettere accentate, non con l'apostrofo
 * ("è", non "e'"): nei messaggi di errore e nelle conferme, dove la voce del
 * prodotto e' piu' curata, l'apostrofo si legge come un refuso. Nei commenti del
 * codice la convenzione resta ASCII, e li' non si guarda.
 *
 * Il test cerca nei testi visibili (HTML fuori dai commenti, stringhe e template
 * letterali del TypeScript) le parole che di solito portano l'accento.
 */
describe('i testi visibili hanno le lettere accentate', () => {
  const PAROLE = ['perche', 'finche', 'quantita', 'qualita', 'formalita', 'attivita', 'martedi', 'lunedi', 'mercoledi', 'giovedi', 'venerdi',
    'verra', 'andra', 'fara', 'sara', 'gia', 'piu', 'puo', 'cosi', 'eta', 'ne', 'li', 'meta', 'e'];
  const RE = new RegExp(`(?<![A-Za-zÀ-ÿ'’])(${PAROLE.join('|')})(?:'|&rsquo;|’)(?![A-Za-zÀ-ÿ0-9])`, 'gi');

  let trovati: string[] = [];
  let letti = 0;

  beforeAll(async () => {
    // Il progetto non ha i tipi di Node: i moduli si caricano per nome.
    const caricamento = async (nome: string) => import(/* @vite-ignore */ nome);
    const fs = await caricamento('node:fs');
    const path = await caricamento('node:path');
    const ts = (await caricamento('typescript')).default ?? (await caricamento('typescript'));

    const cammina = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e: any) => e.isDirectory() ? cammina(path.join(d, e.name)) : [path.join(d, e.name)]);
    const file: string[] = cammina('src/app').filter((f: string) => /\.(ts|html)$/.test(f) && !/\.spec\.ts$/.test(f));

    const fuoriDaiCommenti = (testo: string) => testo.split(/(\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)/)
      .filter(p => !p.startsWith('/*') && !p.startsWith('<!--')).join('\u0000');
    const cerca = (f: string, testo: string, riga: number) => {
      for (const m of fuoriDaiCommenti(testo).matchAll(RE)) trovati.push(`${f}:${riga}  ${m[0]}`);
    };

    for (const f of file) {
      const src: string = fs.readFileSync(f, 'utf8');
      letti++;
      if (f.endsWith('.html')) { cerca(f, src, 0); continue; }
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
      const visita = (n: any) => {
        const k = ts.SyntaxKind;
        if (n.kind === k.StringLiteral) cerca(f, n.text, sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
        else if ([k.NoSubstitutionTemplateLiteral, k.TemplateHead, k.TemplateMiddle, k.TemplateTail].includes(n.kind)) {
          cerca(f, src.slice(n.getStart(), n.getEnd()), sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
        }
        ts.forEachChild(n, visita);
      };
      visita(sf);
    }
  });

  it('ha letto i sorgenti (non e\' un controllo a vuoto)', () => {
    expect(letti).toBeGreaterThan(100);
  });

  it('nessuna parola con l\'apostrofo al posto dell\'accento', () => {
    expect(trovati).toEqual([]);
  });

  it('il controllo riconosce il difetto (se non lo vedesse, il test sopra non direbbe niente)', () => {
    expect([..."Hai gia' un account? Non e' possibile, perche'..., piu' tardi".matchAll(RE)].map(m => m[0])).toEqual(["gia'", "e'", "perche'", "piu'"]);
    // Un'elisione non e' un accento, e una parola che finisce in "e" dentro una stringa nemmeno.
    expect([..."dell'email, l'altezza, un po' di, 'grande'".matchAll(RE)].map(m => m[0])).toEqual([]);
  });
});
