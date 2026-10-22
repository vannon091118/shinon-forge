# Changelog für Übergaben

> **Zweck:** kompakte, übertragbare Änderungsspur für Menschen und Folge-Agenten.
> Erledigt heißt erst erledigt, wenn der konkrete Beleg und der CI-Status genannt sind.
> Die ausführliche Erzählung mit Commit- und Pfadankern bleibt in [TAGEBUCH.md](TAGEBUCH.md);
> offene Aufgaben bleiben ausschließlich in [ROADMAP.md](ROADMAP.md).

## Unreleased

### Geändert
- README-/Banner-/Clean-Clone-Hygiene, Security-Workflow und Agenten-Übergabe werden über PR #23 zusammengeführt. Status erst nach grünen Pflicht-Gates und Merge als abgeschlossen markieren.

### Belege
- PR: https://github.com/vannon091118/shinon-forge/pull/23
- CI: vor Merge aus dem tatsächlichen PR-Check-Status übernehmen; niemals einen erwarteten Lauf als bestanden eintragen.

### Übergabe an den nächsten Agenten
- Zuerst PR-Checks und Security-Workflow prüfen, Fehler beheben und den Merge erst bei erfüllten Pflicht-Gates ausführen.
- Danach Release-Freigabe v0.4.0 anhand der kanonischen Kriterien in [ROADMAP.md](ROADMAP.md) fortsetzen.
- Neue offene Arbeit nur in [ROADMAP.md](ROADMAP.md) aufnehmen; abgeschlossene Punkte dort entfernen und hier mit Beleg sowie in [TAGEBUCH.md](TAGEBUCH.md) mit Commit-/Pfadankern dokumentieren.
