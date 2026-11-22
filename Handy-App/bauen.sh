#!/bin/bash
set -e
# Kennwort des eigenen Schlüssels vorher setzen: export PCSTART_KENNWORT=...
: "${PCSTART_KENNWORT:?PCSTART_KENNWORT setzen}"
A=$(dirname "$0"); cd "$A"
SDK=/usr/lib/android-sdk/platforms/android-23/android.jar
rm -rf bau; mkdir -p bau/klassen
javac -nowarn -source 8 -target 8 -bootclasspath "$SDK" -classpath "$SDK" -d bau/klassen $(find src -name '*.java') 2>&1 | grep -v "warning: \[options\]" || true
ls bau/klassen/de/oacreator/pcstart/*.class >/dev/null
dalvik-exchange --dex --output=bau/classes.dex bau/klassen
aapt package -f -M AndroidManifest.xml -S res -I "$SDK" -F bau/roh.apk
(cd bau && aapt add roh.apk classes.dex >/dev/null)
zipalign -f 4 bau/roh.apk bau/ausgerichtet.apk
[ -f schluessel/pcstart.jks ] || { mkdir -p schluessel; keytool -genkeypair -keystore schluessel/pcstart.jks -alias pcstart -keyalg RSA -keysize 2048 -validity 10000 -storepass "$PCSTART_KENNWORT" -keypass "$PCSTART_KENNWORT" -dname "CN=OA-Creator, O=Oli, C=DE" 2>/dev/null; }
apksigner sign --ks schluessel/pcstart.jks --ks-pass env:PCSTART_KENNWORT --key-pass env:PCSTART_KENNWORT --out bau/PC-Start.apk bau/ausgerichtet.apk
apksigner verify --print-certs bau/PC-Start.apk | head -2
ls -la bau/PC-Start.apk
