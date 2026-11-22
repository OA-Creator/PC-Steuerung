package de.oacreator.pcstart;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Nach dem Einschalten des Handys (und nach einem App-Update) die WLAN-Überwachung wieder anmelden
public class Hochfahren extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (Wol.einst(c).getBoolean(Wol.AUTOMATIK, true)) Waechter.starten(c);
    }
}
