import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Il deploy pubblica le regole di Firestore insieme all'app. Prima andavano
 * lanciate a mano, e due volte l'app e' andata online senza le regole delle
 * sue raccolte nuove (Promemoria, Storico della dieta): Firestore rifiutava
 * ogni lettura e le pagine dicevano "controlla la connessione".
 */
describe('il deploy', () => {
  let fs: any;
  beforeAll(async () => {
    const nome = 'node:fs';
    fs = await import(/* @vite-ignore */ nome);
  });
  const testo = (p: string) => fs.readFileSync(p, 'utf8') as string;
  const workflow = () => testo('.github/workflows/firebase-deploy.yml');

  it('pubblica regole e indici di Firestore, nel job di deploy e prima dell\'app', () => {
    const w = workflow();
    const job = w.indexOf('\n  deploy:\n');
    const regole = w.indexOf('firebase-tools@13 deploy \\\n            --only firestore:rules,firestore:indexes');
    const hosting = w.indexOf('uses: FirebaseExtended/action-hosting-deploy');
    expect(job).toBeGreaterThan(0);
    expect(regole).toBeGreaterThan(job);
    expect(hosting).toBeGreaterThan(regole);
    // Il job di deploy non gira sulle pull request.
    expect(w.slice(job, regole)).toContain("if: github.event_name != 'pull_request'");
  });

  it('la chiave del service account sta fuori dal progetto e si cancella anche se il deploy fallisce', () => {
    const w = workflow();
    expect(w).toContain('credenziali="$RUNNER_TEMP/firebase-deploy.json"');
    expect(w).toContain(`trap 'rm -f "$credenziali"' EXIT`);
    expect(w).toContain('(umask 077 && printf \'%s\' "$SERVICE_ACCOUNT" > "$credenziali")');
    expect(w).toContain('GOOGLE_APPLICATION_CREDENTIALS="$credenziali" npx --yes firebase-tools@13 deploy');
    expect(w.indexOf('trap')).toBeLessThan(w.indexOf('printf \'%s\' "$SERVICE_ACCOUNT"'));
  });

  it('ogni raccolta dell\'utente ha la sua regola: senza, Firestore la chiude', () => {
    const auth = testo('src/app/core/services/auth.service.ts');
    const elenco = auth.match(/const SOTTORACCOLTE = \[([^\]]+)\]/);
    expect(elenco).toBeTruthy();
    const raccolte = elenco![1].split(',').map(r => r.trim().replace(/'/g, '')).filter(Boolean);
    expect(raccolte).toContain('giorniDieta');
    const regole = testo('firestore.rules');
    for (const r of raccolte) expect(regole, r).toContain(`match /${r}/{id}`);
  });
});
