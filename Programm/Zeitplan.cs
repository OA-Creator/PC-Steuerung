using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Atomkraftwerk;

// ---------------------------------------------------------------
// Zeitplan (seit 19.11.2026): PC zu festen Zeiten in den Ruhezustand schicken und wieder wecken.
//  - Aus: 5 Minuten vorher dezenter Push mit "Abbrechen", dann letzter Stand aufs Handy und Ruhezustand
//  - An:  Weck-Aufgabe in der Windows-Aufgabenplanung ("Atomkraftwerk PC wecken", weckt den PC)
// Gespeichert in daten\zeitplan.json – atomkraftwerk.json bleibt unberührt.
// ---------------------------------------------------------------
public class ZeitplanEintrag
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Aktion { get; set; } = "aus";        // "aus" oder "an"
    public string Zeit { get; set; } = "23:00";        // HH:mm
    public List<int> Tage { get; set; } = new();       // 1 = Mo … 7 = So; leer = einmalig
    public string? EinmaligAm { get; set; }            // yyyy-MM-dd, nur bei einmaligen Einträgen
    public bool Aktiv { get; set; } = true;
}

public sealed class Zeitplan
{
    public const int VorwarnungMinuten = 5;
    private const string Aufgabe = "Atomkraftwerk PC wecken";   // kein Unterordner: "Atomkraftwerk" ist schon die Autostart-Aufgabe

    private readonly Einstellungen _e;
    private readonly string _datei;
    private readonly string _ordner;
    private readonly object _sperre = new();
    private List<ZeitplanEintrag> _eintraege = new();
    private DateTime? _uebersprungen;      // dieses Aus wurde abgebrochen
    private DateTime? _gewarnt;            // für dieses Aus ging der Push schon raus
    private DateTime? _ausgefuehrt;        // dieses Aus wurde schon ausgeführt
    private DateTime? _weckerFuer;         // auf diese Zeit steht die Weck-Aufgabe
    private bool _weckerUnbekannt = true;  // nach dem Start einmal sicher neu setzen
    private bool _vorbereitet;
    private DateTime _letzteWeckerPruefung = DateTime.MinValue;
    public string Meldung { get; private set; } = "";

    // wird vor dem Ruhezustand aufgerufen (letzter Stand aufs Handy)
    public Func<Task>? VorDemSchlafen { get; set; }

    public Zeitplan(Einstellungen e, string ordner, string datenOrdner)
    {
        _e = e; _ordner = ordner;
        _datei = Path.Combine(datenOrdner, "zeitplan.json");
        Laden();
    }

    // ---------- Laden / Speichern ----------
    private void Laden()
    {
        try
        {
            if (File.Exists(_datei))
                _eintraege = JsonSerializer.Deserialize<List<ZeitplanEintrag>>(File.ReadAllText(_datei), Einstellungen.Json) ?? new();
        }
        catch (Exception ex) { Log.Schreiben("Zeitplan nicht lesbar: " + ex.Message); }
    }

    private void Schreiben()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_datei)!);
            File.WriteAllText(_datei, JsonSerializer.Serialize(_eintraege, Einstellungen.Json));
        }
        catch (Exception ex) { Log.Schreiben("Zeitplan nicht gespeichert: " + ex.Message); }
    }

    // ---------- Zeiten ausrechnen ----------
    private static TimeSpan? Uhrzeit(string s) =>
        TimeSpan.TryParseExact(s, @"h\:mm", CultureInfo.InvariantCulture, out var t) && t < TimeSpan.FromDays(1) ? t : null;

    private static int Wochentag(DateTime d) => d.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)d.DayOfWeek;

    // nächster Termin des Eintrags ab (einschließlich) "ab"
    private static DateTime? Naechster(ZeitplanEintrag z, DateTime ab)
    {
        if (!z.Aktiv || Uhrzeit(z.Zeit) is not TimeSpan t) return null;
        if (z.Tage.Count == 0)
        {
            if (!DateTime.TryParseExact(z.EinmaligAm, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var tag)) return null;
            var zeit = tag.Date + t;
            return zeit >= ab ? zeit : null;
        }
        for (var i = 0; i <= 7; i++)
        {
            var tag = ab.Date.AddDays(i);
            if (!z.Tage.Contains(Wochentag(tag))) continue;
            var zeit = tag + t;
            if (zeit >= ab) return zeit;
        }
        return null;
    }

    // einmaliger Eintrag, dessen Zeit vor "grenze" liegt (egal ob aktiv)
    private static bool Vorbei(ZeitplanEintrag z, DateTime grenze) =>
        Uhrzeit(z.Zeit) is TimeSpan t
        && DateTime.TryParseExact(z.EinmaligAm, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var tag)
        && tag.Date + t < grenze;

    private (DateTime zeit, ZeitplanEintrag eintrag)? Naechstes(string aktion, DateTime ab)
    {
        (DateTime, ZeitplanEintrag)? best = null;
        foreach (var z in _eintraege.Where(x => x.Aktion == aktion))
            if (Naechster(z, ab) is DateTime t && (best is null || t < best.Value.Item1)) best = (t, z);
        return best;
    }

    // ---------- jede Sekunde aus der Hauptschleife ----------
    public void Pruefen()
    {
        var jetzt = DateTime.Now;
        (DateTime zeit, ZeitplanEintrag eintrag)? aus;
        lock (_sperre)
        {
            // einmalige Einträge, deren Zeit vorbei ist, aufräumen
            var alt = _eintraege.Where(z => z.Tage.Count == 0 && Vorbei(z, jetzt.AddMinutes(-2))).ToList();
            if (alt.Count > 0) { foreach (var z in alt) _eintraege.Remove(z); Schreiben(); }
            aus = Naechstes("aus", jetzt.AddSeconds(-90));
        }

        if (aus is { } a && a.zeit != _uebersprungen && a.zeit != _ausgefuehrt)
        {
            var bis = a.zeit - jetzt;
            if (bis <= TimeSpan.Zero)
            {
                _ausgefuehrt = a.zeit;
                if (a.eintrag.Tage.Count == 0) lock (_sperre) { _eintraege.Remove(a.eintrag); Schreiben(); }
                _ = Task.Run(() => SchlafenLegen($"Zeitplan {a.eintrag.Zeit} Uhr"));
            }
            else if (bis <= TimeSpan.FromMinutes(VorwarnungMinuten) && _gewarnt != a.zeit)
            {
                _gewarnt = a.zeit;
                Log.Schreiben($"Zeitplan: PC geht um {a.zeit:HH:mm} in den Ruhezustand – Vorwarnung aufs Handy.");
                var basis = Heimnetz.Adressen(_e.Port).FirstOrDefault();
                _ = Handy.VorwarnungAsync(_e.Handy, "PC geht um " + a.zeit.ToString("HH:mm") + " schlafen",
                    $"Zeitplan: In {Math.Max(1, (int)Math.Ceiling(bis.TotalMinutes))} Minuten geht der PC in den Ruhezustand.",
                    basis is null ? null : basis + "api/zeitplan?aktion=abbrechen", basis);
            }
        }

        // Weck-Aufgabe jede Minute abgleichen (und sofort nach dem Start)
        if (_weckerUnbekannt || (jetzt - _letzteWeckerPruefung).TotalSeconds >= 60) WeckerAbgleichen();
    }

    // nach dem Aufwachen: Merker zurücksetzen, Wecker neu setzen
    public void NachDemAufwachen()
    {
        _weckerUnbekannt = true;
        WeckerAbgleichen();
    }

    // Wer hat den PC geweckt? (powercfg /lastwake) – ins Log, damit ungewolltes Aufwachen auffällt
    public static void WeckGrundLoggen()
    {
        _ = Task.Run(() =>
        {
            var (_, aus) = Ausfuehren("powercfg", "/lastwake", leise: true);
            var zeilen = aus.Split('\n').Select(z => z.Trim()).Where(z => z.Length > 0 && !z.StartsWith("Verlauf") && !z.StartsWith("Wake History")).Take(12);
            Log.Schreiben("Geweckt durch: " + string.Join(" | ", zeilen));
        });
    }

    // ---------- Ruhezustand ----------
    private async Task SchlafenLegen(string grund)
    {
        Log.Schreiben($"{grund}: PC geht in den Ruhezustand.");
        Vorbereiten();
        WeckerAbgleichen(erzwingen: true);
        try { if (VorDemSchlafen != null) await VorDemSchlafen().WaitAsync(TimeSpan.FromSeconds(6)); } catch { }
        Ausfuehren("shutdown", "/h");
    }

    // Ruhezustand einschalten und Weck-Zeitgeber erlauben (einmalig, braucht Admin-Rechte – die hat das Atomkraftwerk)
    private void Vorbereiten()
    {
        if (_vorbereitet) return;
        _vorbereitet = true;
        var a = Ausfuehren("powercfg", "/hibernate on").ok;
        // "Zeitgeber zur Aktivierung zulassen" = Aktivieren (Netzbetrieb)
        var b = Ausfuehren("powercfg", "/setacvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d 1").ok
              & Ausfuehren("powercfg", "/setactive SCHEME_CURRENT").ok;
        Log.Schreiben($"Zeitplan: Ruhezustand {(a ? "eingeschaltet" : "NICHT eingeschaltet")}, Weck-Zeitgeber {(b ? "erlaubt" : "NICHT erlaubt")}.");
    }

    // ---------- Weck-Aufgabe in der Windows-Aufgabenplanung ----------
    private void WeckerAbgleichen(bool erzwingen = false)
    {
        _letzteWeckerPruefung = DateTime.Now;
        DateTime? soll;
        lock (_sperre) soll = Naechstes("an", DateTime.Now.AddSeconds(30))?.zeit;
        if (!erzwingen && !_weckerUnbekannt && soll == _weckerFuer) return;
        var warUnbekannt = _weckerUnbekannt;
        _weckerUnbekannt = false;
        if (soll is DateTime t)
        {
            Vorbereiten();
            var xml = Path.Combine(Path.GetTempPath(), "atomkraftwerk_wecken.xml");
            File.WriteAllText(xml, AufgabeXml(t), Encoding.Unicode);
            var (ok, ausgabe) = Ausfuehren("schtasks", $"/create /tn \"{Aufgabe}\" /xml \"{xml}\" /f");
            try { File.Delete(xml); } catch { }
            if (ok) { if (_weckerFuer != t) Log.Schreiben($"Zeitplan: PC wird um {t:ddd dd.MM. HH:mm} geweckt."); _weckerFuer = t; Meldung = ""; }
            else { _weckerFuer = null; Meldung = "Weck-Aufgabe konnte nicht angelegt werden."; Log.Schreiben("Zeitplan: Weck-Aufgabe nicht angelegt: " + ausgabe); }
        }
        else
        {
            if (_weckerFuer != null || erzwingen || warUnbekannt) Ausfuehren("schtasks", $"/delete /tn \"{Aufgabe}\" /f", leise: true);
            if (_weckerFuer != null) Log.Schreiben("Zeitplan: kein Wecken mehr geplant.");
            _weckerFuer = null;
        }
    }

    private static string AufgabeXml(DateTime t) => $"""
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Atomkraftwerk: weckt den PC aus dem Ruhezustand (wird vom Atomkraftwerk verwaltet)</Description></RegistrationInfo>
  <Triggers><TimeTrigger><StartBoundary>{t:yyyy-MM-ddTHH:mm:ss}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>false</StartWhenAvailable>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>cmd.exe</Command><Arguments>/c exit</Arguments></Exec></Actions>
</Task>
""";

    private static (bool ok, string ausgabe) Ausfuehren(string datei, string argumente, bool leise = false)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo(datei, argumente)
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })!;
            var aus = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
            p.WaitForExit(15000);
            return (p.ExitCode == 0, aus.Trim());
        }
        catch (Exception ex) { if (!leise) Log.Schreiben($"{datei} {argumente}: {ex.Message}"); return (false, ex.Message); }
    }

    // ---------- Leitstand ----------
    public string Json(string? aktion, string? koerper)
    {
        var meldung = "";
        if (aktion == "speichern" && koerper != null)
        {
            try
            {
                var neu = JsonSerializer.Deserialize<List<ZeitplanEintrag>>(koerper, Einstellungen.Json) ?? new();
                var jetzt = DateTime.Now;
                foreach (var z in neu)
                {
                    z.Aktion = z.Aktion == "an" ? "an" : "aus";
                    z.Tage = z.Tage.Where(t => t >= 1 && t <= 7).Distinct().OrderBy(t => t).ToList();
                    if (Uhrzeit(z.Zeit) is not TimeSpan t) throw new FormatException($"Uhrzeit „{z.Zeit}“ ist ungültig.");
                    z.Zeit = $"{t.Hours:00}:{t.Minutes:00}";
                    if (string.IsNullOrWhiteSpace(z.Id)) z.Id = Guid.NewGuid().ToString("N")[..8];
                    if (z.Tage.Count == 0)
                    {
                        // einmalig: heute, wenn die Uhrzeit noch kommt, sonst morgen – ein bestehendes Datum bleibt
                        var alt = _eintraege.FirstOrDefault(x => x.Id == z.Id);
                        var gleich = alt != null && alt.Tage.Count == 0 && alt.Zeit == z.Zeit && alt.EinmaligAm != null;
                        z.EinmaligAm = gleich ? alt!.EinmaligAm : (jetzt.Date + t > jetzt ? jetzt.Date : jetzt.Date.AddDays(1)).ToString("yyyy-MM-dd");
                    }
                    else z.EinmaligAm = null;
                }
                lock (_sperre) { _eintraege = neu; Schreiben(); }
                _uebersprungen = null;
                Log.Schreiben($"Zeitplan im Leitstand gespeichert ({neu.Count} Einträge).");
                if (neu.Count > 0) Vorbereiten();
                WeckerAbgleichen(erzwingen: true);
                meldung = Meldung == "" ? "Gespeichert." : Meldung;
            }
            catch (Exception ex) { meldung = "Nicht gespeichert: " + ex.Message; }
        }
        else if (aktion == "abbrechen")
        {
            DateTime? ziel;
            lock (_sperre) ziel = Naechstes("aus", DateTime.Now.AddSeconds(-90))?.zeit;
            if (ziel is DateTime t)
            {
                _uebersprungen = t;
                Log.Schreiben($"Zeitplan: Ruhezustand um {t:HH:mm} abgebrochen.");
                meldung = $"Ruhezustand um {t:HH:mm} Uhr abgebrochen.";
                if (_gewarnt == t) _ = Handy.HinweisOhneKnopfAsync(_e.Handy, "Abbruch bestätigt", $"Der PC bleibt an (Zeitplan {t:HH:mm} Uhr übersprungen).");
            }
            else meldung = "Es ist kein Ruhezustand geplant.";
        }
        else if (aktion == "fortsetzen") { _uebersprungen = null; meldung = "Zeitplan läuft wieder normal."; }

        List<ZeitplanEintrag> liste;
        (DateTime zeit, ZeitplanEintrag eintrag)? aus, an;
        lock (_sperre)
        {
            liste = _eintraege.ToList();
            aus = Naechstes("aus", DateTime.Now.AddSeconds(-90));
            an = Naechstes("an", DateTime.Now.AddSeconds(30));
        }
        return JsonSerializer.Serialize(new
        {
            eintraege = liste,
            naechstesAus = aus?.zeit.ToString("yyyy-MM-ddTHH:mm"),
            naechstesAusUebersprungen = aus != null && aus.Value.zeit == _uebersprungen,
            naechstesAn = an?.zeit.ToString("yyyy-MM-ddTHH:mm"),
            weckerGesetzt = _weckerFuer?.ToString("yyyy-MM-ddTHH:mm"),
            vorwarnungMinuten = VorwarnungMinuten,
            meldung = meldung != "" ? meldung : Meldung
        }, Einstellungen.Json);
    }
}

// Nach dem Aufwachen den PC eine Weile wach halten: Windows schickt einen PC, der von selbst
// (Zeitplan oder Wake-on-LAN vom Handy) aufgewacht ist, sonst nach 2 Minuten ohne Eingabe wieder schlafen.
public static class WachHalten
{
    [DllImport("kernel32.dll")] private static extern uint SetThreadExecutionState(uint flags);
    private const uint Dauerhaft = 0x80000000, System = 0x00000001, Bildschirm = 0x00000002;
    private static int _laeuft;

    public static void Fuer(TimeSpan dauer)
    {
        if (Interlocked.Exchange(ref _laeuft, 1) == 1) return;
        new Thread(() =>
        {
            try
            {
                SetThreadExecutionState(Dauerhaft | System | Bildschirm);
                Thread.Sleep(dauer);
            }
            catch { }
            finally { SetThreadExecutionState(Dauerhaft); Interlocked.Exchange(ref _laeuft, 0); }
        }) { IsBackground = true, Name = "WachHalten" }.Start();
    }
}
