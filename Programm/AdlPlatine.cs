using System.Runtime.InteropServices;

namespace Atomkraftwerk;

// ---------------------------------------------------------------
// Grafikkarten-Leistung direkt über AMDs Treiber-Schnittstelle (ADL, atiadlxx.dll)
// Liefert "Gesamtleistung der Platine" (PMLOG_BOARD_POWER) wie in Adrenalin.
// LibreHardwareMonitor kennt für die Nitro nur "GPU Package" (Chip). (seit 05.11.2026)
// ---------------------------------------------------------------
public sealed class AdlPlatine : IDisposable
{
    private const int PmlogAsicPower = 23;   // Chip (ASIC) in W
    private const int PmlogBoardPower = 73;  // ganze Platine in W
    private const int MaxSensoren = 256;
    private const int AdapterInfoGroesse = 1572; // Windows-Aufbau von AdapterInfo (ADL SDK)

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate IntPtr MallocRueckruf(int groesse);

    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ADL2_Main_Control_Create(MallocRueckruf malloc, int nurVerbundene, out IntPtr kontext);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ADL2_Main_Control_Destroy(IntPtr kontext);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ADL2_Adapter_NumberOfAdapters_Get(IntPtr kontext, out int anzahl);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ADL2_Adapter_AdapterInfo_Get(IntPtr kontext, IntPtr puffer, int groesse);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int ADL2_New_QueryPMLogData_Get(IntPtr kontext, int adapter, IntPtr ausgabe);

    private static readonly MallocRueckruf Malloc = groesse => Marshal.AllocHGlobal(groesse); // bleibt am Leben
    private IntPtr _kontext = IntPtr.Zero;
    private IntPtr _puffer = IntPtr.Zero;
    private readonly List<int> _adapter = new();

    public bool Bereit => _adapter.Count > 0;
    public string Hinweis { get; private set; } = "";
    public string Adapterliste { get; private set; } = "";

    // gpuName: Name der Karte wie von LHM (z. B. "AMD Radeon RX 9070")
    public AdlPlatine(string gpuName)
    {
        if (!OperatingSystem.IsWindows() || string.IsNullOrWhiteSpace(gpuName)) { Hinweis = "keine Grafikkarte"; return; }
        try
        {
            if (ADL2_Main_Control_Create(Malloc, 1, out _kontext) != 0 || _kontext == IntPtr.Zero) { Hinweis = "ADL startet nicht"; return; }
            if (ADL2_Adapter_NumberOfAdapters_Get(_kontext, out var anzahl) != 0 || anzahl <= 0) { Hinweis = "ADL findet keine Adapter"; return; }
            var info = Marshal.AllocHGlobal(anzahl * AdapterInfoGroesse);
            try
            {
                for (int i = 0; i < anzahl * AdapterInfoGroesse; i++) Marshal.WriteByte(info, i, 0);
                if (ADL2_Adapter_AdapterInfo_Get(_kontext, info, anzahl * AdapterInfoGroesse) != 0) { Hinweis = "ADL Adapterliste fehlt"; return; }
                var gefunden = new List<string>();
                for (int i = 0; i < anzahl; i++)
                {
                    var p = info + i * AdapterInfoGroesse;
                    int index = Marshal.ReadInt32(p, 4);
                    int hersteller = Marshal.ReadInt32(p, 4 + 4 + 256 + 12);
                    string name = Marshal.PtrToStringAnsi(p + 4 + 4 + 256 + 16) ?? "";
                    gefunden.Add($"{index}:{name.Trim()}");
                    if ((hersteller == 1002 || hersteller == 0x1002) && !name.Contains("Radeon(TM) Graphics", StringComparison.OrdinalIgnoreCase)
                        && (name.Trim().Equals(gpuName.Trim(), StringComparison.OrdinalIgnoreCase) || gpuName.Contains(name.Trim(), StringComparison.OrdinalIgnoreCase)
                            || name.Contains(gpuName.Replace("AMD ", "").Trim(), StringComparison.OrdinalIgnoreCase))
                        && !_adapter.Contains(index))
                        _adapter.Add(index);
                }
                Adapterliste = string.Join(" | ", gefunden.Distinct());
            }
            finally { Marshal.FreeHGlobal(info); }
            _puffer = Marshal.AllocHGlobal(4 + MaxSensoren * 8);
            if (_adapter.Count == 0) Hinweis = $"ADL kennt \"{gpuName}\" nicht, gefunden: {Adapterliste}";
        }
        catch (Exception ex) { Hinweis = "ADL nicht verfügbar: " + ex.Message; _adapter.Clear(); }
    }

    // Liest (Platine, Chip) in Watt. null, wenn der Treiber den Wert nicht liefert.
    public (float? platine, float? chip) Lesen()
    {
        if (!Bereit || _puffer == IntPtr.Zero) return (null, null);
        foreach (var a in _adapter)
        {
            try
            {
                for (int i = 0; i < 4 + MaxSensoren * 8; i += 4) Marshal.WriteInt32(_puffer, i, 0);
                Marshal.WriteInt32(_puffer, 0, 4 + MaxSensoren * 8);
                if (ADL2_New_QueryPMLogData_Get(_kontext, a, _puffer) != 0) continue;
                float? Wert(int sensor)
                {
                    int unterstuetzt = Marshal.ReadInt32(_puffer, 4 + sensor * 8);
                    int wert = Marshal.ReadInt32(_puffer, 4 + sensor * 8 + 4);
                    return unterstuetzt != 0 ? wert : null;
                }
                var platine = Wert(PmlogBoardPower);
                var chip = Wert(PmlogAsicPower);
                if (platine is not null || chip is not null)
                {
                    // Adapter mit Werten nach vorne, damit beim nächsten Mal sofort der richtige gefragt wird
                    if (_adapter[0] != a) { _adapter.Remove(a); _adapter.Insert(0, a); }
                    return (platine, chip);
                }
            }
            catch { }
        }
        return (null, null);
    }

    public void Dispose()
    {
        try { if (_kontext != IntPtr.Zero) ADL2_Main_Control_Destroy(_kontext); } catch { }
        _kontext = IntPtr.Zero;
        if (_puffer != IntPtr.Zero) { Marshal.FreeHGlobal(_puffer); _puffer = IntPtr.Zero; }
    }
}
