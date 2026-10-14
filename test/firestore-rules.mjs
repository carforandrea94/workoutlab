/**
 * Le regole di Firestore, provate davvero.
 *
 * I test dell'app girano con una finta Firestore che le regole non le legge
 * nemmeno: un permesso sbagliato li passerebbe tutti. Qui invece parte
 * l'emulatore vero, carica firestore.rules e ci si presenta davanti come un
 * estraneo e come due utenti.
 *
 *   npm run test:rules        (serve Java 21, che l'emulatore si porta dietro)
 *
 * Non e' agganciato alla CI: si lancia a mano, e va lanciato ogni volta che
 * firestore.rules cambia.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds }
  from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, collection } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'prova-regole',
  firestore: {
    host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  }
});

const IO = 'utente-1', ALTRO = 'utente-2';
const RACCOLTE = ['measurements', 'sessions', 'runs', 'state', 'protocols'];

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', IO), { uid: IO, email: 'io@e.com', displayName: 'Io' });
  await setDoc(doc(db, 'users', ALTRO), { uid: ALTRO, email: 'altro@e.com', displayName: 'Altro' });
  for (const uid of [IO, ALTRO]) {
    for (const raccolta of RACCOLTE) {
      await setDoc(doc(db, 'users', uid, raccolta, 'x1'), { prova: true });
    }
  }
});

const anonimo = env.unauthenticatedContext().firestore();
const io = env.authenticatedContext(IO).firestore();

let ko = 0;
const prova = async (nome, p) => {
  try { await p; console.log('  ok   ', nome); }
  catch (e) { ko++; console.log('  KO   ', nome, '->', e.message.slice(0, 90)); }
};

console.log("\n— chi non e' collegato —");
await prova('non legge un profilo', assertFails(getDoc(doc(anonimo, 'users', IO))));
for (const raccolta of RACCOLTE) {
  await prova(`non legge ${raccolta}`, assertFails(getDocs(collection(anonimo, 'users', IO, raccolta))));
}

console.log('\n— i propri dati —');
await prova('legge il proprio profilo', assertSucceeds(getDoc(doc(io, 'users', IO))));
for (const raccolta of RACCOLTE) {
  await prova(`legge e scrive ${raccolta}`, (async () => {
    await assertSucceeds(getDocs(collection(io, 'users', IO, raccolta)));
    await assertSucceeds(setDoc(doc(io, 'users', IO, raccolta, 'nuovo'), { prova: true }));
    await assertSucceeds(deleteDoc(doc(io, 'users', IO, raccolta, 'nuovo')));
  })());
}
await prova('modifica un protocollo',
  assertSucceeds(updateDoc(doc(io, 'users', IO, 'protocols', 'x1'), { status: 'active' })));

console.log('\n— i dati degli altri —');
await prova('non legge il profilo di un altro', assertFails(getDoc(doc(io, 'users', ALTRO))));
for (const raccolta of RACCOLTE) {
  await prova(`non legge ${raccolta} di un altro`,
    assertFails(getDocs(collection(io, 'users', ALTRO, raccolta))));
}
await prova('non scrive un protocollo a un altro',
  assertFails(setDoc(doc(io, 'users', ALTRO, 'protocols', 'intruso'), { name: 'Intruso' })));
await prova('non cancella le misurazioni di un altro',
  assertFails(deleteDoc(doc(io, 'users', ALTRO, 'measurements', 'x1'))));
await prova('non cancella il profilo di un altro', assertFails(deleteDoc(doc(io, 'users', ALTRO))));
await prova('non elenca i profili', assertFails(getDocs(collection(io, 'users'))));

console.log("\n— il vecchio modello coach/clienti non c'e' piu' —");
await prova('coachCodes e\' chiuso', assertFails(getDoc(doc(anonimo, 'coachCodes', 'AB12CD'))));
await prova('announcements e\' chiuso', assertFails(getDocs(collection(io, 'announcements'))));

console.log("\n— l'informativa e i campi del profilo —");
const NUOVO = 'utente-nuovo';
const nuovo = env.authenticatedContext(NUOVO).firestore();
const profiloBase = { uid: NUOVO, email: 'n@e.com', displayName: 'Nuovo', createdAt: '2026-10-14T00:00:00.000Z' };
const accettazione = { privacyAcceptedAt: '2026-10-14T00:00:00.000Z', privacyVersion: '2026-10-14' };
await prova('non si crea un profilo senza accettazione',
  assertFails(setDoc(doc(nuovo, 'users', NUOVO), profiloBase)));
await prova('nemmeno con la sola data, senza la versione',
  assertFails(setDoc(doc(nuovo, 'users', NUOVO), { ...profiloBase, privacyAcceptedAt: accettazione.privacyAcceptedAt })));
await prova('non si crea il profilo di un altro',
  assertFails(setDoc(doc(nuovo, 'users', 'qualcun-altro'), { ...profiloBase, uid: 'qualcun-altro', ...accettazione })));
await prova("non si porta campi inventati (ruolo, coach...)",
  assertFails(setDoc(doc(nuovo, 'users', NUOVO), { ...profiloBase, role: 'coach', ...accettazione })));
await prova('con data e versione si crea',
  assertSucceeds(setDoc(doc(nuovo, 'users', NUOVO), { ...profiloBase, ...accettazione })));

await prova('cambia nome, cognome e nome intero',
  assertSucceeds(updateDoc(doc(io, 'users', IO), { firstName: 'Anna', lastName: 'Rossi', displayName: 'Anna Rossi' })));
await prova('cambia data di nascita, sesso e altezza',
  assertSucceeds(updateDoc(doc(io, 'users', IO), { birthDate: '1994-05-01', sex: 'f', heightCm: 168 })));
await prova("NON puo' svuotare il nome intero",
  assertFails(updateDoc(doc(io, 'users', IO), { displayName: '' })));
await prova("NON puo' mettere un'altezza assurda",
  assertFails(updateDoc(doc(io, 'users', IO), { heightCm: 20 })));
await prova("NON puo' aggiungersi un ruolo",
  assertFails(updateDoc(doc(io, 'users', IO), { role: 'coach' })));
await prova("NON puo' riscrivere quando ha accettato l'informativa",
  assertFails(updateDoc(doc(io, 'users', IO), { privacyAcceptedAt: '2030-01-01T00:00:00.000Z' })));

console.log("\n— chiudere l'account —");
await prova('cancella il PROPRIO profilo', assertSucceeds(deleteDoc(doc(io, 'users', IO))));

await env.cleanup();
console.log(ko === 0 ? '\nTUTTO COME DEVE ESSERE' : `\n${ko} CONTROLLI FALLITI`);
process.exit(ko === 0 ? 0 : 1);
