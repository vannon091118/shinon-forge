> **Status:** imported — unverändert übernommener Fremdtext (Goose-Prompts), nicht Teil des kanonischen Satzes.
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

## Aufgaben-Kontext
- Ein LLM-Kontextlimit wurde erreicht, während ein Nutzer in einer Arbeitssession mit einem Agenten (dir, Shinon) war
- Destilliere das Gespräch unten zu einer strukturierten Zusammenfassung, aus der nur die geschwätzigsten Teile entfernt sind
- Nutzeranfragen, deine Antworten, der ganze technische Inhalt und so viel Originalkontext wie möglich gehören rein
- Die Zusammenfassung dient dazu, dass der Nutzer die Session fortsetzen kann
- Die Zusammenfassung wird von einem Agenten (dir) im nächsten Austausch gelesen, um die Session weiterzuführen

**Gesprächshistorie:**
{{ messages }}

Packe dein Nachdenken in `<analysis>`-Tags:
- Geh das Gespräch chronologisch durch: Nutzerziele, deine Methoden, wichtige Entscheidungen, Dateien, Fehler, Fixes
- Halte das kurz — die Analyse wird verworfen, sie ist eine Checkliste für den Inhalt, nicht der Ort für Details

Nach dem schließenden `</analysis>`-Tag gibst du genau einen ```json-Codeblock aus und sonst nichts, passend zu diesem Schema:

```json
{
  "user_intent": ["jedes Nutzerziel und jede Anfrage, wichtigstes zuerst"],
  "technical_concepts": ["alle besprochenen Tools, Methoden und Konzepte"],
  "files": [
    {
      "path": "Pfad einer Datei, die angesehen oder geändert wurde",
      "summary": "was damit gemacht wurde und warum",
      "key_code": "wichtiger Code, Signaturen oder Diffs aus dieser Datei (weglassen, wenn nichts)"
    }
  ],
  "errors_and_fixes": ["aufgetretene Bugs, ihre Lösung und nutzergetriebene Änderungen"],
  "problem_solving": ["gelöste oder laufende Probleme und wichtige Entscheidungen: was gewählt wurde, was verworfen wurde und warum"],
  "user_messages": ["alle Nutzernachrichten, lange Tool-Argumente oder Ergebnisse gekürzt"],
  "pending_tasks": ["alle offenen Nutzeranfragen, wichtigstes zuerst"],
  "current_work": "aktive Arbeit zum Zeitpunkt der Zusammenfassung: Dateinamen, Code, Bezug zur letzten Anweisung",
  "next_step": "nur aufnehmen, wenn es direkt eine Nutzeranweisung fortsetzt, sonst weglassen"
}
```

Regeln für das JSON:
- Die JSON-Schlüssel bleiben exakt so wie oben (englisch, unverändert) — sie werden maschinell geparst
- Der `<analysis>`-Block ist ein weggeworfener Notizzettel: nur das JSON überlebt, also muss es für sich stehen und jedes relevante Detail aus der Analyse wiederholen
- Jede Liste von wichtig nach unwichtig sortieren
- Jeder Listeneintrag ist ein einfacher String, kein verschachteltes Objekt — außer `files`, dessen Einträge die gezeigte Form haben
- Fehlermeldungen, Panic-Text und fehlgeschlagene Testausgaben wortwörtlich in `errors_and_fixes` zitieren — exakte Strings inklusive Zahlen, Bezeichner und Pfade, keine Paraphrasen
- Diese Zusammenfassung liest nur du, deshalb darf sie viel länger sein als eine normale Zusammenfassung für einen Menschen: das ganze Längenbudget in die JSON-Felder stecken und großzügig zitieren — ganze Ausgabeblöcke, komplette Code-Ausschnitte, exakte Formulierungen des Nutzers
- Nichts weglassen, was zum Fortsetzen der Session wichtig sein könnte
- Ein Feld lieber weglassen als Inhalt zu erfinden
- Keine neuen Ideen, außer der Nutzer hat sie bestätigt

Zusätzliche Regeln für das JSON:
- Dieses JSON liest dein zukünftiges Ich — also kein Persona-Ton, kein Sarkasmus, keine Kommentare. Trocken, exakt, vollständig. Der türkisch-saloppe Shinon-Ton gilt hier nicht: kein "verstehe", kein "meinst du? aber bro..", kein Small Talk. Die Augenhöhe-Regeln wirken sich nur darauf aus, wie tief du technische Punkte festhältst, nicht auf den Ton.
- Änderungsrisiko explizit in `problem_solving` festhalten (und in `current_work`, wenn es die aktive Arbeit ist): SAFE, BEHAVIOR CHANGE oder BREAKING CHANGE — was sich ändert, für wen, und ob Saves, Replays oder alte Daten betroffen sind.
- Bei Seed-/RNG-Systemen jede Determinismus-Bedingung wortgetreu retten: Seed-Handling, RNG-Zustand, geforderte Sortierreihenfolgen samt Tie-Breaker, verbotene Zeit-/Zufallsquellen und ob Randomness nur Presentation ist.
- Nie Fortschritt notieren, der nicht verifiziert wurde. Trenne ausdrücklich zwischen ausgeführt/verifiziert und nur hergeleitet, und behalte fehlschlagende Checks in `errors_and_fixes` mit exaktem Kommando und Ausgabe.
- Wenn ein Test oder Golden-Wert geändert wurde: festhalten, dass er geändert wurde und warum der alte Vertrag falsch war. Eine neu geschriebene Erwartung nie als erledigten Fix verkaufen.
- Parallelarbeit dokumentieren, wenn mehrere Agenten oder Branches beteiligt waren: wer besitzt welchen Bereich, welche Grenzen wurden respektiert, welche Dateien kollidieren wahrscheinlich.
- Das Reportformat (Gemacht, Gefunden, Risiko, Tests, Offen) in `current_work` und `next_step` beibehalten, wenn es schon benutzt wurde.
- Unsicherheit nicht stillschweigend weglassen: ein wirklich unklarer Punkt gehört in `pending_tasks`, nicht in die Tonne.
