using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Atomkraftwerk;

// ---------------------------------------------------------------
// Fernspiegel (seit 20.11.2026): legt den Stand des Atomkraftwerks bei Firebase ab, damit der
// Leitstand auch bei ausgeschaltetem PC und unterwegs zu sehen ist (Leitstand-Seite bei Firebase Hosting).
//  - nur aktiv, wenn neben dem Programm "firebase-zugang.json" liegt (Dienstkonto-Schlüssel aus der Firebase-Konsole)
//  - sparsam: Stand alle 15 min und beim Ausschalten/Schlafen/Aufwachen, Auswertung "heute"/"woche" stündlich,
//    "monat"/"quartal"/"jahr" einmal am Tag – zusammen rund 150 Schreibvorgänge am Tag
//  - Zeitplan-Änderungen aus der Ferne holt der PC alle 15 min und nach dem Aufwachen ab
//  - Ohne Internet oder ohne Firebase läuft am PC alles weiter wie bisher – hier wird nur ins Log geschrieben.
// Firestore-Dokumente: akw/stand, akw/auswertung_<zeitraum>, akw/zeitplanWunsch (schreibt nur das Handy)
// ---------------------------------------------------------------
public sealed class Fernspiegel
{
    public static readonly TimeSpan StandAbstand = TimeSpan.FromMinutes(15);
    private static readonly string[] Taeglich = { "monat", "quartal", "jahr" };

    private readonly string _schluesselDatei, _merkerDatei;
    private readonly Anlage _anlage;
    private readonly Einstellungen _e;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private readonly SemaphoreSlim _einzeln = new(1, 1);
    public Auswertung? Auswertung { get; set; }
    public PumpenSteuerung? Pumpe { get; set; }
    public Zeitplan? Zeitplan { get; set; }

    private string? _projekt, _email, _tokenUri;
    private RSA? _schluessel;
    private string? _token;
    private DateTime _tokenBis = DateTime.MinValue;
    private DateTime _letzterStand = DateTime.MinValue, _letzteStunde = DateTime.MinValue, _letzterTag = DateTime.MinValue, _letzterWunsch = DateTime.MinValue;
    private DateTime _letzterFehlerLog = DateTime.MinValue;
    private double _wunschNr;   // zuletzt übernommene Zeitplan-Änderung vom Handy

    public bool Aktiv => _schluessel != null;

    public Fernspiegel(string ordner, Anlage anlage, Einstellungen e)
    {
        _anlage = anlage; _e = e;
        _schluesselDatei = Path.Combine(ordner, "firebase-zugang.json");
        _merkerDatei = Path.Combine(anlage.DatenOrdner, "fern-wunsch.txt");
        try { _wunschNr = double.Parse(File.ReadAllText(_merkerDatei).Trim(), CultureInfo.InvariantCulture); } catch { }
        Laden();
    }

    private void Laden()
    {
        if (!File.Exists(_schluesselDatei)) { Log.Schreiben("Fernspiegel aus (keine firebase-zugang.json) – Leitstand nur am PC."); return; }
        try
        {
            using var d = JsonDocument.Parse(File.ReadAllText(_schluesselDatei));
            var w = d.RootElement;
            _projekt = w.GetProperty("project_id").GetString();
            _email = w.GetProperty("client_email").GetString();
            _tokenUri = w.TryGetProperty("token_uri", out var tu) ? tu.GetString() : "https://oauth2.googleapis.com/token";
            var rsa = RSA.Create();
            rsa.ImportFromPem(w.GetProperty("private_key").GetString());
            _schluessel = rsa;
            Log.Schreiben($"Fernspiegel an: Firebase-Projekt {_projekt}.");
        }
        catch (Exception ex) { _schluessel = null; Log.Schreiben("Fernspiegel aus – firebase-zugang.json nicht lesbar: " + ex.Message); }
    }

    // ---------- jede Sekunde aus der Hauptschleife – blockiert nie ----------
    public void Pruefen()
    {
        if (!Aktiv) return;
        var jetzt = DateTime.Now;
        if (jetzt - _letzterStand >= StandAbstand) { _letzterStand = jetzt; _ = StandAsync("läuft", true); }
        if (jetzt - _letzterWunsch >= StandAbstand) { _letzterWunsch = jetzt; _ = WunschHolenAsync(); }
        if (jetzt.Hour != _letzteStunde.Hour || jetzt - _letzteStunde >= TimeSpan.FromHours(1))
        {
            _letzteStunde = jetzt;
            var zeitraeume = new List<string> { "heute", "woche" };
            if (jetzt.Date != _letzterTag.Date) { _letzterTag = jetzt; zeitraeume.AddRange(Taeglich); }
            _ = AuswertungAsync(zeitraeume);
        }
    }

    // nach dem Aufwachen: Stand sofort, Zeitplan-Wunsch abholen
    public void NachDemAufwachen()
    {
        if (!Aktiv) return;
        _letzterStand = _letzterWunsch = DateTime.Now;
        _ = Task.Run(async () => { await WunschHolenAsync(); await StandAsync("aufgewacht", true); });
    }

    // ---------- Stand hochladen ----------
    public async Task StandAsync(string grund, bool pcAn)
    {
        if (!Aktiv) return;
        try
        {
            var verlauf = new Dictionary<string, string>();
            foreach (var (id, _, gruppe, einheit) in _anlage.WerteInfo())
                if (id == "flow.wasser" || id == "flow.durchfluss" || (id.StartsWith("icue.") && einheit == "°C" && gruppe != "Luft"))
                    verlauf[id] = _anlage.VerlaufJson(id);
            var felder = new Dictionary<string, object?>
            {
                ["zeit"] = DateTime.UtcNow,
                ["pcAn"] = pcAn,
                ["grund"] = grund,
                ["jetzt"] = _anlage.AlsJson(),
                ["pumpe"] = Pumpe?.Json(null),
                ["handy"] = JsonSerializer.Serialize(new { ntfyServer = _e.Handy.NtfyServer, ntfyThema = "", pushoverBenutzer = "", pushoverToken = _e.Handy.PushoverToken != "", meldung = "" }),
                ["zeitplan"] = Zeitplan?.Json(null, null),
                ["liste"] = Auswertung?.ListeJson(),
                ["wunschUebernommen"] = _wunschNr,
                ["verlauf"] = verlauf
            };
            if (await SchreibenAsync("stand", felder) && !pcAn) Log.Schreiben($"Fernspiegel: letzter Stand abgelegt ({grund}).");
        }
        catch (Exception ex) { Fehler("Stand", ex); }
    }

    // ---------- Auswertungen hochladen (vorberechnet, damit das Handy nur lesen muss) ----------
    private async Task AuswertungAsync(IEnumerable<string> zeitraeume)
    {
        if (Auswertung == null) return;
        foreach (var z in zeitraeume)
        {
            try
            {
                var daten = new Dictionary<string, string>();
                using var liste = JsonDocument.Parse(Auswertung.ListeJson());
                foreach (var w in liste.RootElement.EnumerateArray())
                {
                    var id = w.GetProperty("id").GetString()!;
                    var json = Auswertung.DatenJson(z, id);
                    daten[id] = z == "heute" ? AufFuenfMinuten(json, id == "strom.kwh") : json;
                }
                var groesse = daten.Sum(d => d.Key.Length + d.Value.Length);
                if (groesse > 900_000) { Log.Schreiben($"Fernspiegel: Auswertung {z} zu groß ({groesse / 1024} KB), übersprungen."); continue; }
                await SchreibenAsync("auswertung_" + z, new Dictionary<string, object?> { ["zeit"] = DateTime.UtcNow, ["daten"] = daten });
            }
            catch (Exception ex) { Fehler("Auswertung " + z, ex); }
        }
    }

    // Minutenwerte von heute auf 5-Minuten-Mittel verdichten (spart Daten beim Handy)
    private static string AufFuenfMinuten(string json, bool summe)
    {
        var o = JsonNode.Parse(json)!.AsObject();
        if (o["punkte"] is not JsonArray punkte || punkte.Count == 0) return json;
        var neu = new JsonArray();
        foreach (var g in punkte.Select(p => p!.AsObject()).GroupBy(p =>
                 {
                     var t = DateTime.ParseExact((string)p["t"]!, "yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture);
                     return new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute / 5 * 5, 0);
                 }))
        {
            var werte = g.Select(p => (double)p["v"]!).ToList();
            var maxe = g.Select(p => (double)p["max"]!).ToList();
            neu.Add(new JsonObject
            {
                ["t"] = g.Key.ToString("yyyy-MM-ddTHH:mm"),
                ["v"] = Math.Round(summe ? werte[^1] : werte.Average(), 3),
                ["max"] = Math.Round(maxe.Max(), 3)
            });
        }
        o["punkte"] = neu;
        return o.ToJsonString();
    }

    // ---------- Zeitplan-Änderung vom Handy abholen ----------
    private async Task WunschHolenAsync()
    {
        if (!Aktiv || Zeitplan == null) return;
        try
        {
            var doc = await LesenAsync("zeitplanWunsch");
            if (doc is not JsonElement d || !d.TryGetProperty("fields", out var f)) return;
            var nr = f.TryGetProperty("nr", out var n) ? Zahl(n) : 0;
            if (nr <= _wunschNr || !f.TryGetProperty("eintraege", out var e) || !e.TryGetProperty("stringValue", out var s)) return;
            var ergebnis = Zeitplan.Json("speichern", s.GetString());
            _wunschNr = nr;
            try { File.WriteAllText(_merkerDatei, nr.ToString(CultureInfo.InvariantCulture)); } catch { }
            Log.Schreiben("Fernspiegel: Zeitplan vom Handy übernommen.");
            await StandAsync("Zeitplan vom Handy übernommen", true);
        }
        catch (Exception ex) { Fehler("Zeitplan-Wunsch", ex); }
    }

    private static double Zahl(JsonElement wert)
    {
        if (wert.TryGetProperty("doubleValue", out var dv)) return dv.GetDouble();
        if (wert.TryGetProperty("integerValue", out var iv)) return double.Parse(iv.GetString()!, CultureInfo.InvariantCulture);
        return 0;
    }

    // ---------- Firestore (REST) ----------
    private string Url(string doc) => $"https://firestore.googleapis.com/v1/projects/{_projekt}/databases/(default)/documents/akw/{doc}";

    private async Task<bool> SchreibenAsync(string doc, Dictionary<string, object?> felder)
    {
        await _einzeln.WaitAsync();
        try
        {
            var token = await TokenAsync();
            if (token == null) return false;
            var koerper = new JsonObject { ["fields"] = Felder(felder) }.ToJsonString();
            using var req = new HttpRequestMessage(HttpMethod.Patch, Url(doc)) { Content = new StringContent(koerper, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var r = await _http.SendAsync(req);
            if (!r.IsSuccessStatusCode) { Fehler("Schreiben " + doc, new Exception($"{(int)r.StatusCode} {Kurz(await r.Content.ReadAsStringAsync())}")); return false; }
            return true;
        }
        catch (Exception ex) { Fehler("Schreiben " + doc, ex); return false; }
        finally { _einzeln.Release(); }
    }

    private async Task<JsonElement?> LesenAsync(string doc)
    {
        var token = await TokenAsync();
        if (token == null) return null;
        using var req = new HttpRequestMessage(HttpMethod.Get, Url(doc));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var r = await _http.SendAsync(req);
        if ((int)r.StatusCode == 404) return null;
        if (!r.IsSuccessStatusCode) throw new Exception($"{(int)r.StatusCode} {Kurz(await r.Content.ReadAsStringAsync())}");
        using var d = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return d.RootElement.Clone();
    }

    private static JsonObject Felder(Dictionary<string, object?> felder)
    {
        var o = new JsonObject();
        foreach (var (k, v) in felder) o[k] = Wert(v);
        return o;
    }

    private static JsonNode Wert(object? v) => v switch
    {
        null => new JsonObject { ["nullValue"] = null },
        string s => new JsonObject { ["stringValue"] = s },
        bool b => new JsonObject { ["booleanValue"] = b },
        double d => new JsonObject { ["doubleValue"] = d },
        int i => new JsonObject { ["integerValue"] = i.ToString(CultureInfo.InvariantCulture) },
        DateTime t => new JsonObject { ["timestampValue"] = t.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture) },
        Dictionary<string, string> m => new JsonObject { ["mapValue"] = new JsonObject { ["fields"] = Felder(m.ToDictionary(x => x.Key, x => (object?)x.Value)) } },
        _ => new JsonObject { ["stringValue"] = v.ToString() }
    };

    // Zugangs-Token über das Dienstkonto (JWT, RS256) – gilt 1 Stunde
    private async Task<string?> TokenAsync()
    {
        if (_token != null && DateTime.UtcNow < _tokenBis) return _token;
        var jetzt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var kopf = B64(Encoding.UTF8.GetBytes("{\"alg\":\"RS256\",\"typ\":\"JWT\"}"));
        var inhalt = B64(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iss = _email, scope = "https://www.googleapis.com/auth/datastore", aud = _tokenUri, iat = jetzt, exp = jetzt + 3600
        }));
        var signatur = B64(_schluessel!.SignData(Encoding.ASCII.GetBytes(kopf + "." + inhalt), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
        using var r = await _http.PostAsync(_tokenUri, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer", ["assertion"] = kopf + "." + inhalt + "." + signatur
        }));
        var text = await r.Content.ReadAsStringAsync();
        if (!r.IsSuccessStatusCode) { Fehler("Anmeldung", new Exception($"{(int)r.StatusCode} {Kurz(text)}")); return null; }
        using var d = JsonDocument.Parse(text);
        _token = d.RootElement.GetProperty("access_token").GetString();
        _tokenBis = DateTime.UtcNow.AddMinutes(50);
        return _token;
    }

    private static string Kurz(string s) => s.Length > 200 ? s[..200] + " …" : s;

    // ohne Internet nicht das Log zuschreiben: höchstens alle 30 min eine Zeile
    private void Fehler(string was, Exception ex)
    {
        if ((DateTime.Now - _letzterFehlerLog).TotalMinutes < 30) return;
        _letzterFehlerLog = DateTime.Now;
        Log.Schreiben($"Fernspiegel ({was}) nicht erreichbar – am PC läuft alles weiter: {ex.Message}");
    }
}
