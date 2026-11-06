# Preferans za Android (APK)

Aplikacija je „omotač“ oko sajta (Trusted Web Activity, isto kao Lora): otvara https://preferans.igrajmo.online
preko celog ekrana, preko Chrome-a na telefonu. Sve izmene na sajtu odmah važe i u aplikaciji. Novi APK treba
samo kad se menja ikonica, ime, boje ili paket.

- Paket: `online.igrajmo.preferans`. Podešavanja su u `twa-manifest.json`, a ostalo Bubblewrap pravi iz njega.
- Ključ za potpisivanje je ISTI kao za Loru i NIJE u projektu: `D:\Lora-android-kljuc\lora.keystore` (alias `lora`).
  Bez njega se ne mogu slati nove verzije.
- Server daje `assetlinks.json` (otisak ključa) na `/.well-known/assetlinks.json` (server/src/androidApp.ts).
  Bez njega bi gore stajala traka sa adresom. Za Google Play sa „Play App Signing“ treba dodati i Google-ov otisak.
- Preuzimanje: https://preferans.igrajmo.online/preferans.apk. Fajl je na serveru u `/var/www/preferans/downloads/`,
  ne u git-u.

## Nova verzija

Alati su u `D:\DevTools\android` (JDK 17, Android SDK, Bubblewrap), a podešavanje u `~/.bubblewrap/config.json`.

```sh
cd android
unset NoDefaultCurrentDirectoryInExePath   # inače cmd ne nalazi gradlew.bat u ovom folderu
export JAVA_HOME="D:/DevTools/android/jdk-17.0.20.1+1" ANDROID_HOME="D:/DevTools/android/sdk"
# u twa-manifest.json povećaj appVersionCode (i appVersionName), pa:
npx --prefix D:/DevTools/android/bubblewrap bubblewrap update --skipVersionUpgrade
BUBBLEWRAP_KEYSTORE_PASSWORD=… BUBBLEWRAP_KEY_PASSWORD=… \
  npx --prefix D:/DevTools/android/bubblewrap bubblewrap build --skipPwaValidation
cd .. && sh tools/apk-upload.sh
```

`update` skida ikonice sa adresa iz `twa-manifest.json`, pa nova ikonica mora prvo da bude na sajtu.
Za .aab (Google Play) `jarsigner` mora biti u PATH-u (`$JAVA_HOME/bin`).
