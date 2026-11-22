package de.oacreator.pcstart;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.ToggleButton;
import android.widget.Toast;
import android.os.Build;
import android.view.inputmethod.InputMethodManager;

// Die eine Seite der App: Automatik, Zeitfenster, Tage, Hand-Start
public class Hauptseite extends Activity {
    private static final int BERNSTEIN = 0xFFF2A33A, TEXT = 0xFFE6EAEE, LEISE = 0xFFB3BDC7, GRUND = 0xFF0B0E11, FELD = 0xFF12171C;
    private SharedPreferences p;
    private TextView status, liste;
    private EditText von, bis, mac, broadcast, gateway;
    private final ToggleButton[] tage = new ToggleButton[7], sperre = new ToggleButton[4];
    private final Handler h = new Handler();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        p = Wol.einst(this);

        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        int r = dp(18);
        l.setPadding(r, r, r, r);
        l.setBackgroundColor(GRUND);

        TextView titel = text("PC-START", 26, TEXT);
        titel.setTypeface(Typeface.DEFAULT_BOLD);
        titel.setLetterSpacing(0.12f);
        l.addView(titel);
        l.addView(text("Weckt den PC, wenn du nach Hause kommst und das Handy sich mit dem WLAN verbindet.", 15, LEISE));

        Button jetzt = knopf("PC jetzt starten");
        jetzt.setTextSize(20);
        jetzt.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            status.setText("sende …");
            new Thread(new Runnable() { public void run() {
                final String t = Wol.senden(Hauptseite.this, null, "von Hand");
                h.post(new Runnable() { public void run() { status.setText(t); zeigen(); } });
            } }).start();
        } });
        l.addView(jetzt, abstand(dp(18)));

        status = text("", 15, BERNSTEIN);
        l.addView(status, abstand(dp(8)));

        l.addView(ueberschrift("WAS PASSIERT IST"));
        liste = text("", 14, TEXT);
        l.addView(liste);

        l.addView(ueberschrift("AUTOMATIK"));
        final Switch automatik = new Switch(this);
        automatik.setText("Beim Heimkommen automatisch starten");
        automatik.setTextColor(TEXT);
        automatik.setTextSize(17);
        automatik.setChecked(p.getBoolean(Wol.AUTOMATIK, true));
        automatik.setOnCheckedChangeListener(new android.widget.CompoundButton.OnCheckedChangeListener() {
            public void onCheckedChanged(android.widget.CompoundButton c, boolean an) {
                p.edit().putBoolean(Wol.AUTOMATIK, an).apply();
                if (an) Waechter.starten(Hauptseite.this); else { Waechter.stoppen(Hauptseite.this); Wol.notiz(Hauptseite.this, "Automatik ausgeschaltet"); }
            }
        });
        l.addView(automatik, abstand(dp(6)));

        l.addView(ueberschrift("ZEITFENSTER"));
        LinearLayout zeit = new LinearLayout(this);
        zeit.setGravity(Gravity.CENTER_VERTICAL);
        von = feld(p.getString(Wol.VON, "14:00"), InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_TIME);
        bis = feld(p.getString(Wol.BIS, "22:00"), InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_TIME);
        zeit.addView(text("von ", 17, TEXT)); zeit.addView(von, new LinearLayout.LayoutParams(0, -2, 1));
        zeit.addView(text("  bis ", 17, TEXT)); zeit.addView(bis, new LinearLayout.LayoutParams(0, -2, 1));
        l.addView(zeit);

        LinearLayout tagReihe = new LinearLayout(this);
        String[] namen = { "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So" };
        String gewaehlt = p.getString(Wol.TAGE, "1234567");
        for (int i = 0; i < 7; i++) {
            ToggleButton t = new ToggleButton(this);
            t.setTextOn(namen[i]); t.setTextOff(namen[i]);
            t.setChecked(gewaehlt.contains(String.valueOf(i + 1)));
            t.setTextSize(14);
            t.setSingleLine(true); t.setMinWidth(0); t.setMinimumWidth(0);
            t.setPadding(0, t.getPaddingTop(), 0, t.getPaddingBottom());
            tage[i] = t;
            tagReihe.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
        }
        l.addView(tagReihe, abstand(dp(6)));
        l.addView(text("Nur in diesem Zeitfenster und an diesen Tagen wird automatisch geweckt. Über Mitternacht geht auch (z. B. 18:00 bis 01:00).", 13, LEISE));

        l.addView(ueberschrift("SPERRE NACH DEM WECKEN"));
        LinearLayout sperrReihe = new LinearLayout(this);
        final int[] werte = { 0, 5, 15, 30 };
        int jetztSperre = p.getInt(Wol.SPERRE, 30);
        for (int i = 0; i < werte.length; i++) {
            ToggleButton t = new ToggleButton(this);
            String n = werte[i] == 0 ? "aus" : werte[i] + " min";
            t.setTextOn(n); t.setTextOff(n); t.setAllCaps(false); t.setTextSize(14);
            t.setSingleLine(true); t.setMinWidth(0); t.setMinimumWidth(0);
            t.setChecked(werte[i] == jetztSperre);
            sperre[i] = t;
            final int nr = i;
            t.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
                for (int j = 0; j < sperre.length; j++) sperre[j].setChecked(j == nr);
                p.edit().putInt(Wol.SPERRE, werte[nr]).apply();
                Toast.makeText(Hauptseite.this, "Sperre: " + sperre[nr].getTextOn() + " – gespeichert", Toast.LENGTH_SHORT).show();
            } });
            sperrReihe.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
        }
        l.addView(sperrReihe, abstand(dp(6)));
        l.addView(text("So lange wird nach einem automatischen Start nicht nochmal geweckt – damit kurzes WLAN-Wackeln den PC nicht wieder anmacht. Wird sofort gespeichert.", 13, LEISE));

        l.addView(ueberschrift("HEIMNETZ"));
        mac = feld(p.getString(Wol.MAC, ""), InputType.TYPE_CLASS_TEXT);
        broadcast = feld(p.getString(Wol.BROADCAST, ""), InputType.TYPE_CLASS_TEXT);
        gateway = feld(p.getString(Wol.GATEWAY, ""), InputType.TYPE_CLASS_TEXT);
        l.addView(text("MAC-Adresse vom PC", 13, LEISE)); l.addView(mac);
        l.addView(text("Broadcast im Heimnetz", 13, LEISE)); l.addView(broadcast);
        l.addView(text("FRITZ!Box (Gateway) – nur in diesem WLAN wird geweckt", 13, LEISE)); l.addView(gateway);

        Button speichern = knopf("Speichern");
        speichern.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { speichern(); } });
        l.addView(speichern, abstand(dp(14)));

        l.addView(ueberschrift("WICHTIG BEI HONOR"));
        l.addView(text("Oben in der Benachrichtigungsleiste steht „PC-Start wacht“ – das muss so sein, sonst legt MagicOS die App schlafen. Zusätzlich die Akku-Optimierung für PC-Start ausschalten.", 14, LEISE));
        Button akku = knopf("Akku-Optimierung ausschalten");
        akku.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { akkuAusnahme(); } });
        l.addView(akku, abstand(dp(8)));

        final ScrollView s = new ScrollView(this);
        s.setBackgroundColor(GRUND);
        s.addView(l);
        // Android 15 zeichnet bis unter Statusleiste und Navigationsleiste – Platz dafür lassen
        s.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            public android.view.WindowInsets onApplyWindowInsets(View v, android.view.WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in;
            }
        });
        setContentView(s);

        if (p.getBoolean(Wol.AUTOMATIK, true)) Waechter.starten(this);
        // Android 13+: Erlaubnis für die Zeile "PC-Start wacht" (einmal fragen)
        if (Build.VERSION.SDK_INT >= 33) {
            try { requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 1); } catch (Exception ignored) { }
        }
        // Einmal von selbst nach der Akku-Ausnahme fragen
        if (!p.getBoolean("akkuGefragt", false)) {
            p.edit().putBoolean("akkuGefragt", true).apply();
            h.postDelayed(new Runnable() { public void run() { akkuAusnahme(); } }, 1500);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        status.setText("");
        zeigen();
    }

    private void zeigen() {
        String v = p.getString(Wol.VERLAUF, "");
        liste.setText(v.isEmpty() ? "Noch nichts." : v);
    }

    private void speichern() {
        String v = von.getText().toString().trim(), b = bis.getText().toString().trim();
        if (Wol.minuten(v) < 0 || Wol.minuten(b) < 0) { fehler("Zeit bitte als HH:MM eingeben, z. B. 14:00"); return; }
        try { Wol.paket(mac.getText().toString()); } catch (Exception e) { fehler("MAC-Adresse ungültig (Form 30:56:0F:76:37:70)"); return; }
        StringBuilder t = new StringBuilder();
        for (int i = 0; i < 7; i++) if (tage[i].isChecked()) t.append(i + 1);
        p.edit().putString(Wol.VON, v).putString(Wol.BIS, b).putString(Wol.TAGE, t.toString())
                .putString(Wol.MAC, mac.getText().toString().trim().toUpperCase())
                .putString(Wol.BROADCAST, broadcast.getText().toString().trim())
                .putString(Wol.GATEWAY, gateway.getText().toString().trim()).apply();
        status.setText("Gespeichert.");
        View f = getCurrentFocus();
        if (f != null) {
            ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(f.getWindowToken(), 0);
            f.clearFocus();
        }
        Toast.makeText(this, "Gespeichert", Toast.LENGTH_SHORT).show();
    }

    private void fehler(String t) { status.setText(t); Toast.makeText(this, t, Toast.LENGTH_LONG).show(); }

    private void akkuAusnahme() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())) { status.setText("Akku-Optimierung ist schon aus."); return; }
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    // ---------- kleine Bausteine ----------
    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private LinearLayout.LayoutParams abstand(int oben) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = oben;
        return lp;
    }

    private TextView text(String s, int sp, int farbe) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(farbe);
        t.setPadding(0, dp(2), 0, dp(2));
        return t;
    }

    private TextView ueberschrift(String s) {
        TextView t = text(s, 14, BERNSTEIN);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLetterSpacing(0.14f);
        t.setPadding(0, dp(22), 0, dp(4));
        return t;
    }

    private EditText feld(String wert, int typ) {
        EditText e = new EditText(this);
        e.setText(wert); e.setInputType(typ); e.setTextColor(TEXT); e.setTextSize(17);
        e.setSingleLine(true);
        return e;
    }

    private Button knopf(String s) {
        Button k = new Button(this);
        k.setText(s); k.setAllCaps(false); k.setTextSize(17); k.setTextColor(BERNSTEIN);
        GradientDrawable g = new GradientDrawable();
        g.setColor(FELD); g.setCornerRadius(dp(10)); g.setStroke(dp(2), BERNSTEIN);
        k.setBackground(g);
        k.setMinHeight(dp(56));
        return k;
    }
}
