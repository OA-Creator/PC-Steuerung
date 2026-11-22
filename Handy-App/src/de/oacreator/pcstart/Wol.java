package de.oacreator.pcstart;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Network;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

// Einstellungen und das eigentliche Wecken (Wake-on-LAN) – alles an einer Stelle
final class Wol {
    static final String MAC = "mac", BROADCAST = "broadcast", GATEWAY = "gateway", AUTOMATIK = "automatik",
            VON = "von", BIS = "bis", TAGE = "tage", SPERRE = "sperreMinuten", LETZTER = "letzterStart", MELDUNG = "meldung", VERLAUF = "verlauf";

    static SharedPreferences einst(Context c) {
        SharedPreferences p = c.getSharedPreferences("einst", Context.MODE_PRIVATE);
        if (!p.contains(MAC)) {
            p.edit()
                    .putString(MAC, "30:56:0F:76:37:70")      // Realtek 2.5GbE vom PC
                    .putString(BROADCAST, "192.168.178.255")
                    .putString(GATEWAY, "192.168.178.1")       // FRITZ!Box
                    .putBoolean(AUTOMATIK, true)
                    .putString(VON, "14:00").putString(BIS, "22:00")
                    .putString(TAGE, "1234567")                // 1 = Mo … 7 = So
                    .putInt(SPERRE, 30)
                    .apply();
        }
        return p;
    }

    static int minuten(String hhmm) {
        try {
            String[] t = hhmm.trim().split(":");
            int h = Integer.parseInt(t[0]), m = Integer.parseInt(t[1]);
            if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
            return h * 60 + m;
        } catch (Exception e) { return -1; }
    }

    static int wochentag(Calendar k) {
        int d = k.get(Calendar.DAY_OF_WEEK);           // So = 1 … Sa = 7
        return d == Calendar.SUNDAY ? 7 : d - 1;       // Mo = 1 … So = 7
    }

    // Liegt "jetzt" im eingestellten Zeitfenster und an einem erlaubten Tag?
    static boolean imFenster(SharedPreferences p) {
        Calendar k = Calendar.getInstance();
        int jetzt = k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE);
        int von = minuten(p.getString(VON, "00:00")), bis = minuten(p.getString(BIS, "23:59"));
        if (von < 0 || bis < 0) return false;
        boolean ueberNacht = bis < von;
        int tag = wochentag(k);
        // über Mitternacht: nach Mitternacht zählt der Tag, an dem das Fenster begonnen hat
        if (ueberNacht && jetzt <= bis) { k.add(Calendar.DAY_OF_MONTH, -1); tag = wochentag(k); }
        if (!p.getString(TAGE, "").contains(String.valueOf(tag))) return false;
        return ueberNacht ? (jetzt >= von || jetzt <= bis) : (jetzt >= von && jetzt <= bis);
    }

    static byte[] paket(String mac) {
        String[] t = mac.trim().split("[:\\-]");
        if (t.length != 6) throw new IllegalArgumentException("MAC-Adresse ungültig");
        byte[] m = new byte[6];
        for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(t[i], 16);
        byte[] b = new byte[6 + 16 * 6];
        for (int i = 0; i < 6; i++) b[i] = (byte) 0xFF;
        for (int i = 0; i < 16; i++) System.arraycopy(m, 0, b, 6 + i * 6, 6);
        return b;
    }

    // Schickt das Weck-Paket mehrmals an Broadcast und an alle (Port 9 und 7). Nicht im UI-Thread aufrufen.
    static String senden(Context c, Network ueber, String grund) {
        SharedPreferences p = einst(c);
        String text;
        try {
            byte[] b = paket(p.getString(MAC, ""));
            DatagramSocket s = new DatagramSocket();
            try {
                s.setBroadcast(true);
                if (ueber != null) ueber.bindSocket(s);
                InetAddress[] ziele = { InetAddress.getByName(p.getString(BROADCAST, "255.255.255.255")), InetAddress.getByName("255.255.255.255") };
                for (int runde = 0; runde < 3; runde++) {
                    for (InetAddress z : ziele) {
                        s.send(new DatagramPacket(b, b.length, z, 9));
                        s.send(new DatagramPacket(b, b.length, z, 7));
                    }
                    Thread.sleep(300);
                }
            } finally { s.close(); }
            p.edit().putLong(LETZTER, System.currentTimeMillis()).apply();
            text = "PC geweckt (" + grund + ")";
        } catch (Exception e) {
            text = "Wecken fehlgeschlagen: " + e.getMessage();
        }
        notiz(c, text);
        return zeit(System.currentTimeMillis()) + "  " + text;
    }

    // Eine Zeile in die Liste schreiben (die letzten 10 bleiben). Gleiche Zeile innerhalb von 5 min nur einmal.
    static synchronized void notiz(Context c, String was) {
        SharedPreferences p = einst(c);
        long jetzt = System.currentTimeMillis();
        String alt = p.getString(VERLAUF, "");
        if (was.equals(p.getString("letzteNotiz", "")) && jetzt - p.getLong("letzteNotizUm", 0) < 300000) return;
        String zeile = zeit(jetzt) + "  " + was;
        StringBuilder neu = new StringBuilder(zeile);
        String[] z = alt.isEmpty() ? new String[0] : alt.split("\n");
        for (int i = 0; i < z.length && i < 9; i++) neu.append('\n').append(z[i]);
        p.edit().putString(VERLAUF, neu.toString()).putString(MELDUNG, zeile)
                .putString("letzteNotiz", was).putLong("letzteNotizUm", jetzt).apply();
    }

    static String zeit(long ms) {
        return new SimpleDateFormat("EE dd.MM. HH:mm", Locale.GERMANY).format(new Date(ms));
    }

    private Wol() { }
}
