// =====================================================================
// Fernansicht des Leitstands (Firebase Hosting, seit 20.11.2026)
// Wird nur geladen, wenn die Seite über https läuft (also von Firebase kommt).
// Statt den PC zu fragen, liest die Seite den Stand, den das Atomkraftwerk bei Firebase ablegt.
// Sparsam: der Stand wird höchstens alle 2 Minuten gelesen, Auswertungen alle 10 Minuten.
// =====================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STAND_ALTER = 2 * 60e3, AUSW_ALTER = 10 * 60e3, PC_STILL = 20 * 60e3;
let stand = null, standGeholt = 0, standLaden = null;
const auswertung = {}, auswGeholt = {};
let wunsch = null;

// ---------- Anmelden ----------
const schirm = document.createElement('div');
schirm.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:var(--grund);padding:24px';
schirm.innerHTML = `<div style="max-width:420px;text-align:center">
  <b style="display:block;font-family:Exo,var(--schmal);font-size:26px;letter-spacing:.12em;margin-bottom:10px">ATOMKRAFTWERK</b>
  <p style="color:var(--leise);margin:0 0 22px;font-size:17px" id="fernmeldung">Leitstand aus der Ferne – bitte anmelden.</p>
  <button class="knopf" id="fernlogin" style="font-size:18px;padding:0 22px;color:var(--bernstein);border-color:var(--bernstein)">Mit Google anmelden</button>
</div>`;
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(schirm));
if (document.body) document.body.appendChild(schirm);
document.addEventListener('click', async e => {
  if (e.target.id !== 'fernlogin') return;
  const p = new GoogleAuthProvider();
  try { await signInWithPopup(auth, p); } catch (err) { await signInWithRedirect(auth, p); }
});

onAuthStateChanged(auth, async user => {
  if (!user) { schirm.style.display = 'flex'; return; }
  try { await standHolen(true); }
  catch (err) {
    document.getElementById('fernmeldung').textContent = 'Kein Zugriff für ' + (user.email || 'dieses Konto') + '.';
    document.getElementById('fernlogin').textContent = 'Anderes Konto';
    document.getElementById('fernlogin').onclick = () => signOut(auth);
    schirm.style.display = 'flex';
    return;
  }
  schirm.style.display = 'none';
  window.FERN_FERTIG(holen);
});

// ---------- Daten aus Firebase ----------
async function standHolen(sofort) {
  if (!sofort && stand && Date.now() - standGeholt < STAND_ALTER) return stand;
  if (standLaden) return standLaden;
  standLaden = (async () => {
    const s = await getDoc(doc(db, 'akw', 'stand'));
    if (!s.exists()) throw new Error('Noch kein Stand bei Firebase – läuft das Atomkraftwerk mit firebase-zugang.json?');
    stand = s.data(); standGeholt = Date.now();
    const w = await getDoc(doc(db, 'akw', 'zeitplanWunsch'));
    wunsch = w.exists() ? w.data() : null;
    return stand;
  })();
  try { return await standLaden; } finally { standLaden = null; }
}

async function auswertungHolen(zeitraum) {
  if (auswertung[zeitraum] && Date.now() - auswGeholt[zeitraum] < AUSW_ALTER) return auswertung[zeitraum];
  const s = await getDoc(doc(db, 'akw', 'auswertung_' + zeitraum));
  auswertung[zeitraum] = s.exists() ? (s.data().daten || {}) : {};
  auswGeholt[zeitraum] = Date.now();
  return auswertung[zeitraum];
}

const uhr = d => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const tagUhr = d => {
  const heute = new Date().toDateString() === d.toDateString();
  return (heute ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ') + uhr(d) + ' Uhr';
};

// Hinweis oben: Stand von wann, PC an oder aus
function hinweis() {
  if (!stand) return;
  const zeit = stand.zeit && stand.zeit.toDate ? stand.zeit.toDate() : new Date();
  const still = Date.now() - zeit.getTime() > PC_STILL;
  const an = stand.pcAn && !still;
  const el = document.getElementById('stand');
  if (!el) return;
  el.style.display = 'block';
  const wie = /ruhe/i.test(stand.grund || '') ? 'Ruhezustand' : /herunter/i.test(stand.grund || '') ? 'heruntergefahren' : '';
  el.innerHTML = (an
    ? `Fernansicht – Stand von <b>${tagUhr(zeit)}</b>, PC läuft (neue Werte alle 15 Minuten)`
    : `PC aus${wie ? ' (' + wie + ')' : ''} – Stand von <b>${tagUhr(zeit)}</b>`)
    + '<a id="pcstart" style="display:none"></a>';   // bleibt für den Leitstand-Code da
  const pille = document.getElementById('pille'), text = document.getElementById('pilletext');
  if (!an && pille && text) { pille.className = 'pille aus'; text.textContent = 'PC aus'; }
}

const json = t => typeof t === 'string' ? JSON.parse(t) : t;

// beantwortet die /api/...-Anfragen der Seite
async function holen(url, opt) {
  const u = new URL(url, location.origin), pfad = u.pathname, q = u.searchParams;
  const post = (opt.method || 'GET').toUpperCase() === 'POST';
  if (pfad === '/api/jetzt') { await standHolen(false); setTimeout(hinweis, 60); return stand.jetzt; }
  if (pfad === '/api/verlauf') { await standHolen(false); return (stand.verlauf || {})[q.get('id')] || '[]'; }
  if (pfad === '/api/auswertung/liste') { await standHolen(false); return stand.liste || '[]'; }
  if (pfad === '/api/auswertung') { const a = await auswertungHolen(q.get('zeitraum') || 'heute'); return a[q.get('id')] || '{"punkte":[]}'; }
  if (pfad === '/api/tage') return '[]';
  if (pfad === '/api/tag') return JSON.stringify({ datum: q.get('datum'), zeiten: [], werte: [] });
  if (pfad === '/api/pumpe') { if ([...q.keys()].length) throw new Error('nur am PC'); await standHolen(false); return stand.pumpe || '{}'; }
  if (pfad === '/api/handy') { await standHolen(false); const h = json(stand.handy || '{}'); h.meldung = post ? 'Nur am PC änderbar.' : ''; return h; }
  if (pfad === '/api/zeitplan') return zeitplan(q.get('aktion'), opt);
  throw new Error('Geht nur am PC');
}

// Zeitplan: anzeigen und ändern – der PC übernimmt Änderungen, sobald er läuft
async function zeitplan(aktion, opt) {
  await standHolen(false);
  const z = json(stand.zeitplan || '{"eintraege":[]}');
  if (aktion === 'speichern') {
    const nr = Date.now();
    await setDoc(doc(db, 'akw', 'zeitplanWunsch'), { eintraege: opt.body || '[]', nr, zeit: serverTimestamp() });
    wunsch = { eintraege: opt.body, nr };
  } else if (aktion) {
    z.meldung = 'Geht nur am PC.';
    return z;
  }
  const offen = wunsch && wunsch.nr > (stand.wunschUebernommen || 0);
  if (offen) {
    z.eintraege = json(wunsch.eintraege || '[]');
    z.meldung = aktion === 'speichern'
      ? 'Gespeichert – der PC übernimmt das, sobald er läuft (spätestens 15 Minuten danach).'
      : 'Änderung wartet auf den PC – er übernimmt sie, sobald er läuft.';
  }
  return z;
}
