package de.oacreator.pcstart;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.DhcpInfo;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;

// Android ruft diesen Empfänger auf, sobald sich das Handy mit einem WLAN verbindet –
// auch wenn die App gar nicht offen ist. Kein Dauer-Symbol, kein eigener Hintergrunddienst.
public class WlanMelder extends BroadcastReceiver {
    private static final String ANGEMELDET = "angemeldetUm";
    private static final int FLAG_MUTABLE = 0x02000000;   // PendingIntent.FLAG_MUTABLE (Android 12+)

    private static PendingIntent absicht(Context c) {
        Intent i = new Intent(c, WlanMelder.class);
        return PendingIntent.getBroadcast(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | FLAG_MUTABLE);
    }

    // bei Android anmelden (nach App-Start, Handy-Neustart, Update)
    static void anmelden(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest r = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            PendingIntent pi = absicht(c);
            try { ConnectivityManager.class.getMethod("unregisterNetworkCallback", PendingIntent.class).invoke(cm, pi); } catch (Exception ignored) { }
            Wol.einst(c).edit().putLong(ANGEMELDET, System.currentTimeMillis()).apply();
            ConnectivityManager.class.getMethod("registerNetworkCallback", NetworkRequest.class, PendingIntent.class).invoke(cm, r, pi);
            Wol.notiz(c, "WLAN-Überwachung eingeschaltet");
        } catch (Exception e) {
            Wol.notiz(c, "WLAN-Überwachung nicht möglich: " + e);
        }
    }

    static void abmelden(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            ConnectivityManager.class.getMethod("unregisterNetworkCallback", PendingIntent.class).invoke(cm, absicht(c));
        } catch (Exception ignored) { }
    }

    // Seit 1.3 meldet der Waechter das WLAN. Kommt hier noch eine alte Meldung an: abmelden, nichts tun.
    @Override public void onReceive(final Context c, Intent intent) {
        abmelden(c);
    }

    private void altOnReceive(final Context c, Intent intent) {
        final SharedPreferences p = Wol.einst(c);
        if (!p.getBoolean(Wol.AUTOMATIK, true)) { Wol.notiz(c, "WLAN gemeldet – Automatik ist aus"); return; }
        // Direkt nach dem Anmelden meldet Android das schon verbundene WLAN – das ist kein "nach Hause kommen"
        if (System.currentTimeMillis() - p.getLong(ANGEMELDET, 0) < 15000) return;
        Wol.notiz(c, "WLAN verbunden");
        final Network n = intent.getParcelableExtra(ConnectivityManager.EXTRA_NETWORK);
        final PendingResult rest = goAsync();
        new Thread(new Runnable() { public void run() {
            try { pruefen(c, p, n); } finally { rest.finish(); }
        } }).start();
    }

    static void pruefen(Context c, SharedPreferences p, Network n) {
        try { Thread.sleep(2500); } catch (InterruptedException ignored) { }   // DHCP abwarten
        String gw = gateway(c);
        String soll = p.getString(Wol.GATEWAY, "").trim();
        if (gw == null) { Wol.notiz(c, "WLAN-Adresse nicht lesbar – PC nicht geweckt"); return; }
        if (!soll.isEmpty() && !soll.equals(gw)) { Wol.notiz(c, "fremdes WLAN (" + gw + ") – PC nicht geweckt"); return; }
        if (!Wol.imFenster(p)) { Wol.notiz(c, "zu Hause, aber außerhalb der Zeit – PC nicht geweckt"); return; }
        long sperre = p.getInt(Wol.SPERRE, 30) * 60000L;
        if (System.currentTimeMillis() - p.getLong(Wol.LETZTER, 0) < sperre) { Wol.notiz(c, "zu Hause, aber vor kurzem schon geweckt – nicht nochmal"); return; }
        Wol.senden(c, n, "WLAN zu Hause");
    }

    // Gateway (FRITZ!Box) des verbundenen WLANs, null wenn nicht lesbar
    private static String gateway(Context c) {
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            DhcpInfo d = wm.getDhcpInfo();
            if (d == null || d.gateway == 0) return null;
            int g = d.gateway;   // Bytes in umgekehrter Reihenfolge
            return (g & 0xFF) + "." + ((g >> 8) & 0xFF) + "." + ((g >> 16) & 0xFF) + "." + ((g >> 24) & 0xFF);
        } catch (Exception e) { return null; }
    }
}
