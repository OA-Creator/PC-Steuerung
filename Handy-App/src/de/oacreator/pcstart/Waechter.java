package de.oacreator.pcstart;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;

// Seit Version 1.3 (22.11.2026): Dauerwächter mit stiller Zeile "PC-Start wacht" in der Benachrichtigungsleiste.
// So darf MagicOS die App nicht schlafen legen und bekommt jedes WLAN-Verbinden sicher mit.
public class Waechter extends Service {
    private static final String KANAL = "waechter";
    private static final int NR = 1;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback rueckruf;
    private final Handler h = new Handler();
    private boolean bereit;          // die ersten Sekunden nach dem Start: schon verbundenes WLAN ist kein Heimkommen
    private boolean verbunden;

    static void starten(Context c) {
        Intent i = new Intent(c, Waechter.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) Context.class.getMethod("startForegroundService", Intent.class).invoke(c, i);
            else c.startService(i);
        } catch (Exception e) {
            Wol.notiz(c, "Wächter ließ sich nicht starten: " + e);
        }
    }

    static void stoppen(Context c) { c.stopService(new Intent(c, Waechter.class)); }

    @Override public void onCreate() {
        super.onCreate();
        WlanMelder.abmelden(this);   // alte Anmeldung aus Version 1.1/1.2 entfernen, sonst doppelt
        vordergrund();
        cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        rueckruf = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(final Network n) {
                if (!bereit) { verbunden = true; return; }
                if (verbunden) return;
                verbunden = true;
                melden(n);
            }
            @Override public void onLost(Network n) {
                verbunden = false;
                if (bereit) Wol.notiz(Waechter.this, "WLAN getrennt");
            }
        };
        try {
            cm.registerNetworkCallback(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), rueckruf);
            Wol.notiz(this, "Wächter läuft – WLAN-Überwachung eingeschaltet");
        } catch (Exception e) {
            Wol.notiz(this, "WLAN-Überwachung nicht möglich: " + e);
        }
        h.postDelayed(new Runnable() { public void run() { bereit = true; } }, 4000);
    }

    private void melden(final Network n) {
        if (!Wol.einst(this).getBoolean(Wol.AUTOMATIK, true)) { Wol.notiz(this, "WLAN verbunden – Automatik ist aus"); return; }
        Wol.notiz(this, "WLAN verbunden");
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        final PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pcstart:wecken");
        wl.acquire(30000);
        new Thread(new Runnable() { public void run() {
            try { WlanMelder.pruefen(Waechter.this, Wol.einst(Waechter.this), n); }
            finally { if (wl.isHeld()) wl.release(); }
        } }).start();
    }

    private void vordergrund() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                // NotificationChannel per Reflection (gebaut gegen android.jar 23)
                Class<?> k = Class.forName("android.app.NotificationChannel");
                Object kanal = k.getConstructor(String.class, CharSequence.class, int.class).newInstance(KANAL, "PC-Start Wächter", 2);
                k.getMethod("setShowBadge", boolean.class).invoke(kanal, false);
                NotificationManager.class.getMethod("createNotificationChannel", k).invoke(nm, kanal);
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(this, KANAL);
            } else {
                b = new Notification.Builder(this);
            }
            Intent auf = new Intent(this, Hauptseite.class);
            PendingIntent pi = PendingIntent.getActivity(this, 0, auf, PendingIntent.FLAG_UPDATE_CURRENT | 0x04000000 /* FLAG_IMMUTABLE */);
            Notification n = b.setSmallIcon(android.R.drawable.ic_lock_power_off)
                    .setContentTitle("PC-Start wacht")
                    .setContentText("Startet den PC, wenn du heimkommst")
                    .setOngoing(true).setShowWhen(false).setContentIntent(pi).build();
            startForeground(NR, n);
        } catch (Exception e) {
            Wol.notiz(this, "Wächter-Zeile nicht möglich: " + e);
        }
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }

    @Override public void onDestroy() {
        try { if (cm != null && rueckruf != null) cm.unregisterNetworkCallback(rueckruf); } catch (Exception ignored) { }
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
