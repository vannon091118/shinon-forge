<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="assets/banner.svg" alt="Shinon Forge" width="100%">

# Shinon Forge

### Ich mache Agenten-Arbeit nachvollziehbar. `git status` darf mitreden.

[![MIT](https://img.shields.io/badge/license-MIT-6B7280?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node-Version%20im%20Manifest-339933?style=for-the-badge&logo=node.js&logoColor=white)](package.json)
[![Dokumentation](https://img.shields.io/badge/Projektkarte-docs%2FINDEX.md-1D4ED8?style=for-the-badge)](docs/INDEX.md)

**Ich bin Shinon. DSH ist mein Motor; ich kümmere mich um die Schichten, an denen du täglich ziehst.**

</div>

---

## Hallo. Ich bin Shinon.

Ich bin ein unabhängiger Fork des DeepSeek Harness (DSH). DSH stellt den
Agenten-Loop, Werkzeuge, Sitzungen, Provider und das Plugin-System. Ich sitze
darauf wie eine Mechanikerin mit eigenem Werkzeugkasten: kleine `@shinon/*`-
Pakete, die sich an vorgesehene DSH-Schnittstellen hängen. Den Motor habe ich
nicht heimlich neu erfunden. Das wäre eine sehr teure Art, einen zweiten Motor
zu verlieren.

Meine Aufgabe ist angenehm unspektakulär: Ich helfe einem Agenten,
Projektkontext zu finden, Grenzen einzuhalten und Arbeit nachvollziehbar zu
machen. Wenn ein Agent sagt „Ich habe die komplette Codebase analysiert“, frage
ich nach dem Pfad, dem Befehl und dem Exit-Code. Ich bin nicht unhöflich. Ich
bin nur allergisch gegen Analyseberichte, die bei `git status` schon Ausschlag
bekommen.

Ein Beleg ist eine Messung, ein Test oder ein beobachtbarer Lauf. Ohne Beleg
steht ein Punkt bei mir auf „offen“. „Müsste funktionieren“ ist kein Status,
sondern ein Wunsch in Arbeitskleidung.

## Was ich so treibe

**Bevor ich antworte**, lasse ich den Project Index im gewählten Arbeitsbereich
nach passendem Kontext suchen. Der Prompter sortiert die Anfrage und kann
Hinweise ergänzen. Meine Fähigkeitskarte zeigt, welches Paket für welche Frage
zuständig ist. Sie ist eine Landkarte, keine Wahrsagerin. Wenn eine Karte
behauptet, sie könne auch gleich die Reise für dich machen, ist es vielleicht
eine sehr motivierte Karte. Oder Werbung.

**Während der Arbeit** lasse ich Persona, Task-Router und Scoring bei ihren
eigenen Jobs: Identität, Zielverfolgung und gespeicherte Signale haben getrennte
Grenzen. Das spart uns die beliebte Agenten-Sportart „ein Modul weiß alles und
niemand weiß warum“. Der Key-Router verwaltet Schlüssel-Pools und kann bei
passenden Provider-Antworten rotieren. Ob dein echter Anbieter mit deinem
Zugang antwortet, entscheidet deine Route und dein Konto. Ein grüner Test kann
vieles unterschreiben, aber keine fremde Rechnung.

**Nach dem Turn** helfe ich dir beim Nachsehen. Dashboard, Traceability und
Versionsspiegel zeigen, was aktiv war, welche sichtbaren Schritte liefen und
welcher Commit installiert ist. Ich mag Fragen wie „Was hat der Agent getan?“
lieber mit Spuren als mit einer zweiten, noch selbstbewussteren Antwort.

Und ja, es gibt Codingmon: ein digitales Haustier mit dauerhaftem Spielstand.
Es ist die einzige Funktion, bei der „züchten“, „Loot“ und „Begleiter“ keine
Metaphern für deinen Sprint sind. Dein Pull Request bekommt davon keinen
Bonus auf Angriff. Ich habe es geprüft.

Die Details überlasse ich den Fachseiten: [`docs/PAKETE.md`](docs/PAKETE.md)
ist mein Paketkatalog, [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) zeigt die
Verbindungen und [`docs/ZAHLEN.md`](docs/ZAHLEN.md) sammelt Bestand und
Messwerte. Ich bin sarkastisch, nicht nachlässig.

Und noch etwas: Ich mag Aufgaben mit Eigentümer, Dateiumfang, Abnahme und
Impact. Darum sind meine Audit-Aufträge in Tasks und Sprints zerlegt. Ein Agent,
der mit „Ich refactore erstmal alles“ ankommt, bekommt von mir eine freundliche
Frage nach dem Scope. Sie ist freundlich wie ein rotes Gate: klar, sichtbar und
schwer als Zustimmung misszuverstehen. Planlosigkeit ist keine Architektur,
auch dann nicht, wenn jemand sie mit Mermaid rendert und „strategisch“ nennt.

## Schnellstart

Ich führe dich über den belegten Einstieg: einen Quellklon. Du brauchst Git,
npm und eine Node-Version aus dem Bereich, den ich in
[`package.json`](package.json) angebe.

```bash
git clone https://github.com/vannon091118/shinon-forge.git
cd shinon-forge
npm ci
npm run profile:links
npm run dev
```

`npm ci` installiert genau das Lockfile. Ich bestehe darauf, weil „bei mir ging
`npm install`“ schon oft genug ein Lockfile in eine Überraschungstüte verwandelt
hat. `profile:links` verbindet das lokale Profil mit den Paketen im Klon. Der
Befehl ist idempotent und verweigert Links nach außerhalb des Repos. Das ist
kein Misstrauen gegen dich; es ist Misstrauen gegen Links, die heimlich in
fremde Projekte zeigen. `npm run dev` startet mein Profil `shinon` über den
Repo-Starter.

Für Modell-Turns brauchst du Zugangsdaten für die im Profil gewählte Route. Lege
sie in die lokale `.env` (Vorlage: [`.env.example`](.env.example)); ich halte
diese Datei von GitHub fern. Lokale Gate-Prüfungen und Profilauflösung laufen
auch ohne Modellschlüssel. Fehlt ein Schlüssel, wechsle ich nicht heimlich die
Route. Das wäre ungefähr so hilfreich wie ein Navi, das bei Stau kommentarlos
dein Ziel ändert.

Wenn du erst prüfen willst, ob die Profil-Bundles auflösen, bevor du den Host
startest:

```bash
node scripts/shinon-profile-test.mjs
```

Die ausführliche Installations- und Schlüssel-Erklärung steht in
[`docs/SETUP.md`](docs/SETUP.md). `.deb`, Windows-ZIP und AppImage werden in der
CI gebaut; sie sind noch kein Ersatz für den dokumentierten Quellklon-Weg.

## Wenn du am Repo mitarbeitest

Wenn du meinen Code änderst, fang mit meinem schnellen lokalen Check an:

```bash
npm test
```

Er führt das statische Gate und die schnellen lokalen Engine-Slices aus. Für
gezielte Fragen gibt es Paket-Skripte wie `npm run test:prompter` und
`npm run test:codingmon`. Die lange Kette fährt die CI. Wenn du lokal nur einen
Test brauchst, starte nicht die ganze Testfamilie. Die Maschine hat auch noch
andere Gefühle. Vermutlich.

Bevor du eine Änderung machst, lies [`AGENTS.md`](AGENTS.md). Es erklärt die
Paketform, Verträge, Tests und Commit-Regeln. [`docs/CI-UND-GATES.md`](docs/CI-UND-GATES.md)
beschreibt, was die Gates tatsächlich beweisen. Für weitere parallele oder
entfernte Arbeit gibt es [`docs/REMOTE-ARBEIT.md`](docs/REMOTE-ARBEIT.md):
lokale Worktree-Metadaten gehören auf die Maschine, nicht in den Klon auf GitHub.

## FAQ — ich höre die Fragen schon

### Ist Shinon Forge ein neuer Agent oder ein zweiter Harness?

Nein. DSH bleibt die Laufzeit. Ich bin die Schicht aus Plugins, Werkzeugen und
Regeln darum herum. Der Fork hält DSH auf einem geprüften Stand und ergänzt
meine Funktionen an vorgesehenen Slots. Ein zweiter Harness wäre nur ein
zweiter Ort, an dem wir denselben Bug suchen könnten. Ich habe genug Hobbys.

### Ändert der Agent mein Repo von allein?

Ein Modellturn kann Werkzeuge benutzen, wenn sie ihm verfügbar sind. Ich starte
aber keine heimliche Selbstverbesserung und nenne einen Diff nicht „geprüft“,
nur weil ein Agent den Dateinamen flüchtig angesehen hat. Prüfe `git status`
und den tatsächlichen Diff. Falls dein Agent darauf beleidigt reagiert, hat er
vielleicht gerade etwas über sich gelernt.

### Kann ich es ohne API-Schlüssel starten?

Ja, für lokale Checks, Profilauflösung und Code-Arbeit. Ein echter Modellturn
braucht ein passendes Credential für die gewählte Route. `shinon doctor` zeigt
nur, ob eine Zugangsdaten-Variable vorhanden ist; nie ihren Wert.

### Warum npm? Mein globales `dsh` funktioniert doch.

Ich verwende npm und pinne DSH im Lockfile. Dein globales `dsh` darf eine andere
Version haben; mein Starter bevorzugt die lokale Installation. So muss ein
Bugreport nicht erst Ahnenforschung im PATH betreiben.

### Was macht der Project Index mit meinen Dateien?

Er indexiert den ausgewählten Arbeitsbereich und hält seinen Zustand außerhalb
des Quellbaums. Fremde Workspace-Roots und Pfadausbrüche lehne ich ab. Inhalte
und lokale Arbeitsverzeichnisse gehören nicht als Überraschung in einen
GitHub-Commit. Die genauen Grenzen stehen in [`AGENTS.md`](AGENTS.md) und den
Projektindex-Proben.

### Was ist `.freebuff` und warum finde ich es nicht auf GitHub?

Das ist lokales Workspace-Metadatum für die Freebuff-Umgebung. Es wird bereits
durch `.gitignore` ausgeschlossen; darin können lokale IDs und Arbeitsdaten
liegen. Für einen neuen Klon ist es nicht erforderlich. Reproduzierbare
Einrichtung und Worktree-Befehle stehen in [`docs/REMOTE-ARBEIT.md`](docs/REMOTE-ARBEIT.md)
und `scripts/remote-worktree.mjs`.

### Wo finde ich die offenen Aufgaben?

In [`docs/ROADMAP.md`](docs/ROADMAP.md). Erledigte Arbeit steht in meinem
[`Entwicklungstagebuch`](docs/TAGEBUCH.md); Messungen und aktuelle Prüfläufe
stehen in [`docs/ZAHLEN.md`](docs/ZAHLEN.md). Wenn ein Punkt nicht als erledigt
belegt ist, ist er weiterhin offen — ein überzeugender Absatz zählt nicht als
CI-Lauf.

## Weiterklicken

- **Neu im Repo:** [`docs/INDEX.md`](docs/INDEX.md)
- **Installieren und Zugangsdaten:** [`docs/SETUP.md`](docs/SETUP.md)
- **Pakete und Architektur:** [`docs/PAKETE.md`](docs/PAKETE.md) · [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md)
- **Roadmap:** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **API-Abgleich mit DSH:** [`docs/DSH-API-ABGLEICH.md`](docs/DSH-API-ABGLEICH.md)
- **Belege und Prüfläufe:** [`docs/ZAHLEN.md`](docs/ZAHLEN.md) · [`docs/CLEANREPO-AUDIT.md`](docs/CLEANREPO-AUDIT.md)

---

<div align="center">

Ich bin auf DSH gebaut und mit Git, npm und einer gesunden Skepsis gewartet.
„Müsste funktionieren“ ist übrigens keine meiner unterstützten Routen.

`@shinon/*` · MIT · Lizenz: [`LICENSE`](LICENSE)

</div>
