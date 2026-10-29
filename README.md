# Toths Reinigungsservice – Handy-App

Web-App (PWA) für das Kleingewerbe *Toths Reinigungsservice*. Läuft auf Android und iPhone im Browser, lässt sich wie eine App auf den Startbildschirm legen und funktioniert offline.

## Funktionen

- **Kunden** – Kontaktdaten, Privat-/Geschäftskunde, Reinigungsintervall, Stundensatz, Standard-Aufgaben, Notizen (Schlüssel, Zugang …)
- **Einsätze** – Datum, Uhrzeit/Stunden, Checkliste „was wurde gereinigt“, Notiz, **Vorher-/Nachher-Fotos** (direkt mit der Kamera)
- **Zusatzleistungen** – Katalog mit Preisen (Müll rausbringen, Mülltonnen, Fenster, Bügeln …), beim Einsatz abhaken, wird automatisch zusätzlich zur Pauschale/zu den Stunden berechnet; Katalog unter *Einstellungen → Leistungen & Preise* änderbar
- **Reinigungsplan** – pro Kunde Rhythmus (z. B. alle 2 Wochen, dienstags 9 Uhr) und für jede Aufgabe, wie oft sie anfällt (jedes Mal, alle 4 Wochen, alle 3 Monate …). Die App erstellt daraus den Plan, verteilt große Aufgaben gleichmäßig, trägt ihn als Termine ein und kann ihn per WhatsApp an den Kunden schicken
- **Termine** – geplante Reinigungen mit Aufgaben; nächste Fälligkeit wird automatisch aus dem Intervall berechnet; Export in den Handy-Kalender (.ics)
- **Startseite** – überfällig / heute / nächste 7 Tage, nicht abgerechnete Einsätze, offene Rechnungen
- **Rechnungen** für Kleinunternehmer (§ 19 UStG):
  - Abrechnung je Kunde als **Monatspauschale** (Standard 250 €, mit Auflistung der Einsätze im Monat) oder **nach Stunden**; die Startseite erinnert an fällige Monatsrechnungen
  - Pflichtangaben nach § 14 UStG: Name & Anschrift beider Parteien, Steuernummer, Rechnungsdatum, fortlaufende Rechnungsnummer (`RE-2026-001`), Leistungsdatum, Menge & Art der Leistung, Entgelt
  - Hinweis „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet“
  - Für Privatkunden: Ausweis der Arbeits- und Fahrtkosten nach § 35a EStG (haushaltsnahe Dienstleistung) und Aufbewahrungshinweis
  - Drucken bzw. „Als PDF sichern“, Status offen/bezahlt/storniert, Umsatzanzeige gegenüber der Kleinunternehmergrenze
- **Datensicherung** – Export/Import aller Daten inkl. Fotos als Datei

> Alle Daten liegen **nur auf dem Handy** (kein Server, keine Cloud). Bitte regelmäßig unter *Einstellungen → Sicherung erstellen* sichern. Rechnungen müssen 10 Jahre aufbewahrt werden. Das ist keine Steuerberatung: Die Rechnungsvorlage bitte einmal vom Steuerbüro oder Finanzamt prüfen lassen.

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

Reines HTML/CSS/JavaScript ohne Build-Schritt. Daten in IndexedDB (`js/db.js`), Oberfläche und Logik in `js/app.js`, Offline-Cache in `sw.js`. Nach Änderungen an Dateien die Cache-Version in `sw.js` erhöhen.
