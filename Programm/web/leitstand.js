// Atomkraftwerk Leitstand – gemeinsames Skript aller Seiten · Stand 23.11.2026 00:10
// Seit 22.11.2026 Einzelseiten: Jede Seite hat nur ihre Bereiche. Fehlt ein Element, bekommt das Skript
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
const SEITE = document.body.dataset.seite || 'uebersicht';
let adressen = [];
$('handyknopf').onclick = () => {
  const url = adressen[0];
  $('qrbild').innerHTML = '';
  if (!url) { $('qradresse').textContent = 'Keine Heimnetz-Adresse gefunden.'; }
  else if (window.QRCode) { new QRCode($('qrbild'), { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); $('qradresse').textContent = url; }
  else { $('qradresse').textContent = url; }
  $('qrbild').style.display = url && window.QRCode ? 'inline-block' : 'none';
  $('qr').showModal();
};
const z = (v, st = 1) => v == null ? '—' : v.toFixed(st).replace('.', ',');

// Hell / Dunkel – Wahl merken (falls der Browser das erlaubt)
function thema(t) {
  document.documentElement.dataset.theme = t;
  $('thema').textContent = t === 'hell' ? 'Dunkel' : 'Hell';
  try { localStorage.setItem('akw-thema', t); } catch (e) {}
}
let gemerkt = null; try { gemerkt = localStorage.getItem('akw-thema'); } catch (e) {}
function luefterZeigen(auf) {
  $('lkopf').setAttribute('aria-expanded', auf ? 'true' : 'false');
  $('luefter').hidden = !auf;
}
{ let auf = false; try { auf = localStorage.getItem('akw-luefter') === 'auf'; } catch (e) {}
  luefterZeigen(auf);
  $('lkopf').addEventListener('click', () => {
    const neu = $('luefter').hidden;
    luefterZeigen(neu);
    try { localStorage.setItem('akw-luefter', neu ? 'auf' : 'zu'); } catch (e) {}
  }); }
thema(gemerkt || 'dunkel');
$('thema').onclick = () => thema(document.documentElement.dataset.theme === 'hell' ? 'dunkel' : 'hell');

// Menü: aktuelle Seite markieren
document.querySelectorAll('nav a[data-seite]').forEach(a => a.classList.toggle('an', a.dataset.seite === SEITE));

let wasserId = null, einlassId = null, grenzen = {};

function wert(d, id) { return d.werte.find(w => w.id === id) || {}; }
function setze(id, w, st = 1, einh = '') { $(id).textContent = w == null ? '—' : z(w, st) + einh; }

// Balken mit sichtbaren Grenzen: gelber Bereich ab Warnung, roter Bereich ab Alarm
function leiste(el, v, von, bis, warn, alarm, st, einh) {
  const box = $(el), pos = x => Math.max(0, Math.min(100, (x - von) / (bis - von) * 100));
  box.className = 'leiste' + (v == null ? '' : v >= alarm ? ' alarm' : v >= warn ? ' warn' : '');
  const [w, a, f] = box.children;
  w.style.left = pos(warn) + '%'; w.style.width = (pos(alarm) - pos(warn)) + '%';
  a.style.left = pos(alarm) + '%'; a.style.right = '0';
  f.style.width = v == null ? '0' : pos(v) + '%';
  $(el.replace('leiste', 'skala')).innerHTML = `<span>${z(von, st)}</span><span style="color:var(--alarm)">ab ${z(alarm, st)} ${einh} rot</span><span>${z(bis, st)}</span>`;
}

let letzterStand = null; // Uhrzeit der letzten erfolgreichen Abfrage
async function laden() {
  let d;
  try { d = await (await fetch('/api/jetzt', { cache: 'no-store' })).json(); }
  catch (e) {
    // PC aus: letzte Werte stehen lassen, nur dezent den Stand anzeigen
    if (letzterStand) { $('fehler').style.display = 'none'; $('stand').style.display = 'block'; $('standzeit').textContent = letzterStand; $('pilletext').textContent = 'PC aus'; $('pille').className = 'pille aus'; }
    else { $('fehler').style.display = 'block'; $('pilletext').textContent = 'keine Verbindung'; $('pille').className = 'pille alarm'; }
    return;
  }
  $('fehler').style.display = 'none'; $('stand').style.display = 'none';
  letzterStand = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.startLink) $('pcstart').href = d.startLink;
  grenzen = d.grenzen || {};
  adressen = d.adressen || [];
  window.dispatchEvent(new CustomEvent('akwdaten', { detail: d }));

  const st = { ok: 'Alle Systeme im Normalbereich', warn: 'Warnung', alarm: 'ALARM' };
  $('pille').className = 'pille ' + (d.status === 'ok' ? '' : d.status);
  $('pilletext').textContent = st[d.status] || d.status;
  const h = d.laufzeitHeuteStunden, lz = `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} h`;
  $('laufzeit').textContent = 'Laufzeit heute ' + lz; $('laufzeit2').textContent = lz;

  // Kühlung aus iCUE
  const icue = d.werte.filter(w => w.id.startsWith('icue.'));
  const wasser = icue.find(w => w.einheit === '°C' && /beh|wasser|coolant|reservoir/i.test(w.name)) || icue.find(w => w.einheit === '°C' && w.gruppe !== 'Luft');
  if (wasser) {
    wasserId = wasser.id;
    $('wname').textContent = wasser.name.toUpperCase();
    $('wasser').textContent = z(wasser.aktuell);
    $('wmin').textContent = wasser.min == null ? '—' : z(wasser.min) + '°';
    $('wmax').textContent = wasser.max == null ? '—' : z(wasser.max) + '°';
    $('wavg').textContent = wasser.schnitt == null ? '—' : z(wasser.schnitt) + '°';
    const p = $('kuehlung'); p.className = 'panel s7 ' + (wasser.status === 'ok' || wasser.status === 'aus' ? '' : wasser.status);
  }
  $('icueinfo').textContent = d.icue.laeuft ? '' : 'iCUE-Protokoll läuft nicht';
  // Durchfluss vom high flow NEXT
  const fl = wert(d, 'flow.durchfluss');
  $('fluss').textContent = fl.aktuell == null ? '—' : z(fl.aktuell);
  $('fmin').textContent = fl.min == null ? '—' : z(fl.min);
  $('fmax').textContent = fl.max == null ? '—' : z(fl.max);
  $('favg').textContent = fl.schnitt == null ? '—' : z(fl.schnitt);
  const lw = wert(d, 'flow.leitwert').aktuell, qu = wert(d, 'flow.qualitaet').aktuell, fw = wert(d, 'flow.wasser').aktuell;
  $('leitwert').textContent = lw == null ? '— µS/cm' : z(lw) + ' µS/cm';
  $('qualitaet').textContent = qu == null ? '— %' : Math.round(qu) + ' %';
  $('flusswasser').textContent = fw == null ? '— °C' : z(fw) + ' °C';
  $('flussbox').dataset.tip = `Durchfluss des Kühlwassers in Liter pro Stunde, gemessen vom high flow NEXT. Gelb ab ${grenzen.flussWarnLh} l/h und weniger, rot ab ${grenzen.flussAlarmLh} l/h und weniger` + (grenzen.flussAlarmAbWasserC > 0 ? `, rot aber nur, wenn das Wasser zugleich ${grenzen.flussAlarmAbWasserC} °C oder wärmer ist` : '');
  $('durchfluss').className = 'panel s5 ' + (fl.status === 'alarm' || fl.status === 'warn' ? fl.status : '');
  const pu = icue.find(w => /pumpe/i.test(w.name));
  $('pumpe').textContent = 'Pumpe ' + (pu && pu.aktuell != null ? Math.round(pu.aktuell) : '—') + ' rpm';
  const rpm = icue.filter(w => w.einheit === 'rpm' && w !== pu);
  const lwerte = rpm.map(w => w.aktuell).filter(v => v != null).map(Math.round);
  $('lanz').textContent = '(' + rpm.length + ')';
  $('lspanne').textContent = !lwerte.length ? '— rpm' : (Math.min(...lwerte) === Math.max(...lwerte) ? lwerte[0] : Math.min(...lwerte) + '–' + Math.max(...lwerte)) + ' rpm';
  $('luefter').innerHTML = rpm.map(w => `<div data-tip="${w.name}"><span>${w.name.replace(/^iCUE LINK /, '').replace(/: Lüfter$/, '')}</span><b>${w.aktuell == null ? '—' : Math.round(w.aktuell) + ' rpm'}</b></div>`).join('');

  // Prozessor & Grafik
  const ct = wert(d, 'cpu.temp');
  $('cpuname').textContent = (d.hardware.cpu || 'PROZESSOR').toUpperCase();
  $('cputemp').textContent = ct.aktuell == null ? '—' : Math.round(ct.aktuell);
  setze('cpuwatt', wert(d, 'cpu.watt').aktuell, 0, ' W');
  setze('cpulast', wert(d, 'cpu.last').aktuell, 0, ' %');
  setze('ram', wert(d, 'ram.belegt').aktuell, 1, ' GB');
  setze('cpumin', ct.min, 1, '°'); setze('cpumax', ct.max, 1, '°'); setze('cpuavg', ct.schnitt, 1, '°');
  const gt = wert(d, 'gpu.temp'), gh = wert(d, 'gpu.hotspot');
  $('gpuname').textContent = (d.hardware.gpu || 'GRAFIK').replace(/^AMD /, '').toUpperCase();
  $('gputemp').textContent = gt.aktuell == null ? '—' : Math.round(gt.aktuell);
  setze('gpuwatt', wert(d, 'gpu.watt').aktuell, 0, ' W');
  setze('gpulast', wert(d, 'gpu.last').aktuell, 0, ' %');
  const gl = wert(d, 'gpu.luefter').aktuell; $('gpuluef').textContent = gl == null ? '— rpm' : Math.round(gl) + ' rpm';
  setze('gpuhot', gh.aktuell, 1, '°'); setze('gpumax', gt.max, 1, '°'); setze('gpuavg', gt.schnitt, 1, '°');

  // Luft im Gehäuse (nur gelb ab Grenze, kein Alarm, nichts aufs Handy)
  const luft = d.werte.filter(w => w.gruppe === 'Luft');
  $('luft').style.display = luft.length ? '' : 'none';
  const ein = luft.find(w => /einlass/i.test(w.name)), aus = luft.find(w => /auslass/i.test(w.name));
  const diff = (a, b) => a && b && a.aktuell != null && b.aktuell != null ? a.aktuell - b.aktuell : null;
  const dA = diff(aus, ein), dW = diff(wasser, ein);
  $('luftfelder').innerHTML = luft.map(w => `<div class="feld ${w.status === 'warn' ? 'warn' : ''}" data-tip="${w.name} · seit Programmstart min ${z(w.min)} °C, max ${z(w.max)} °C, Ø ${z(w.schnitt)} °C. Gelb ab ${grenzen.luftWarnC} °C (nur im Leitstand, kein Alarm, nichts aufs Handy)"><small>${w.name.replace(/^Commander PRO /i, '').replace(/^Temp /i, '').toUpperCase()}</small><b>${w.aktuell == null ? '—' : z(w.aktuell)} <em>°C</em></b></div>`).join('')
    + (ein ? `<div class="feld" data-tip="Auslass oben minus Einlass: so stark erwärmt sich die Luft auf dem Weg durch den PC"><small>Δ AUSLASS − EINLASS</small><b>${dA == null ? '—' : z(dA)} <em>K</em></b></div>`
      + `<div class="feld" data-tip="Wasser im Behälter minus Einlass-Luft: je kleiner, desto besser arbeiten die Radiatoren"><small>Δ WASSER − EINLASS</small><b>${dW == null ? '—' : z(dW)} <em>K</em></b></div>` : '');

  einlassId = ein ? ein.id : null;
  $('wdeltafeld').style.display = ein ? '' : 'none'; $('wlegluft').style.display = ein ? '' : 'none';
  $('wdelta').innerHTML = dW == null ? '—' : z(dW) + ' <em>K</em>';
  if (wasser) leiste('wleiste', wasser.aktuell, 20, 50, grenzen.wasserWarnC, grenzen.wasserAlarmC, 0, '°C');

  // Laufwerke
  const lwListe = d.werte.filter(w => w.gruppe === 'Laufwerke');
  $('laufwerke').style.display = lwListe.length ? '' : 'none';
  $('lwfelder').innerHTML = lwListe.map(w => `<div class="feld ${w.status === 'warn' || w.status === 'alarm' ? w.status : ''}" data-tip="${w.name} · seit Programmstart min ${z(w.min)} °C, max ${z(w.max)} °C, Ø ${z(w.schnitt)} °C. Gelb ab ${grenzen.laufwerkWarnC} °C, rot ab ${grenzen.laufwerkAlarmC} °C"><small>${w.name.toUpperCase()}</small><b>${w.aktuell == null ? '—' : z(w.aktuell)} <em>°C</em></b></div>`).join('');

  // Strom von der FRITZ!DECT-Steckdose
  const sw = wert(d, 'strom.watt'), sd = d.strom || {};
  const zahlEinh = (v, st, e) => v == null ? `— <em>${e}</em>` : `${z(v, st)} <em>${e}</em>`;
  $('sjetzt').innerHTML = zahlEinh(sw.aktuell, 0, 'W');
  const stt = wert(d, 'strom.temp');
  $('stemp').innerHTML = zahlEinh(stt.aktuell, 1, '°C');
  $('stemptip').dataset.tip = 'Temperatur am Fühler der FRITZ!-Steckdose (sitzt unten an der Wand unter dem PC-Brett)' + (stt.min == null ? '' : ` · seit Programmstart min ${z(stt.min, 1)} °C, max ${z(stt.max, 1)} °C, Ø ${z(stt.schnitt, 1)} °C`);
  $('sjetzttip').dataset.tip = 'Was der ganze PC gerade an der Steckdose zieht' + (sw.min == null ? '' : ` · seit Programmstart min ${z(sw.min, 0)} W, max ${z(sw.max, 0)} W, Ø ${z(sw.schnitt, 0)} W`);
  $('sheute').innerHTML = zahlEinh(sd.heuteKWh, 2, 'kWh');
  $('sheutetip').dataset.tip = 'Verbrauch heute, Standby mitgezählt' + (sd.kostenHeuteEuro == null ? '' : ` · Kosten heute ${z(sd.kostenHeuteEuro, 2)} €`);
  $('sschnitt').innerHTML = zahlEinh(sd.schnittTagKWh, 2, 'kWh');
  $('sgesamt').innerHTML = zahlEinh(sd.gesamtKWh, 1, 'kWh');
  $('sstandby').innerHTML = sd.standbyWatt == null ? '— <em>W</em>' : 'Ø ' + zahlEinh(sd.standbyWatt, 1, 'W');
  $('sstandbytip').dataset.tip = sd.standbyWatt == null
    ? 'Was an der Steckdose gezogen wird, während der PC aus ist. Wird beim nächsten Start nach einem Herunterfahren berechnet'
    : `PC aus von ${sd.standbyVon} bis ${sd.standbyBis} Uhr: ${z(sd.standbyKWh, 3)} kWh, im Schnitt ${z(sd.standbyWatt, 1)} W` + (sd.standbyKWh != null && d.strompreisCentProKWh ? ` · Kosten ${z(sd.standbyKWh * d.strompreisCentProKWh / 100, 2)} €` : '');
  $('skosten').innerHTML = zahlEinh(sd.kostenMonatEuro, 2, '€');
  $('skostenheute').innerHTML = zahlEinh(sd.kostenHeuteEuro, 2, '€');
  $('skostenheutetip').dataset.tip = `Stromkosten heute bei ${z(d.strompreisCentProKWh, 2)} Cent/kWh, Standby mitgezählt. Wird alle 5 Minuten aus der FRITZ!Box aktualisiert`;
  $('skostentip').dataset.tip = `Stromkosten in diesem Monat bei ${z(d.strompreisCentProKWh, 2)} Cent/kWh (Preis steht in atomkraftwerk.json)`;
  $('skostengesamt').innerHTML = zahlEinh(sd.gesamtKWh == null || !d.strompreisCentProKWh ? null : sd.gesamtKWh * d.strompreisCentProKWh / 100, 2, '€');
  const seit = sd.gesamtSeit ? 'seit ' + sd.gesamtSeit.slice(0, 10) : '';
  $('sgesamtseit').textContent = seit; $('skostenseit').textContent = seit;
  const zurueck = (sd.gesamtSeit || '').includes(':');   // mit Uhrzeit = im Leitstand zurückgesetzt, sonst Messbeginn
  const seitText = !sd.gesamtSeit ? 'seit Beginn der Messung' : zurueck ? 'seit dem Zurücksetzen am ' + sd.gesamtSeit + ' Uhr' : 'seit Beginn der Messung am ' + sd.gesamtSeit;
  $('sgesamttip').dataset.tip = 'Verbrauch ' + seitText;
  $('skostengesamttip').dataset.tip = `Stromkosten ${seitText} bei ${z(d.strompreisCentProKWh, 2)} Cent/kWh (Preis steht in atomkraftwerk.json)`;
  const mk = $('strommarke');
  mk.style.display = sd.verbunden ? 'none' : '';
  mk.textContent = !sd.eingerichtet ? 'Kennwort fehlt' : 'keine Verbindung';
  mk.dataset.tip = sd.meldung || 'Verbindung zur FRITZ!Box';

  // Board-Wächter
  const vrm = wert(d, 'board.vrm'), soc = wert(d, 'board.soc'), pch = wert(d, 'board.pch');
  $('vrm').textContent = vrm.aktuell == null ? '—' : `${z(vrm.aktuell)} / ${grenzen.vrmAlarmC} °C`;
  $('soc').textContent = soc.aktuell == null ? '—' : `${z(soc.aktuell, 3)} / ${z(grenzen.socAlarmV, 2)} V`;
  $('pch').textContent = pch.aktuell == null ? '—' : z(pch.aktuell) + ' °C';
  $('vrmtip').dataset.tip = `Temperatur der Spannungswandler rund um den CPU-Sockel. Gelb ab ${grenzen.vrmWarnC} °C, rot ab ${grenzen.vrmAlarmC} °C`;
  $('soctip').dataset.tip = `SoC-Spannung: versorgt Speicher-Controller und Infinity Fabric. Gelb ab ${z(grenzen.socWarnV, 2)} V, rot ab ${z(grenzen.socAlarmV, 2)} V`;
  $('wgrenztip').dataset.tip = `Abstand zur Grenze: gelb ab ${grenzen.wasserWarnC} °C, rot ab ${grenzen.wasserAlarmC} °C`;
  $('wasser').dataset.tip = `Kühlwassertemperatur im Behälter, live aus iCUE. Gelb ab ${grenzen.wasserWarnC} °C, rot ab ${grenzen.wasserAlarmC} °C`;
  leiste('vrmleiste', vrm.aktuell, 20, 110, grenzen.vrmWarnC, grenzen.vrmAlarmC, 0, '°C');
  leiste('socleiste', soc.aktuell, 1.0, 1.4, grenzen.socWarnV, grenzen.socAlarmV, 2, 'V');
  $('board').className = 'panel s4 ' + ([vrm.status, soc.status].includes('alarm') ? 'alarm' : [vrm.status, soc.status].includes('warn') ? 'warn' : '');
}

// Verlauf + Trendpfeil der Wassertemperatur (alle 10 Sekunden)
async function verlauf() {
  if (!wasserId || !da('kuehlung')) return;
  let pkt;
  try { pkt = await (await fetch('/api/verlauf?id=' + encodeURIComponent(wasserId), { cache: 'no-store' })).json(); } catch (e) { return; }
  if (!pkt.length) return;
  // Trend: letzte 10 s gegen vor 60 s, Schwelle 0,2 °C
  if (pkt.length >= 13) {
    const neu = (pkt.at(-1).v + pkt.at(-2).v) / 2, alt = (pkt.at(-13).v + pkt.at(-12).v) / 2, diff = neu - alt;
    const pf = $('pfeil');
    if (diff >= 0.2) { pf.textContent = '▲'; pf.className = 'tpfeil steigt'; $('trendtext').textContent = 'steigt'; }
    else if (diff <= -0.2) { pf.textContent = '▼'; pf.className = 'tpfeil faellt'; $('trendtext').textContent = 'fällt'; }
    else { pf.textContent = '►'; pf.className = 'tpfeil steht'; $('trendtext').textContent = 'gleichbleibend'; }
  }
}

// Kurve der letzten 3 Stunden: Wasser im Behälter und Einlassluft (Minutenwerte von heute, jede Minute neu)
let wgeo = null;
async function wkurve() {
  if (!wasserId || !da('kuehlung')) return;
  const hol = async id => { try { return (await (await fetch('/api/auswertung?zeitraum=heute&id=' + encodeURIComponent(id), { cache: 'no-store' })).json()).punkte || []; } catch (e) { return []; } };
  const roh = await hol(wasserId), rohL = einlassId ? await hol(einlassId) : [];
  const box = $('wkurve'), svg = $('wsvg'), W = box.clientWidth, H = box.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!roh.length) { svg.innerHTML = `<text x="16" y="28" style="font-family:var(--sans);font-size:14px;fill:var(--leise)">Noch keine Minutenwerte von heute.</text>`; wgeo = null; return; }
  const ms = q => ({ t: new Date(q.t).getTime(), v: q.v });
  const bis = new Date(roh.at(-1).t).getTime(), von = bis - 180 * 60e3;
  const pw = roh.map(ms).filter(q => q.t >= von && q.v > 5 && q.v < 80), pl = rohL.map(ms).filter(q => q.t >= von && q.v > 0 && q.v < 80);
  const alle = pw.concat(pl).map(q => q.v), warn = grenzen.wasserWarnC;
  let lo = Math.floor(Math.min(...alle) - 1), hi = Math.ceil(Math.max(...alle) + 1);
  const mitWarn = warn && Math.max(...pw.map(q => q.v)) >= warn - 5; if (mitWarn) hi = Math.max(hi, warn + 1);
  const L = 40, R = 12, O = 12, U = 24, x = t => L + (t - von) / (bis - von) * (W - L - R), y = v => O + (1 - (v - lo) / (hi - lo)) * (H - O - U);
  const schritt = [1, 2, 5, 10].find(k => (hi - lo) / k <= 6) || 10;
  let h = '';
  for (let v = Math.ceil(lo / schritt) * schritt; v <= hi; v += schritt) h += `<line class="hilf" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" style="opacity:.6"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}°</text>`;
  const d0 = new Date(von); d0.setSeconds(0, 0); d0.setMinutes(Math.ceil(d0.getMinutes() / 30) * 30);
  for (; d0.getTime() <= bis; d0.setMinutes(d0.getMinutes() + 30)) { const xt = x(d0.getTime()); h += `<line class="hilf" x1="${xt}" x2="${xt}" y1="${O}" y2="${H - U}" style="opacity:.35"/><text x="${xt}" y="${H - 7}" text-anchor="${xt > W - R - 24 ? 'end' : 'middle'}">${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}</text>`; }
  if (mitWarn) h += `<line x1="${L}" x2="${W - R}" y1="${y(warn)}" y2="${y(warn)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${W - R - 4}" y="${y(warn) - 5}" text-anchor="end" style="fill:var(--warn)">Warnung ab ${warn} °C</text>`;
  const pfad = p => { let d = '', l = null; p.forEach(q => { d += (l == null || q.t - l > 150e3 ? 'M' : 'L') + x(q.t).toFixed(1) + ',' + y(q.v).toFixed(1); l = q.t; }); return d; };
  if (pl.length) h += `<path d="${pfad(pl)}" fill="none" stroke="var(--bernstein)" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/>`;
  if (pw.length) {
    h += `<path d="${pfad(pw)}L${x(pw.at(-1).t).toFixed(1)},${H - U}L${x(pw[0].t).toFixed(1)},${H - U}Z" fill="var(--wasser)" opacity=".10"/>`;
    h += `<path d="${pfad(pw)}" fill="none" stroke="var(--wasser)" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${x(pw.at(-1).t)}" cy="${y(pw.at(-1).v)}" r="4" fill="var(--wasser)"/>`;
  }
  h += `<line id="wzeiger" x1="-10" x2="-10" y1="${O}" y2="${H - U}" stroke="var(--text2)" stroke-width="1" stroke-dasharray="3 3"/>`;
  svg.innerHTML = h; wgeo = { pw, pl, von, bis, L, R };
}
function wzeigen(e) {
  if (!wgeo || !wgeo.pw.length) return;
  const zf = ZOOM(), r0 = $('wkurve').getBoundingClientRect(), { pw, pl, von, bis, L, R } = wgeo, br = r0.width / zf;
  const t = von + (e.clientX / zf - r0.left / zf - L) / (br - L - R) * (bis - von);
  const nah = p => p.reduce((a, q) => Math.abs(q.t - t) < Math.abs(a.t - t) ? q : a, p[0]);
  const q = nah(pw), xs = L + (q.t - von) / (bis - von) * (br - L - R), lu = pl.length ? nah(pl) : null, d = new Date(q.t);
  $('wzeiger').setAttribute('x1', xs); $('wzeiger').setAttribute('x2', xs);
  const info = $('winfo');
  info.innerHTML = `<b>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr</b><br><span style="color:var(--wasser)">Wasser ${z(q.v)} °C</span>` + (lu ? `<br><span style="color:var(--bernstein)">Einlass ${z(lu.v)} °C</span><br>Abstand ${z(q.v - lu.v)} K` : '');
  info.style.display = 'block'; info.style.left = (xs > br / 2 ? Math.max(4, xs - info.offsetWidth - 12) : xs + 12) + 'px';
}
$('wkurve').addEventListener('pointermove', wzeigen);
$('wkurve').addEventListener('pointerdown', wzeigen);
$('wkurve').addEventListener('pointerleave', () => { $('winfo').style.display = 'none'; const w = $('wzeiger'); if (w) { w.setAttribute('x1', -10); w.setAttribute('x2', -10); } });
addEventListener('resize', wkurve);

// Hinweise: sofort beim Drüberfahren, auf dem Handy per Antippen (3 s)
// Seite am PC auf 70 % verkleinert (CSS zoom) – Mauskoordinaten dafür umrechnen
const ZOOM = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
let tipEl = null, tipUhr;
function tipAus() { tip.style.display = 'none'; tipEl = null; }
function tipAn(el, x, y) {
  if (el !== tipEl) { tipEl = el; tip.textContent = el.dataset.tip; tip.style.display = 'block'; }
  const r = tip.getBoundingClientRect();
  let l = x + 16, t = y + 18;
  if (l + r.width > innerWidth - 8) l = x - r.width - 12;
  if (t + r.height > innerHeight - 8) t = y - r.height - 12;
  const zf = ZOOM(); tip.style.left = Math.max(8, l) / zf + 'px'; tip.style.top = Math.max(8, t) / zf + 'px';
}
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('[data-tip]');
  el && el.dataset.tip ? tipAn(el, e.clientX, e.clientY) : tipAus();
});
document.documentElement.addEventListener('mouseleave', tipAus);
addEventListener('scroll', tipAus, { passive: true });
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const el = e.target.closest('[data-tip]');
  if (!el || !el.dataset.tip) return tipAus();
  tipEl = null; tipAn(el, e.clientX, e.clientY);
  clearTimeout(tipUhr); tipUhr = setTimeout(tipAus, 3000);
});

// ---------- Auswertung ----------
let liste = [], daten = null, daten2 = null, geo = null;
const wtId = () => (liste.find(w => w.bereich === 'Wasser' && /beh/i.test(w.name)) || {}).id;
const mitWt = () => $('awert').value === 'flow.durchfluss' && $('awt').checked && !!wtId();
const stellenE = e => e === 'V' || e === 'kWh' ? (e === 'kWh' ? 2 : 3) : (e === 'rpm' || e === 'W' || e === '%') ? 0 : 1;
const mitE = e => e ? ' ' + e : '';
const zp = t => new Date(t);
const zeitText = (t, schritt) => {
  const d = zp(t), dd = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return schritt === 'minute' ? hm + ' Uhr' : schritt === 'stunde' ? dd + ' ' + hm + ' Uhr' : schritt === 'tag' ? dd + d.getFullYear() : ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][d.getMonth()] + ' ' + d.getFullYear();
};
async function listeLaden() {
  if (!da('auswertung')) return;
  try { liste = await (await fetch('/api/auswertung/liste', { cache: 'no-store' })).json(); } catch (e) { return; }
  werteFuellen();
  await datenLaden();
}
function werteFuellen() {
  const b = $('abereich').value, alt = $('awert').value;
  const l = liste.filter(w => w.bereich === b);
  $('awert').innerHTML = l.map(w => `<option value="${w.id}">${w.name}${w.einheit ? ' (' + w.einheit + ')' : ''}</option>`).join('');
  if (l.some(w => w.id === alt)) $('awert').value = alt;
}
async function datenLaden() {
  if (!da('auswertung')) return;
  const id = $('awert').value; if (!id) return;
  $('awtbox').style.display = id === 'flow.durchfluss' && wtId() ? '' : 'none';
  try { daten = await (await fetch(`/api/auswertung?zeitraum=${$('azeit').value}&id=${encodeURIComponent(id)}`, { cache: 'no-store' })).json(); } catch (e) { return; }
  daten2 = null;
  if (mitWt()) { try { daten2 = await (await fetch(`/api/auswertung?zeitraum=${$('azeit').value}&id=${encodeURIComponent(wtId())}`, { cache: 'no-store' })).json(); } catch (e) { } }
  zeichnen();
}
function zeichnen() {
  const box = $('adia'), svg = $('asvg');
  if (!daten || !daten.punkte || !daten.punkte.length) {
    svg.innerHTML = ''; geo = null; box.style.height = '80px';
    svg.innerHTML = `<text x="20" y="45" style="font-family:var(--sans);font-size:14px;fill:var(--leise)">Für diesen Zeitraum liegen noch keine Werte vor.</text>`;
    svg.setAttribute('viewBox', `0 0 ${box.clientWidth} 80`); $('aleg').innerHTML = ''; return;
  }
  const zwei = !!(daten2 && daten2.punkte && daten2.punkte.length && mitWt());
  const H = 300, U = 26, O = 26, L = 64, R = zwei ? 58 : 14; box.style.height = H + 'px';
  const W = box.clientWidth; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let p = daten.punkte.map(q => ({ t: zp(q.t).getTime(), v: q.v, max: q.max, roh: q.t }));
  const ausschnitt = daten.schritt === 'minute' ? +$('adetail').value : 0;
  if (ausschnitt && p.length) { const grenze = p[p.length - 1].t - ausschnitt * 60e3; p = p.filter(q => q.t >= grenze); }
  const balken = daten.art === 'balken';
  const schrittMs = { minute: 60e3, stunde: 3600e3, tag: 864e5, monat: 30 * 864e5 }[daten.schritt];
  const bv = daten.von && !ausschnitt ? zp(daten.von).getTime() : p[0].t, bb = daten.bis ? zp(daten.bis).getTime() : p[p.length - 1].t;
  const von = Math.min(bv, p[0].t) - (balken ? schrittMs / 2 : 0), bis = Math.max(bb, p[p.length - 1].t + (balken ? schrittMs / 2 : 0), von + schrittMs);
  const x = t => L + (t - von) / (bis - von) * (W - L - R);
  const werte = p.map(q => q.v);
  let mn = Math.min(...werte), mx = Math.max(...werte);
  if (balken) mn = Math.min(0, mn);
  const sp = (mx - mn) || Math.max(1, Math.abs(mx) * 0.05), u = balken ? mn : mn - sp * 0.1, o = mx + sp * 0.15;
  const y = v => O + (1 - (v - u) / (o - u)) * (H - O - U);
  const st = stellenE(daten.einheit);
  let h = '';
  // Achsen
  [u + (o - u) * 0.0, (mn + mx) / 2, mx].forEach((v, i) => {
    const vv = i === 0 ? (balken ? 0 : mn) : v;
    h += `<line class="linie-hilf" x1="${L}" x2="${W - R}" y1="${y(vv)}" y2="${y(vv)}" style="opacity:.6"/><text x="${L - 6}" y="${y(vv) + 4}" text-anchor="end">${z(vv, st)}</text>`;
  });
  const anzahl = Math.max(2, Math.floor((W - L - R) / 100));
  let marken = [];
  if (daten.schritt === 'stunde') { const d = new Date(von); d.setHours(24, 0, 0, 0); for (; d.getTime() <= bis; d.setDate(d.getDate() + 1)) marken.push(d.getTime()); }
  else if (daten.schritt === 'minute') {
    const st = [10, 15, 30, 60, 120, 180].find(m => (W - L - R) / ((bis - von) / (m * 60e3)) >= 80) || 240;
    const d = new Date(von); d.setSeconds(0, 0); d.setMinutes(Math.ceil((d.getHours() * 60 + d.getMinutes()) / st) * st - d.getHours() * 60);
    for (; d.getTime() <= bis; d.setMinutes(d.getMinutes() + st)) marken.push(d.getTime());
  }
  else for (let k = 0; k <= anzahl; k++) marken.push(von + (bis - von) * k / anzahl);
  marken.forEach((t, k) => {
    const d = new Date(t);
    const txt = daten.schritt === 'minute' ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : daten.schritt === 'monat' ? ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][d.getMonth()]
      : String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + '';
    const xt = x(t), anker = xt < L + 30 ? 'start' : xt > W - R - 30 ? 'end' : 'middle';
    h += `<line class="linie-hilf" x1="${xt}" x2="${xt}" y1="${O}" y2="${H - U}" style="opacity:.35"/><text x="${xt}" y="${H - 8}" text-anchor="${anker}">${txt}</text>`;
  });
  h += `<text x="${L + 8}" y="16" style="fill:var(--wasser);font-family:var(--sans);font-size:13px;font-weight:600">${daten.name}${daten.einheit ? ' (' + daten.einheit + ')' : ''}</text>`;
  let p2 = [], y2 = null;
  if (zwei) {
    p2 = daten2.punkte.map(q => ({ t: zp(q.t).getTime(), v: q.v, roh: q.t })).filter(q => q.t >= von && q.t <= bis);
    if (p2.length) {
      const w2 = p2.map(q => q.v), mn2 = Math.min(...w2), mx2 = Math.max(...w2), sp2 = (mx2 - mn2) || 1, u2 = mn2 - sp2 * 0.1, o2 = mx2 + sp2 * 0.15;
      y2 = v => O + (1 - (v - u2) / (o2 - u2)) * (H - O - U);
      [mn2, (mn2 + mx2) / 2, mx2].forEach(v => { h += `<text x="${W - R + 6}" y="${y2(v) + 4}" style="fill:var(--bernstein)">${z(v, 1)}</text>`; });
      let d2 = '', l2 = null;
      p2.forEach(q => { d2 += (l2 == null || q.t - l2 > schrittMs * 2.5 ? 'M' : 'L') + x(q.t).toFixed(1) + ',' + y2(q.v).toFixed(1); l2 = q.t; });
      h += `<path d="${d2}" fill="none" stroke="var(--bernstein)" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/>`;
      h += `<text x="${W - R}" y="16" text-anchor="end" style="fill:var(--bernstein);font-family:var(--sans);font-size:13px;font-weight:600">${daten2.name} (°C)</text>`;
    }
  }
  if (balken) {
    const bw = Math.min(60, Math.max(2, (W - L - R) / ((bis - von) / schrittMs) * 0.7));
    p.forEach(q => { h += `<rect x="${x(q.t) - bw / 2}" y="${y(q.v)}" width="${bw}" height="${Math.max(1, y(0) - y(q.v))}" rx="2" fill="var(--wasser)" opacity=".85"/>`; });
  } else {
    let d = '', letzte = null;
    p.forEach(q => { d += (letzte == null || q.t - letzte > schrittMs * 2.5 ? 'M' : 'L') + x(q.t).toFixed(1) + ',' + y(q.v).toFixed(1); letzte = q.t; });
    h += `<path d="${d}" fill="none" stroke="var(--wasser)" stroke-width="2" stroke-linejoin="round"/>`;
  }
  h += `<line class="zeiger" id="azeiger" x1="-10" x2="-10" y1="${O}" y2="${H - U}"/>`;
  svg.innerHTML = h;
  geo = { p, p2, x, von, bis, L, R };
  // Kennzahlen
  let iMin = 0, iMax = 0, sum = 0;
  p.forEach((q, i) => { if (q.v < p[iMin].v) iMin = i; if (q.v > p[iMax].v) iMax = i; sum += q.v; });
  const summe = daten.einheit === 'kWh' && daten.art === 'balken' ? ` · Summe ${z(sum, 2)}` : '';
  $('aleg').innerHTML = `<div class="feld" style="box-shadow:inset 3px 0 0 var(--wasser)" data-tip="Kennzahlen im gewählten Zeitraum"><small>${daten.name.toUpperCase()}</small><b>min ${z(p[iMin].v, st)} · max ${z(p[iMax].v, st)} · Ø ${z(sum / p.length, st)}${summe}<em>${mitE(daten.einheit)}</em></b><small style="margin-top:4px;letter-spacing:0">Höchstwert ${zeitText(p[iMax].roh, daten.schritt)} · Tiefstwert ${zeitText(p[iMin].roh, daten.schritt)}</small></div>`;
  if (p2.length) {
    let a = 0, b2 = 0, s2 = 0; p2.forEach((q, i) => { if (q.v < p2[a].v) a = i; if (q.v > p2[b2].v) b2 = i; s2 += q.v; });
    $('aleg').innerHTML += `<div class="feld" style="box-shadow:inset 3px 0 0 var(--bernstein)" data-tip="Wassertemperatur im gewählten Zeitraum"><small>${daten2.name.toUpperCase()}</small><b>min ${z(p2[a].v, 1)} · max ${z(p2[b2].v, 1)} · Ø ${z(s2 / p2.length, 1)}<em> °C</em></b><small style="margin-top:4px;letter-spacing:0">Höchstwert ${zeitText(p2[b2].roh, daten.schritt)} · Tiefstwert ${zeitText(p2[a].roh, daten.schritt)}</small></div>`;
  }
}
function zeigen(e) {
  if (!geo) return;
  const zf = ZOOM(), r0 = $('adia').getBoundingClientRect(), { p, von, bis, L, R } = geo;
  const b = { left: r0.left / zf, width: r0.width / zf }, mx = e.clientX / zf;
  const t = von + (mx - b.left - L) / (b.width - L - R) * (bis - von);
  let best = 0; p.forEach((q, i) => { if (Math.abs(q.t - t) < Math.abs(p[best].t - t)) best = i; });
  const q = p[best], xs = L + (q.t - von) / (bis - von) * (b.width - L - R);
  const z1 = $('azeiger'); if (z1) { z1.setAttribute('x1', xs); z1.setAttribute('x2', xs); }
  const st = stellenE(daten.einheit), info = $('ainfo');
  info.innerHTML = `<b>${zeitText(q.roh, daten.schritt)}</b><br>${daten.schritt === 'minute' || daten.art === 'balken' ? '' : 'Ø '}${z(q.v, st)}${mitE(daten.einheit)}` + (daten.schritt !== 'minute' && daten.art !== 'balken' ? `<br>max ${z(q.max, st)}${mitE(daten.einheit)}` : '');
  if (geo.p2 && geo.p2.length) {
    let b2 = 0; geo.p2.forEach((w, i) => { if (Math.abs(w.t - q.t) < Math.abs(geo.p2[b2].t - q.t)) b2 = i; });
    info.innerHTML += `<br><span style="color:var(--bernstein)">Wasser ${z(geo.p2[b2].v, 1)} °C</span>`;
  }
  info.style.display = 'block';
  info.style.left = (xs > b.width / 2 ? Math.max(4, xs - info.offsetWidth - 12) : xs + 12) + 'px';
}
$('adia').addEventListener('pointermove', zeigen);
$('adia').addEventListener('pointerdown', zeigen);
$('adia').addEventListener('pointerleave', () => { $('ainfo').style.display = 'none'; const z1 = $('azeiger'); if (z1) { z1.setAttribute('x1', -10); z1.setAttribute('x2', -10); } });
$('abereich').addEventListener('change', () => { werteFuellen(); datenLaden(); });
$('awert').addEventListener('change', datenLaden);
$('awt').addEventListener('change', datenLaden);
$('azeit').addEventListener('change', () => { $('adetail').style.display = $('azeit').value === 'heute' ? '' : 'none'; datenLaden(); });
$('adetail').addEventListener('change', zeichnen);
addEventListener('resize', zeichnen);
setInterval(() => { if ($('azeit').value === 'heute') datenLaden(); }, 60000);

// Spitzen von heute (zum Ausklappen)
async function spitzen() {
  if (!da('auswertung')) return;
  const d0 = new Date(), heute = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  let tag; try { tag = await (await fetch('/api/tag?datum=' + heute, { cache: 'no-store' })).json(); } catch (e) { return; }
  const ids = ['strom.watt', 'cpu.watt', 'gpu.watt', 'cpu.temp', 'gpu.temp', 'gpu.hotspot', 'board.vrm', 'board.soc', 'flow.durchfluss', 'flow.wasser'];
  const wasser = tag.werte.find(w => w.id.startsWith('icue.') && w.einheit === '°C' && /beh|wasser|coolant/i.test(w.name));
  if (wasser) ids.splice(9, 0, wasser.id);
  $('aspitzen').innerHTML = ids.map(id => tag.werte.find(w => w.id === id)).filter(w => w && w.reihe.some(v => v != null)).map(w => {
    let min = null, max = null, tMin = '', tMax = '', s = 0, n = 0;
    w.reihe.forEach((v, i) => { if (v == null) return; if (min == null || v < min) { min = v; tMin = tag.zeiten[i]; } if (max == null || v > max) { max = v; tMax = tag.zeiten[i]; } s += v; n++; });
    const st = stellenE(w.einheit), e = mitE(w.einheit);
    return `<tr><td>${w.name}</td><td class="z">${z(min, st)}${e}<br><small style="color:var(--stumm)">${tMin}</small></td><td class="z">${z(max, st)}${e}<br><small style="color:var(--stumm)">${tMax}</small></td><td class="z">${z(s / n, st)}${e}</td></tr>`;
  }).join('');
}
$('aspitzenbox').addEventListener('toggle', () => { if ($('aspitzenbox').open) spitzen(); });

// Kühlung-Check: Abstand CPU-Temperatur zu Wassertemperatur bei vergleichbarer Last (zum Ausklappen)
const KW_VON = 35, KW_BIS = 55, KW_TAGE = 14;
async function kuehlCheck() {
  if (!da('auswertung')) return;
  let tage; try { tage = await (await fetch('/api/tage', { cache: 'no-store' })).json(); } catch (e) { return; }
  tage = tage.slice(0, KW_TAGE);
  const gruppen = [[0, 1, '0 l/h'], [1, 50, 'unter 50 l/h'], [50, 70, '50–70 l/h'], [70, 1e9, 'über 70 l/h']].map(g => ({ von: g[0], bis: g[1], name: g[2], s: 0, n: 0 }));
  const zeilen = [];
  for (const datum of tage) {
    let tag; try { tag = await (await fetch('/api/tag?datum=' + datum, { cache: 'no-store' })).json(); } catch (e) { continue; }
    const r = id => (tag.werte.find(w => w.id === id) || {}).reihe;
    const wb = tag.werte.find(w => w.id.startsWith('icue.') && w.einheit === '°C' && /beh|wasser|coolant/i.test(w.name));
    const ct = r('cpu.temp'), cw = r('cpu.watt'), fw = r('flow.wasser'), iw = wb && wb.reihe, fl = r('flow.durchfluss');
    if (!ct || !cw) continue;
    let s = 0, n = 0, fs = 0, fn = 0;
    ct.forEach((t, i) => {
      const w = fw && fw[i] != null && fw[i] > 0 ? fw[i] : iw ? iw[i] : null;
      if (t == null || w == null || w < 5 || w > 60 || cw[i] == null || cw[i] < KW_VON || cw[i] > KW_BIS) return; // unplausible Wasserwerte (alte Fehlzuordnung) weglassen
      const d = t - w; s += d; n++;
      const f = fl ? fl[i] : null;
      if (f != null) { fs += f; fn++; const g = gruppen.find(g => f >= g.von && f < g.bis); if (g) { g.s += d; g.n++; } }
    });
    if (n) zeilen.push(`<tr><td>${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}</td><td class="z">${n}</td><td class="z">${z(s / n)} K</td><td class="z">${fn ? z(fs / fn) + ' l/h' : '—'}</td></tr>`);
  }
  $('akuehltage').innerHTML = zeilen.join('') || '<tr><td colspan="4" style="color:var(--stumm)">Noch keine passenden Minuten</td></tr>';
  $('akuehlfluss').innerHTML = gruppen.filter(g => g.n).map(g => `<tr><td>${g.name}</td><td class="z">${g.n}</td><td class="z">${z(g.s / g.n)} K</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--stumm)">Noch keine Durchflusswerte</td></tr>';
}
$('akw_von').textContent = KW_VON; $('akw_bis').textContent = KW_BIS;
$('akuehlbox').addEventListener('toggle', () => { if ($('akuehlbox').open) kuehlCheck(); });
listeLaden();

// Pumpe am Board: Zustand anzeigen, Zieldrehzahl mit dem Regler einstellen
let pzielAktiv = false, phandAktiv = false;
async function pumpeLaden(ziel, extra) {
  if (!da('durchfluss')) return;
  const q = (ziel ? '?ziel=' + ziel : '') + (extra ? (ziel ? '&' : '?') + extra : '');
  let p; try { p = await (await fetch('/api/pumpe' + q, { cache: 'no-store' })).json(); } catch (e) { return; }
  if (!p.gefunden) { $('pzeile').style.display = 'none'; $('psteuer').style.display = 'none'; return; }
  $('pzeile').style.display = 'flex'; $('psteuer').style.display = '';
  $('pmodus').textContent = p.modus === 'Regelung' ? 'Automatik' : p.modus === 'Hand' ? 'Hand' : p.modus === 'Startschub' ? 'STARTSCHUB' : 'BIOS';
  if (document.activeElement !== $('pbetrieb')) $('pbetrieb').value = p.betrieb;
  $('pautobox').style.display = p.betrieb === 'hand' ? 'none' : 'flex';
  $('phandbox').style.display = p.betrieb === 'hand' ? 'flex' : 'none';
  if (!phandAktiv) $('phand').value = p.hand;
  $('phandtext').textContent = Math.round(phandAktiv ? $('phand').value : p.hand) + ' %';
  $('pbetrieb').disabled = $('phand').disabled = $('pstandard').disabled = !p.steuern;
  $('pmodus').style.color = p.modus === 'Startschub' ? 'var(--warn)' : '';
  $('pprozent').textContent = p.modus === 'BIOS' ? '' : Math.round(p.prozent) + ' %' + (p.boden > 0 && p.betrieb !== 'hand' ? ` (mind. ${Math.round(p.boden)} %)` : '');
  if (!pzielAktiv) $('pziel').value = p.ziel;
  $('pzieltext').textContent = Math.round(pzielAktiv ? $('pziel').value : p.ziel) + ' l/h'
    + (p.zielJetzt != null && p.betrieb !== 'hand' && Math.round(p.zielJetzt) !== Math.round(p.ziel) ? ` → jetzt ${Math.round(p.zielJetzt)} l/h` : '')
    + (p.wasser != null && p.betrieb !== 'hand' ? ` (Behälter ${String(p.wasser).replace('.', ',')} °C)` : '');
  if (p.zielMax != null) $('pautobox').dataset.tip = `Automatik: Pumpe so langsam wie möglich, aber mit diesem Durchfluss. Bis ${p.tempAb} °C im Behälter gilt der eingestellte Wert, bis ${p.tempBis} °C steigt das Ziel gleichmäßig auf ${p.zielMax} l/h`;
  $('pziel').disabled = !p.steuern;
  if (document.activeElement !== $('panlaufmin') && p.anlaufMin != null) $('panlaufmin').value = String(p.anlaufMin);
  if (document.activeElement !== $('panlaufprozent') && p.anlaufProzent != null) $('panlaufprozent').value = String(p.anlaufProzent);
  $('panlaufmin').disabled = $('panlaufprozent').disabled = !p.steuern;
  $('phinweis').style.display = p.hinweis ? '' : 'none';
  $('phinweis').dataset.tip = p.hinweis || '';
}
$('pziel').addEventListener('input', () => { pzielAktiv = true; $('pzieltext').textContent = $('pziel').value + ' l/h'; });
$('pstandard').addEventListener('click', () => pumpeLaden(null, 'standard=1'));
$('pziel').addEventListener('change', async () => { await pumpeLaden($('pziel').value); pzielAktiv = false; });
$('phand').addEventListener('input', () => { phandAktiv = true; $('phandtext').textContent = $('phand').value + ' %'; });
$('phand').addEventListener('change', async () => { await pumpeLaden(null, 'prozent=' + $('phand').value); phandAktiv = false; });
$('pbetrieb').addEventListener('change', () => pumpeLaden(null, 'betrieb=' + $('pbetrieb').value));
$('panlaufmin').addEventListener('change', () => pumpeLaden(null, 'anlaufMin=' + $('panlaufmin').value));
$('panlaufprozent').addEventListener('change', () => pumpeLaden(null, 'anlaufProzent=' + $('panlaufprozent').value));
pumpeLaden();
setInterval(() => pumpeLaden(), 2000);

laden().then(() => { verlauf(); wkurve(); });
setInterval(wkurve, 60000);
setInterval(laden, 2000);
setInterval(verlauf, 10000);

// ---------- Steuerung: Handy-Alarm und PC herunterfahren ----------
let handyGeladen = false;
async function handy(aktion) {
  if (!da('steuerung')) return;
  const q = new URLSearchParams();
  let opt = {};
  if (aktion) {
    q.set('aktion', aktion);
    if (aktion === 'speichern') {
      q.set('ntfyServer', $('hserver').value); q.set('ntfyThema', $('hthema').value);
      q.set('pushoverBenutzer', $('hbenutzer').value); q.set('pushoverToken', $('htoken').value);
    }
    opt = { method: 'POST' };
    $('hmeldung').textContent = aktion === 'test' ? 'sende …' : 'speichere …';
  }
  try {
    const d = await (await fetch('/api/handy?' + q, opt)).json();
    if (!aktion || aktion === 'speichern') {
      $('hserver').value = d.ntfyServer || ''; $('hthema').value = d.ntfyThema || ''; $('hbenutzer').value = d.pushoverBenutzer || '';
      $('htoken').value = ''; $('htoken').placeholder = d.pushoverToken ? '••••••• gespeichert' : 'nicht eingetragen';
    }
    $('hmeldung').textContent = d.meldung || '';
    handyGeladen = true;
  } catch (e) { $('hmeldung').textContent = 'Keine Verbindung zum Programm'; }
}
$('hspeichern').addEventListener('click', () => handy('speichern'));
$('htest').addEventListener('click', () => handy('test'));
$('pcaus').addEventListener('click', e => {
  e.stopPropagation(); tipAus();
  const an = $('zpan').textContent;
  $('pcweck').style.display = an && an !== '—' ? '' : 'none';
  $('pcweck').innerHTML = '<b style="display:inline;font:inherit;color:inherit;letter-spacing:0">Zeitplan-Wecker</b> (' + an + ') klappt nur mit Ruhezustand. <b style="display:inline;font:inherit;color:inherit;letter-spacing:0">Handy-App</b> geht bei beiden.';
  $('pcfrage').classList.toggle('auf');
});
$('pcruhe').addEventListener('click', async () => {
  $('pcfrage').classList.remove('auf');
  try { await fetch('/api/herunterfahren?art=ruhezustand', { method: 'POST' }); $('hmeldung').textContent = 'PC geht in ein paar Sekunden in den Ruhezustand …'; }
  catch (e) { $('hmeldung').textContent = 'Keine Verbindung zum Programm'; }
});
$('pcnein').addEventListener('click', () => $('pcfrage').classList.remove('auf'));
$('pcfrage').addEventListener('click', e => { if (e.target === $('pcfrage')) $('pcfrage').classList.remove('auf'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('pcfrage').classList.remove('auf'); });
$('pcja').addEventListener('click', async () => {
  $('pcfrage').classList.remove('auf');
  try { await fetch('/api/herunterfahren', { method: 'POST' }); $('hmeldung').textContent = 'PC fährt in 5 Sekunden herunter …'; }
  catch (e) { $('hmeldung').textContent = 'Keine Verbindung zum Programm'; }
});
handy();

// ---------- Zeitplan: PC schlafen legen und wecken ----------
const ZP_TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
let zpListe = [], zpGeaendert = false, zpUebersprungen = false;
function zpZeit(s) {
  if (!s) return '—';
  const d = new Date(s);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tage = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - heute) / 864e5);
  const tag = tage === 0 ? 'heute' : tage === 1 ? 'morgen' : ZP_TAGE[(d.getDay() + 6) % 7] + ' ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return tag + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
function zpZeichnen() {
  const l = $('zpliste');
  l.innerHTML = '';
  if (!zpListe.length) { l.innerHTML = '<div class="zpleer">Noch kein Eintrag – mit „+ Eintrag“ anlegen.</div>'; return; }
  zpListe.forEach((z, i) => {
    const r = document.createElement('div');
    r.className = 'zpzeile' + (z.aktiv ? '' : ' inaktiv');
    const art = z.tage.length ? 'jede Woche' : 'einmalig' + (z.einmaligAm ? ' · ' + new Date(z.einmaligAm + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '');
    r.innerHTML = `<select class="eingabe ${z.aktion}" aria-label="Aktion"><option value="aus">Aus</option><option value="an">An</option></select>
      <button type="button" class="zpuhr" aria-label="Uhrzeit wählen">${z.zeit}</button>
      <div class="zptage">${ZP_TAGE.map((t, k) => `<button type="button" class="zptag${z.tage.includes(k + 1) ? ' an' : ''}" data-tag="${k + 1}">${t}</button>`).join('')}</div>
      <span class="zpart">${art}</span>
      <label class="zpaktiv"><input type="checkbox" ${z.aktiv ? 'checked' : ''}> aktiv</label>
      <span style="flex:1"></span>
      <button class="knopf rot" type="button" aria-label="Eintrag löschen">Löschen</button>`;
    const sel = r.querySelector('select.eingabe'), zeit = r.querySelector('.zpuhr');
    sel.value = z.aktion;
    sel.onchange = () => { z.aktion = sel.value; sel.className = 'eingabe ' + z.aktion; zpGeaendert = true; zpHinweis(); };
    zeit.onclick = () => uhrOeffnen(z.zeit, neu => { z.zeit = neu; zeit.textContent = neu; zpGeaendert = true; zpHinweis(); });
    r.querySelectorAll('.zptag').forEach(b => b.onclick = () => {
      const t = +b.dataset.tag;
      z.tage = z.tage.includes(t) ? z.tage.filter(x => x !== t) : [...z.tage, t].sort();
      zpGeaendert = true; zpZeichnen(); zpHinweis();
    });
    r.querySelector('.zpaktiv input').onchange = ev => { z.aktiv = ev.target.checked; zpGeaendert = true; zpZeichnen(); zpHinweis(); };
    r.querySelector('.knopf.rot').onclick = () => { zpListe.splice(i, 1); zpGeaendert = true; zpZeichnen(); zpHinweis(); };
    l.appendChild(r);
  });
}
function zpHinweis() { if (zpGeaendert) $('zpmeldung').textContent = 'Geändert – noch nicht gespeichert.'; }
async function zeitplan(aktion) {
  if (!da('zpaus')) return;
  const opt = aktion ? { method: 'POST' } : {};
  if (aktion === 'speichern') {
    if (zpListe.some(z => !/^\d{1,2}:\d{2}$/.test(z.zeit || ''))) { $('zpmeldung').textContent = 'Bitte bei jedem Eintrag eine Uhrzeit eingeben.'; return; }
    opt.headers = { 'Content-Type': 'application/json' };
    opt.body = JSON.stringify(zpListe);
    $('zpmeldung').textContent = 'speichere …';
  }
  try {
    const d = await (await fetch('/api/zeitplan' + (aktion ? '?aktion=' + aktion : ''), opt)).json();
    if (aktion === 'speichern' && !String(d.meldung || '').startsWith('Nicht')) zpGeaendert = false;
    if (!zpGeaendert) { zpListe = d.eintraege || []; zpZeichnen(); }
    zpUebersprungen = !!d.naechstesAusUebersprungen;
    $('zpaus').innerHTML = d.naechstesAus ? zpZeit(d.naechstesAus) + (zpUebersprungen ? ' <em>übersprungen</em>' : '') : '—';
    $('zpan').textContent = zpZeit(d.naechstesAn);
    $('zpueber').textContent = zpUebersprungen ? 'Nächstes Aus wieder einschalten' : 'Nächstes Aus überspringen';
    $('zpueber').disabled = !d.naechstesAus;
    if (aktion || d.meldung) $('zpmeldung').textContent = d.meldung || '';
    else zpHinweis();
  } catch (e) { $('zpmeldung').textContent = 'Keine Verbindung zum Programm'; }
}
$('zpneu').addEventListener('click', () => {
  zpListe.push({ id: '', aktion: 'aus', zeit: '23:00', tage: [], aktiv: true });
  zpGeaendert = true; zpZeichnen(); zpHinweis();
});
$('zpspeichern').addEventListener('click', () => zeitplan('speichern'));
$('zpueber').addEventListener('click', () => zeitplan(zpUebersprungen ? 'fortsetzen' : 'abbrechen'));
zeitplan();
setInterval(() => zeitplan(), 30000);

// ---------- Ziffernblatt zum Uhrzeit-Wählen (erst Stunde, dann Minute) ----------
const UHR = { h: 0, m: 0, teil: 'h', fertig: null };
function uhrOeffnen(wert, fertig) {
  const [h, m] = (wert || '00:00').split(':').map(Number);
  Object.assign(UHR, { h: h || 0, m: m || 0, teil: 'h', fertig });
  uhrZeichnen(); $('uhr').showModal();
}
function uhrZeichnen() {
  const svg = $('uhrblatt'), M = 140, ns = 'http://www.w3.org/2000/svg';
  $('uhrh').textContent = String(UHR.h).padStart(2, '0'); $('uhrm').textContent = String(UHR.m).padStart(2, '0');
  $('uhrh').classList.toggle('an', UHR.teil === 'h'); $('uhrm').classList.toggle('an', UHR.teil === 'm');
  const el = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  svg.innerHTML = '';
  svg.appendChild(el('circle', { cx: M, cy: M, r: 136, fill: 'var(--feld)', stroke: 'var(--linie2)' }));
  let wahlWinkel, wahlR;
  if (UHR.teil === 'h') {
    const innen = UHR.h === 0 || UHR.h > 12;
    wahlWinkel = (UHR.h % 12) * 30; wahlR = innen ? 72 : 112;
  } else { wahlWinkel = UHR.m * 6; wahlR = 112; }
  const rad = w => (w - 90) * Math.PI / 180;
  const x = (w, r) => M + r * Math.cos(rad(w)), y = (w, r) => M + r * Math.sin(rad(w));
  svg.appendChild(el('line', { x1: M, y1: M, x2: x(wahlWinkel, wahlR), y2: y(wahlWinkel, wahlR), stroke: 'var(--bernstein)', 'stroke-width': 2 }));
  svg.appendChild(el('circle', { cx: M, cy: M, r: 4, fill: 'var(--bernstein)' }));
  svg.appendChild(el('circle', { cx: x(wahlWinkel, wahlR), cy: y(wahlWinkel, wahlR), r: 19, fill: 'var(--bernstein)' }));
  const zahl = (t, w, r, kl, gew) => { const e = el('text', { x: x(w, r), y: y(w, r), class: kl + (gew ? ' gewaehlt' : '') }); e.textContent = t; svg.appendChild(e); };
  if (UHR.teil === 'h') {
    for (let i = 1; i <= 12; i++) zahl(i, i * 30, 112, '', UHR.h === i);
    for (let i = 13; i <= 24; i++) { const hh = i % 24; zahl(String(hh).padStart(2, '0'), i * 30, 72, 'innen', UHR.h === hh); }
  } else {
    for (let i = 0; i < 60; i += 5) zahl(String(i).padStart(2, '0'), i * 6, 112, '', UHR.m === i);
  }
}
function uhrZeiger(ev, loslassen) {
  const b = $('uhrblatt').getBoundingClientRect();
  const dx = ev.clientX - (b.left + b.width / 2), dy = ev.clientY - (b.top + b.height / 2);
  let w = Math.atan2(dy, dx) * 180 / Math.PI + 90; if (w < 0) w += 360;
  const abstand = Math.hypot(dx, dy) * 280 / b.width;
  if (UHR.teil === 'h') {
    let h = Math.round(w / 30) % 12;
    if (abstand < 92) h = h === 0 ? 0 : h + 12; else if (h === 0) h = 12;
    UHR.h = h;
    if (loslassen) UHR.teil = 'm';
  } else UHR.m = Math.round(w / 6) % 60;
  uhrZeichnen();
}
let uhrZieht = false;
$('uhrblatt').addEventListener('pointerdown', e => { uhrZieht = true; $('uhrblatt').setPointerCapture(e.pointerId); uhrZeiger(e, false); });
$('uhrblatt').addEventListener('pointermove', e => { if (uhrZieht) uhrZeiger(e, false); });
$('uhrblatt').addEventListener('pointerup', e => { if (uhrZieht) { uhrZieht = false; uhrZeiger(e, true); } });
$('uhrh').onclick = () => { UHR.teil = 'h'; uhrZeichnen(); };
$('uhrm').onclick = () => { UHR.teil = 'm'; uhrZeichnen(); };
$('uhrnein').onclick = () => $('uhr').close();
$('uhrja').onclick = () => { $('uhr').close(); UHR.fertig && UHR.fertig(String(UHR.h).padStart(2, '0') + ':' + String(UHR.m).padStart(2, '0')); };

// ---------- Schloss: alle Steuerungen gesperrt, bis 1 Sekunde gedrückt gehalten wird; nach 60 s ohne Bedienung wieder zu ----------
(() => {
  const k = $('schloss');
  let halteZeit = null, zuZeit = null;
  const inhalte = () => [...document.querySelectorAll('details.steuer')].flatMap(d => [...d.children].filter(c => c.tagName !== 'SUMMARY'));
  const sperren = () => {
    clearTimeout(zuZeit);
    document.documentElement.classList.add('gesperrt');
    inhalte().forEach(c => c.inert = true);
    k.classList.remove('offen', 'halten'); k.textContent = '🔒 Gesperrt';
  };
  const nachlaufen = () => { clearTimeout(zuZeit); zuZeit = setTimeout(sperren, 60000); };
  const oeffnen = () => {
    document.documentElement.classList.remove('gesperrt');
    inhalte().forEach(c => c.inert = false);
    k.classList.remove('halten'); k.classList.add('offen'); k.textContent = '🔓 Entsperrt';
    nachlaufen();
  };
  const offen = () => k.classList.contains('offen');
  const los = e => {
    e.preventDefault();
    if (offen()) { sperren(); return; }          // entsperrt: einmal tippen sperrt sofort
    k.classList.add('halten'); k.textContent = 'halten …';
    halteZeit = setTimeout(oeffnen, 1000);
  };
  const ab = () => { if (halteZeit) { clearTimeout(halteZeit); halteZeit = null; } if (!offen() && k.classList.contains('halten')) sperren(); };
  k.addEventListener('pointerdown', los);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => k.addEventListener(t, ab));
  k.addEventListener('contextmenu', e => e.preventDefault());
  k.addEventListener('click', e => e.preventDefault());
  // jede Bedienung in einer Steuerung verlängert die 60 Sekunden
  ['pointerdown', 'input', 'change', 'keydown'].forEach(t => document.addEventListener(t, e => {
    if (offen() && e.target.closest && e.target.closest('details.steuer, #pcfrage, #uhr')) nachlaufen();
  }, true));
  sperren();
})();
/* ===== Schnell aktualisieren (Cache-Stempel) – wie in Kalender und Kreis13App =====
   version.json trägt einen Zeitstempel. Am PC schreibt Claude ihn bei jeder Änderung neu,
   bei Firebase schreibt ihn "Firebase hochladen.bat". Die Seite merkt sich beim Start den Stempel.
   Kommt sie wieder in den Vordergrund (Handy entsperrt, App gewechselt) oder ist eine Stunde offen,
   fragt sie nach – ist der Stempel neu, lädt sie sich selbst neu. Nicht, solange das Schloss offen
   ist oder ein Fenster (PC ausschalten, Uhrzeit) offen ist. */
let meineVersion = null;
async function versionHolen() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    return r.ok ? (await r.json()).v : null;
  } catch (e) { return null; }
}
async function versionPruefen() {
  const v = await versionHolen();
  if (!v) return;
  if (meineVersion === null) { meineVersion = v; $('versionAnzeige').textContent = 'Version ' + v; return; }
  if (v !== meineVersion) {
    if ($('schloss').classList.contains('offen') || $('pcfrage').classList.contains('auf') || $('uhr').open) return;
    location.reload();
  }
}
versionPruefen();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') versionPruefen(); });
setInterval(versionPruefen, 3600e3);
// ---------- Strom: "Gesamt" zurücksetzen (zweimal tippen, Schloss muss offen sein) ----------
let szScharf = null;
$('szurueck').addEventListener('click', async () => {
  if (!szScharf) {
    $('szurueck').textContent = 'Wirklich? Nochmal tippen';
    $('szmeldung').textContent = 'GESAMT und KOSTEN GESAMT gehen auf 0.';
    szScharf = setTimeout(() => { szScharf = null; $('szurueck').textContent = 'Gesamt auf 0 setzen'; $('szmeldung').textContent = ''; }, 5000);
    return;
  }
  clearTimeout(szScharf); szScharf = null; $('szurueck').textContent = 'Gesamt auf 0 setzen';
  try {
    const r = await (await fetch('/api/strom/zuruecksetzen', { method: 'POST' })).json();
    $('szmeldung').textContent = r.ok ? 'Zurückgesetzt – zählt jetzt seit ' + r.seit + ' Uhr.' : r.meldung;
    if (r.ok) laden();
  } catch (e) { $('szmeldung').textContent = 'Keine Verbindung zum Programm'; }
});

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

