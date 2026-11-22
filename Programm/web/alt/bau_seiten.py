# Baut aus der bisherigen Ein-Seiten-index.html die Einzelseiten (wie Futsal-App):
# leitstand.css, leitstand.js, fern-start.js + index.html (Übersicht) und eine Datei je Bereich.
import re, os, sys
QUELLE = sys.argv[1]; ZIEL = sys.argv[2]; STEMPEL = sys.argv[3]
os.makedirs(ZIEL, exist_ok=True)
s = open(QUELLE, encoding="utf-8").read()
L = s.split("\n")

def zeile(muster, ab=0):
    for i in range(ab, len(L)):
        if muster in L[i]: return i
    raise SystemExit("nicht gefunden: " + muster)

# ---------- Kopf-Teile ----------
i_style0 = zeile("<style>"); i_style1 = zeile("</style>")
css = "\n".join(L[i_style0 + 1:i_style1])
i_fs0 = zeile("<script>"); i_fs1 = zeile("</script>", i_fs0)
fernstart = "\n".join(L[i_fs0 + 1:i_fs1])
kopf_meta = [l for l in L[:i_style0] if l.startswith("<meta") or l.startswith("<link")]

i_head1 = zeile("<header class=\"kopf\">"); i_head2 = zeile("</header>", i_head1)
header = "\n".join(L[i_head1:i_head2 + 1])
header = header.replace('<div class="marke">', '<a class="marke" href="index.html" data-tip="Zur Übersicht">', 1)
# schließendes </div> der Marke -> </a>
hl = header.split("\n")
for k in range(len(hl)):
    if hl[k].strip() == "</div>" and k > 0 and "ATOMKRAFTWERK" in hl[k - 1]:
        hl[k] = hl[k].replace("</div>", "</a>"); break
header = "\n".join(hl)

i_stand = zeile('id="stand"'); i_fehler = zeile('id="fehler"')
stand = L[i_stand] + "\n" + L[i_fehler]

# ---------- Abschnitte ----------
def abschnitt(muster):
    a = zeile(muster); tief = 0
    for j in range(a, len(L)):
        tief += L[j].count("<section"); tief -= L[j].count("</section>")
        if tief == 0: return "\n".join(L[a:j + 1])
    raise SystemExit("Ende fehlt: " + muster)
sec = {
    "kuehlung": abschnitt('<section class="panel s7" id="kuehlung">'),
    "durchfluss": abschnitt('<section class="panel s5" id="durchfluss">'),
    "prozessor": abschnitt('<section class="panel s4" id="prozessor">'),
    "grafik": abschnitt('<section class="panel s4">\n'.strip()),
    "board": abschnitt('<section class="panel s4" id="board">'),
    "luft": abschnitt('<section class="panel s12" id="luft">'),
    "laufwerke": abschnitt('<section class="panel s12" id="laufwerke">'),
    "strom": abschnitt('<section class="panel s12" id="strom">'),
    "auswertung": abschnitt('<section class="panel s12" id="auswertung">'),
    "zeitplan": abschnitt('<section class="panel s12" id="zeitplan">'),
    "steuerung": abschnitt('<section class="panel s12" id="steuerung">'),
}
i_fr = zeile('<div class="frage" id="pcfrage"'); tief = 0
for j in range(i_fr, len(L)):
    tief += L[j].count("<div"); tief -= L[j].count("</div>")
    if tief == 0: break
pcfrage = "\n".join(L[i_fr:j + 1])
i_d0 = zeile('<dialog id="uhr"'); i_d1 = zeile("</dialog>", zeile('<dialog id="qr"'))
dialoge = "\n".join(L[i_d0:i_d1 + 1])
i_s0 = zeile("<script>", zeile('qrcode.min.js')); i_s1 = len(L) - 1 - L[::-1].index("</script>")
js = "\n".join(L[i_s0 + 1:i_s1])

# ---------- JS anpassen ----------
def ers(a, b, n=1):
    global js
    assert js.count(a) == n, (a[:70], js.count(a)); js = js.replace(a, b)
ers("const $ = id => document.getElementById(id);",
"""// Seit 22.11.2026 Einzelseiten: Jede Seite hat nur ihre Bereiche. Fehlt ein Element, bekommt das Skript
// einen unsichtbaren Platzhalter – so läuft dasselbe Skript auf allen Seiten ohne Fehler.
const ersatzKiste = document.createElement('div'); ersatzKiste.hidden = true;
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ersatzKiste));
const ersatzListe = {};
const $ = id => document.getElementById(id) || ersatzListe[id] || (ersatzListe[id] = (() => {
  const e = document.createElement(id.includes('leiste') ? 'div' : 'span');
  if (id.includes('leiste')) e.innerHTML = '<i></i><i></i><i></i>';
  ersatzKiste.appendChild(e); return e;
})());
const da = id => !!document.getElementById(id);   // gibt es diesen Bereich auf dieser Seite?
const SEITE = document.body.dataset.seite || 'uebersicht';""")
ers("""// Menü: aktiven Bereich markieren
document.querySelectorAll('nav a[href^="#"]').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll(`nav a[href="${a.getAttribute('href')}"]`).forEach(x => x.closest('nav').querySelectorAll('a').forEach(y => y.classList.toggle('an', y === x)));
}));""", """// Menü: aktuelle Seite markieren
document.querySelectorAll('nav a[data-seite]').forEach(a => a.classList.toggle('an', a.dataset.seite === SEITE));""")
ers("""  grenzen = d.grenzen || {};
  adressen = d.adressen || [];""", """  grenzen = d.grenzen || {};
  adressen = d.adressen || [];
  window.dispatchEvent(new CustomEvent('akwdaten', { detail: d }));""")
ers("async function verlauf() {\n  if (!wasserId) return;", "async function verlauf() {\n  if (!wasserId || !da('kuehlung')) return;")
ers("async function wkurve() {\n  if (!wasserId) return;", "async function wkurve() {\n  if (!wasserId || !da('kuehlung')) return;")
ers("async function listeLaden() {\n", "async function listeLaden() {\n  if (!da('auswertung')) return;\n")
ers("async function datenLaden() {\n", "async function datenLaden() {\n  if (!da('auswertung')) return;\n")
ers("async function spitzen() {\n", "async function spitzen() {\n  if (!da('auswertung')) return;\n")
ers("async function kuehlCheck() {\n", "async function kuehlCheck() {\n  if (!da('auswertung')) return;\n")
ers("async function pumpeLaden(ziel, extra) {\n", "async function pumpeLaden(ziel, extra) {\n  if (!da('durchfluss')) return;\n")
ers("async function handy(aktion) {\n", "async function handy(aktion) {\n  if (!da('steuerung')) return;\n")
ers("async function zeitplan(aktion) {\n", "async function zeitplan(aktion) {\n  if (!da('zpaus')) return;\n")

js += r"""

// ---------- Übersicht: Kacheln mit dem Wichtigsten, Tipp öffnet die Seite ----------
if (SEITE === 'uebersicht') {
  const schlimmst = l => l.some(w => w.status === 'alarm') ? 'alarm' : l.some(w => w.status === 'warn') ? 'warn' : '';
  const W = (d, id) => d.werte.find(w => w.id === id) || {};
  const zahl = (w, st = 1) => w.aktuell == null ? '—' : z(w.aktuell, st);
  const kachel = (id, stat, html) => { const k = $(id); k.classList.remove('warn', 'alarm'); if (stat) k.classList.add(stat); k.querySelector('.kwerte').innerHTML = html; };
  const zeile = (name, wert, einh) => `<div><span>${name}</span><b>${wert}<em>${einh}</em></b></div>`;
  window.addEventListener('akwdaten', e => {
    const d = e.detail, w = d.werte;
    const wasser = w.find(x => x.id === 'icue.behälter') || w.find(x => x.gruppe === 'Kühlung' && x.einheit === '°C') || {};
    const pumpe = w.find(x => x.id === 'icue.pumpe') || {};
    if (da('k-kuehlung')) kachel('k-kuehlung', schlimmst(w.filter(x => x.gruppe === 'Kühlung')),
      zeile('Wasser', zahl(wasser), '°C') + zeile('Durchfluss', zahl(W(d, 'flow.durchfluss')), 'l/h') + zeile('Pumpe', zahl(pumpe, 0), 'rpm'));
    kachel('k-cpugpu', schlimmst(w.filter(x => x.gruppe === 'Prozessor' || x.gruppe === 'Grafik')),
      zeile('CPU', zahl(W(d, 'cpu.temp')) + ' °C · ' + zahl(W(d, 'cpu.watt'), 0), 'W') + zeile('GPU', zahl(W(d, 'gpu.temp'), 0) + ' °C · ' + zahl(W(d, 'gpu.watt'), 0), 'W') + zeile('Last', zahl(W(d, 'cpu.last'), 0) + ' % · ' + zahl(W(d, 'gpu.last'), 0), '%'));
    const luft = w.filter(x => x.gruppe === 'Luft'), lw = w.filter(x => x.gruppe === 'Laufwerke');
    const maxv = l => l.length ? Math.max(...l.map(x => x.aktuell ?? -1e9)) : null;
    kachel('k-board', schlimmst(w.filter(x => x.gruppe === 'Board' || x.gruppe === 'Luft' || x.gruppe === 'Laufwerke')),
      zeile('VRM', zahl(W(d, 'board.vrm'), 0), '°C') + zeile('Luft innen max', maxv(luft) == null ? '—' : z(maxv(luft)), '°C') + zeile('Laufwerke max', maxv(lw) == null ? '—' : z(maxv(lw), 0), '°C'));
    const s = d.strom || {};
    kachel('k-strom', schlimmst(w.filter(x => x.gruppe === 'Strom')),
      zeile('Jetzt', zahl(W(d, 'strom.watt'), 0), 'W') + zeile('Heute', s.heuteKWh == null ? '—' : z(s.heuteKWh, 2), 'kWh') + zeile('Kosten heute', s.kostenHeuteEuro == null ? '—' : z(s.kostenHeuteEuro, 2), '€') + zeile('Kosten gesamt' + (s.gesamtSeit ? ' <small class="seit" style="display:block;margin:0">seit ' + s.gesamtSeit.slice(0, 10) + '</small>' : ''), s.gesamtKWh == null || !d.strompreisCentProKWh ? '—' : z(s.gesamtKWh * d.strompreisCentProKWh / 100, 2), '€'));
  });
  // Zeitplan-Kachel: nächstes Aus / An
  (async () => {
    const hol = async () => { try { const z2 = await (await fetch('/api/zeitplan', { cache: 'no-store' })).json();
      $('k-zeitplan').querySelector('.kwerte').innerHTML = zeile('Nächstes Aus', z2.naechstesAus ? zpZeit(z2.naechstesAus) : '—', '') + zeile('Nächstes An', z2.naechstesAn ? zpZeit(z2.naechstesAn) : '—', ''); } catch (e) {} };
    hol(); setInterval(hol, 30000);
  })();
}
"""

# ---------- CSS ergänzen ----------
assert css.count("html{zoom:.7}") == 1
css = css.replace("html{zoom:.7}", "html{zoom:.7}\n@media (min-width:761px){html{zoom:.85}}   /* PC: war 0.7, Oli 22.11.: bei 100 % etwas klein; Handy bleibt 0.7 */")
assert css.count("max-width:1500px") == 1
css = css.replace("max-width:1500px", "max-width:1800px")
css += r"""
/* ===== Einzelseiten (seit 22.11.2026, wie Futsal-App) ===== */
a.marke{color:inherit;text-decoration:none}
.seitenkopf{grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.zurueck{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--linie2);border-radius:8px;color:var(--text2);text-decoration:none;font-weight:600}
.zurueck:hover{border-color:var(--bernstein);color:var(--bernstein)}
.seitenpille{font-family:'Exo',var(--schmal);font-weight:600;letter-spacing:.16em;font-size:15px;color:var(--gruen);border:1px solid var(--gruen);border-radius:999px;padding:6px 16px;text-transform:uppercase}
.kacheln{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
a.kachel{display:flex;flex-direction:column;gap:12px;background:var(--panel);border:1px solid var(--rahmen);box-shadow:inset 3px 0 0 var(--gruen);border-radius:12px;padding:16px 20px;color:var(--text);text-decoration:none;min-height:150px}
a.kachel:hover{border-color:var(--bernstein)}
a.kachel.warn{box-shadow:inset 3px 0 0 var(--warn)} a.kachel.alarm{box-shadow:inset 3px 0 0 var(--alarm);border-color:var(--alarm)}
a.kachel h2{margin:0;line-height:1.2;font-family:'Exo',var(--schmal);font-weight:600;font-size:18px;letter-spacing:.14em;color:var(--text);display:flex;justify-content:space-between;align-items:center;gap:8px}
a.kachel h2::after{content:"›";color:var(--bernstein);font-size:26px;line-height:1}
.kwerte{display:flex;flex-direction:column;gap:8px}
.kwerte div{display:flex;justify-content:space-between;align-items:baseline;gap:10px;color:var(--text2)}
.kwerte span{white-space:nowrap}
.kwerte b{font-family:var(--mono);font-size:20px;color:var(--text);font-weight:600;text-align:right}
.kwerte em{font-style:normal;font-size:13px;color:var(--leise);margin-left:4px}
.ktext{color:var(--leise);font-size:15px}
.s6{grid-column:span 6}
@media (max-width:1100px){.s6{grid-column:span 12}}
@media (max-width:760px){.kacheln{grid-template-columns:1fr 1fr;gap:12px} a.kachel{padding:14px;min-height:0} .kwerte b{font-size:17px} .kwerte div{flex-direction:column;gap:0;align-items:flex-start}}
"""

# ---------- Seiten ----------
SEITEN = [  # datei, schlüssel, Titel lang (Menü/Pille), kurz (unten), Abschnitte
    ("kuehlung.html", "kuehlung", "Kühlkreislauf", "Kühlung", ["kuehlung", "durchfluss"]),
    ("cpu-gpu.html", "cpugpu", "Prozessor & Grafik", "CPU/GPU", ["prozessor", "grafik"]),
    ("board.html", "board", "Board-Wächter", "Board", ["board", "luft", "laufwerke"]),
    ("strom.html", "strom", "Strom & Kosten", "Strom", ["strom"]),
    ("auswertung.html", "auswertung", "Auswertung", "Analyse", ["auswertung"]),
    ("zeitplan.html", "zeitplan", "Zeitplan", "Zeitplan", ["zeitplan"]),
    ("steuerung.html", "steuerung", "Steuerung", "Steuern", ["steuerung"]),
]
def nav_seite():
    a = ['  <nav class="seite" aria-label="Bereiche">', '    <div class="titel">ANLAGE</div>',
         '    <a href="index.html" data-seite="uebersicht">Übersicht</a>']
    a += [f'    <a href="{f}" data-seite="{k}">{t.replace("&", "&amp;")}</a>' for f, k, t, _, _ in SEITEN]
    a += ['    <div class="titel" style="padding-top:18px">AUSBAU</div>',
          '    <a href="#" class="spaeter" aria-disabled="true" data-tip="Balkonkraftwerk: erzeugter Strom – kommt 2027">Erzeugung <span>2027</span></a>',
          '    <a href="#" class="spaeter" aria-disabled="true" data-tip="Balkonkraftwerk: Batteriespeicher – kommt 2027">Speicher <span>2027</span></a>',
          '  </nav>']
    return "\n".join(a)
def nav_unten():
    return "\n".join(['<nav class="unten" aria-label="Bereiche">'] + [f'  <a href="{f}" data-seite="{k}">{kurz}</a>' for f, k, _, kurz, _ in SEITEN] + ['</nav>'])

def seite(titel, schluessel, inhalt):
    kopf = "\n".join(kopf_meta).replace('<title>Atomkraftwerk Leitstand</title>', '')
    return f"""<!doctype html>
<html lang="de">
<head>
<!-- Atomkraftwerk Leitstand · Seite: {titel} · Stand {STEMPEL} (Einzelseiten wie Futsal-App; gemeinsam: leitstand.css, leitstand.js) -->
{kopf}
<title>Atomkraftwerk · {titel}</title>
<script src="fern-start.js"></script>
<link rel="stylesheet" href="leitstand.css">
</head>
<body data-seite="{schluessel}">
{header}

<div class="rahmen">
{nav_seite()}

  <main>
    {stand}
{inhalt}
{pcfrage if schluessel == 'steuerung' else ''}
  </main>
</div>

{nav_unten()}

{dialoge}
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script src="leitstand.js"></script>
</body>
</html>
"""
def seitenkopf(titel):
    return f'    <div class="seitenkopf"><a class="zurueck" href="index.html">← Übersicht</a><span class="seitenpille">{titel.replace("&", "&amp;")}</span></div>'

for f, k, t, kurz, teile in SEITEN:
    inhalt = seitenkopf(t) + "\n" + "\n".join(sec[x] for x in teile)
    if k == "cpugpu": inhalt = inhalt.replace('class="panel s4"', 'class="panel s6"')
    if k == "board": inhalt = inhalt.replace('class="panel s4" id="board"', 'class="panel s12" id="board"')
    open(os.path.join(ZIEL, f), "w", encoding="utf-8").write(seite(t, k, inhalt))

def k(id, href, titel, inhalt):
    return f'      <a class="kachel" id="{id}" href="{href}"><h2>{titel}</h2>{inhalt}</a>'
kach = "\n".join([
    '    <div class="seitenkopf"><span class="seitenpille">Übersicht</span></div>',
    sec["kuehlung"], sec["durchfluss"],
    '    <div class="kacheln">',
    k("k-cpugpu", "cpu-gpu.html", "PROZESSOR &amp; GRAFIK", '<div class="kwerte">—</div>'),
    k("k-board", "board.html", "BOARD-WÄCHTER", '<div class="kwerte">—</div>'),
    k("k-strom", "strom.html", "STROM &amp; KOSTEN", '<div class="kwerte">—</div>'),
    k("k-auswertung", "auswertung.html", "AUSWERTUNG", '<div class="ktext">Verläufe von heute bis Jahr, Spitzen, Kühlung-Check</div>'),
    k("k-zeitplan", "zeitplan.html", "ZEITPLAN", '<div class="kwerte">—</div>'),
    k("k-steuerung", "steuerung.html", "STEUERUNG", '<div class="ktext">Handy-Alarm, PC ausschalten</div>'),
    '    </div>'])
open(os.path.join(ZIEL, "index.html"), "w", encoding="utf-8").write(seite("Übersicht", "uebersicht", kach))
open(os.path.join(ZIEL, "leitstand.css"), "w", encoding="utf-8").write(f"/* Atomkraftwerk Leitstand – gemeinsames Aussehen aller Seiten · Stand {STEMPEL} */\n" + css + "\n")
open(os.path.join(ZIEL, "leitstand.js"), "w", encoding="utf-8").write(f"// Atomkraftwerk Leitstand – gemeinsames Skript aller Seiten · Stand {STEMPEL}\n" + js + "\n")
open(os.path.join(ZIEL, "fern-start.js"), "w", encoding="utf-8").write(f"// Fernansicht-Start (vor allem anderen laden) · Stand {STEMPEL}\n" + fernstart + "\n")
print("fertig", sorted(os.listdir(ZIEL)))
