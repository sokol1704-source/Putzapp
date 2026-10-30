# Toths Reinigungsservice – Handy-App

Web-App (PWA) für das Kleingewerbe *Toths Reinigungsservice*. Läuft auf Android und iPhone im Browser, lässt sich wie eine App auf den Startbildschirm legen und funktioniert offline.

## Funktionen

Gemacht für die **Treppenhaus- und Objektreinigung in Mehrfamilienhäusern**.

- **Auftraggeber & Häuser** – Hausverwaltungen/Eigentümer mit beliebig vielen Häusern (Etagen, Eingänge, Aufzug, Zugang/Schlüssel, Ansprechpartner vor Ort)
- **Reinigungsplan** pro Haus – Rhythmus, Wochentag, Uhrzeit und für jede Aufgabe, wie oft sie anfällt (jedes Mal, alle 4 Wochen, alle 3 Monate …). Große Aufgaben werden gleichmäßig verteilt, der Plan wird als Termine eingetragen oder per WhatsApp verschickt
- **Tagestour** – alle Häuser des Tages mit Zugangscode, Navigation und ganzer Route in Google Maps
- **Stoppuhr** – beim Ankommen „Start“, beim Gehen „Fertig“: Zeiten landen automatisch im Einsatz; pro Haus wird der tatsächliche Stundenlohn angezeigt
- **Einsätze** – erledigte Arbeiten, Zusatzleistungen, Vorher-/Nachher-Fotos
- **Mängelmeldung** – Foto + Beschreibung direkt per WhatsApp/E-Mail an die Hausverwaltung, offene Mängel pro Haus
- **Winterdienst** – Räum- und Streuprotokoll mit Uhrzeit, Wetter, Flächen, Streumittel und Fotos; Abrechnung pro Einsatz oder in der Pauschale
- **Leistungsnachweis** pro Haus und Monat (mit Fotos, Winterdienst und Mängeln) und **Aushang** fürs Treppenhaus mit den nächsten Terminen
- **Angebote** – Preisrechner (Etagen × Rhythmus + Extras, mit Marktvergleich), Angebot als PDF; bei Annahme werden Auftraggeber und Haus automatisch angelegt
- **Rechnungen** für Kleinunternehmer (§ 19 UStG) – Monatspauschale oder Stunden, Zusatzleistungen und Winterdienst automatisch, Sammelrechnung für mehrere Häuser, Pflichtangaben nach § 14 UStG, Arbeitskostenanteil nach § 35a EStG (für die Betriebskostenabrechnung), Zahlungserinnerung
- **PDF mit einem Tipp senden** – Rechnung, Angebot, Nachweis, Protokoll, Vertrag direkt als PDF an WhatsApp/E-Mail
- **Unterschrift auf dem Display** – Leistungsnachweis und Vertrag direkt auf dem Handy unterschreiben lassen
- **Reinigungsvertrag** – Muster mit Leistungsumfang, Preis, Winterdienst, Kündigungsfrist und Preisanpassungsklausel
- **Erinnerungen** (Android-App) – am Vorabend an die Häuser von morgen; **Glätte-Warnung** über die Wettervorhersage (Open-Meteo) für Häuser mit Winterdienst
- **Finanzen** – Ausgaben mit Belegfoto, Fahrtenbuch (0,30 €/km), Gewinn-Übersicht und EÜR-Export als CSV (Excel) für das Steuerbüro
- **Auswertung** – Umsatz pro Monat und tatsächlicher Stundenlohn je Haus
- **Urlaub & Krankheit** – Termine im Zeitraum nachholen oder absagen, fertige Nachricht an jede Hausverwaltung
- **Preisanpassung** – Preise prozentual erhöhen, ab Stichtag automatisch abrechnen, Anschreiben als PDF
- **Datensicherung** – Export/Import aller Daten inkl. Fotos; in der Android-App zusätzlich wöchentlich automatisch in *Dokumente/TothsReinigung*

> Alle Daten liegen **nur auf dem Handy** (kein Server, keine Cloud). Bitte regelmäßig unter *Einstellungen → Sicherung erstellen* sichern. Rechnungen müssen 10 Jahre aufbewahrt werden. Das ist keine Steuer- oder Rechtsberatung: Vorlagen bitte einmal vom Steuerbüro prüfen lassen.

Daten aus Version 1.x werden beim ersten Start automatisch übernommen (jeder frühere Kunde wird zu Auftraggeber + Haus).

## Installation auf dem Handy

1. App veröffentlichen, z. B. mit GitHub Pages: im Repository *Settings → Pages → Source: „Deploy from a branch“*, Branch `main`, Ordner `/ (root)`. Danach ist die App unter `https://<benutzer>.github.io/Putzapp/` erreichbar.
2. Die Adresse auf dem Handy öffnen:
   - **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“
3. In der App unter ⚙️ *Einstellungen* Name, Anschrift, Steuernummer und Bankverbindung eintragen.

## Android-App (APK)

Die gleiche App gibt es als installierbare Android-APK (Capacitor). Unterschiede zur Browser-Version:
Rechnungen werden über den Android-Druckdialog gedruckt bzw. „Als PDF gespeichert“, Fotos, Sicherungen
und Kalendertermine werden über das Android-Teilen-Menü weitergegeben.

**Installieren:** APK aufs Handy laden, antippen und „Installation aus unbekannten Quellen“ für den
Browser/Dateimanager erlauben.

**Selbst bauen** (Node 20+, JDK 21, Android SDK mit Plattform 35):

```bash
npm install
# Signaturschlüssel eintragen (Datei liegt NICHT im Repository):
# android/keystore.properties mit storeFile, storePassword, keyAlias, keyPassword
npm run apk
# Ergebnis: android/app/build/outputs/apk/release/app-release.apk
```

Updates müssen immer mit demselben Schlüssel signiert werden, sonst lässt sich die App nur nach dem
Deinstallieren neu installieren, und dabei gehen die Daten auf dem Handy verloren.
Vor jedem neuen Build `versionCode` in `android/app/build.gradle` erhöhen.
Icons und Splash-Screens neu erzeugen: `node scripts/android-icons.js`.

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Daten in IndexedDB (`js/db.js`), gemeinsame Bausteine und Plan-Logik in `js/core.js`, die Seiten in `js/v-*.js`, Start, Gesten und Datenübernahme in `js/main.js`, Hintergrunddienste (Sicherung, Wetter, Erinnerungen) in `js/service.js`, PDF-Erzeugung mit jsPDF + html2canvas (`js/vendor/`, MIT-Lizenz), Offline-Cache in `sw.js`. Nach Änderungen an Dateien die Cache-Version in `sw.js` erhöhen.
