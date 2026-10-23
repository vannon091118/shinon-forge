# Quellteile der Client-Hälfte

`client.js` ist **generiert**: dieses Verzeichnis trägt die Zeilen, das Bundle
ist ihre Summe im Rahmen des Modul-Loaders. Warum das so ist, steht in
`scripts/build-client.mjs` — kurz: eine Client-Hälfte ist selbstständig (sie
kann zur Laufzeit nichts aus `assets/` nachladen), und eine 3 500-Zeilen-Datei
ist nicht prüfbar. Die Zerlegung ist eine Werkzeugaufgabe
(`scripts/assets/split-client.mjs`), nicht Handarbeit.

## Was ein Teil ist

- ein **Fragment**, kein Modul: kein `import`, kein `export`, kein eigener
  Scope. Alle Teile liegen im selben `factory(require)`-Scope des Bundles.
- die **wörtlichen** Zeilen des Bundles, inklusive Einrückung. Der Generator
  verkettet, er formatiert nicht.
- benannt nach seiner ersten Deklaration (`04-round-delay-ms.js`), nicht nach
  einem Thema. Ein Name ist deshalb stabil, solange die erste Deklaration
  bleibt.

## Die Reihenfolge, die gilt

1. **Handarbeit** passiert hier, in genau einem Teil.
2. **Generatoren schreiben ebenfalls hierher**, nie in `client.js`:
   `node scripts/assets/build-sprites.mjs --embed` (Gitter, UI, Kunst),
   `node scripts/assets/build-codingmon.mjs --write` (Katalogregionen) und
   `node scripts/assets/build-encounter-client.mjs` (eingebetteter
   Encounter-Kern). Welcher Teil einen Block trägt, wird gesucht
   (`findBlockFile`), nicht verdrahtet.
3. `node scripts/build-client.mjs --all` schreibt `client.js`.
4. Prüfen: `node scripts/build-client.mjs --check --all`,
   `node scripts/assets/build-* --check` und `npm run test:codingmon`.

## Fences sind unantastbar

`// >>> <name>` … `// <<< <name>` und `// #region …` … `// #endregion …` sind
gesperrte Bereiche: kein Teil beginnt oder endet darin. Der Splitter verweigert
eine Zerlegung, die einen Block zerschneiden würde, und ein Einbetter ersetzt
keinen Rumpf, der eine fremde Marke enthält (`markerBalance` in
`scripts/lib/embed-blocks.mjs`). Beides ist aus einem echten Schaden entstanden:
ein Schnitt mitten durch den Encounter-Kern hat beim ersten Generatorlauf die
Teile-Marken mitverschluckt.
