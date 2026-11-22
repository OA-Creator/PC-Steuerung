// Fernansicht-Start (vor allem anderen laden) · Stand 23.11.2026 00:10
// Fernansicht: Kommt die Seite von Firebase (https), beantwortet fern.js die /api/-Anfragen aus Firebase.
// Am PC (http://…:8090) ändert sich nichts – der Leitstand läuft dort ganz ohne Firebase.
if (location.protocol === 'https:') {
  document.documentElement.classList.add('fern');
  window.FERN_BEREIT = new Promise(r => { window.FERN_FERTIG = r; });
  const echt = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    const u = typeof url === 'string' ? url : url.url;
    if (!u.startsWith('/api/')) return echt(url, opt);
    const holen = await window.FERN_BEREIT;
    const d = await holen(u, opt || {});
    return new Response(typeof d === 'string' ? d : JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const s = document.createElement('script'); s.type = 'module'; s.src = 'fern.js'; document.head.appendChild(s);
}
