/**
 * uebergabe — die NAMEN der Naht Client -> Host, an einer Stelle.
 *
 * WARUM ES DIESE DATEI GIBT: der Client spiegelt den Spielstand zum Host, und
 * eine Naht hat Namen, die auf beiden Seiten dieselben sein MUESSEN: Paket,
 * Namespace, Methode, Dienstschluessel und die Feldliste des Vertrags. Diese
 * Namen standen sonst zweimal im Baum (Host in index.js, Client als Literal in
 * client.js), und zwei Wahrheiten driften — genau das, was der Rest dieses
 * Pakets vermeidet.
 *
 * WAS HIER BEWUSST NICHT STEHT: kein Import. Das Client-Bundle ist
 * selbststaendig (es zieht React ueber `require`, nicht ueber `import`) und kann
 * diese Datei deshalb nicht laden; client.js traegt die Namen als Literal und
 * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen. Die
 * Dopplung bleibt so sichtbar und geprueft statt still.
 *
 * Die Naht selbst ist DSHs Typert-RPC (api-gateway): der Client holt sich den
 * generierten Beitrag ueber `ctx.remote.$mount(contribution)` und ruft die
 * Methode; der Host loest den Endpunkt in seiner Registry auf und ruft den
 * Dienst. Was hier steht, muss in BEIDEN Haelften passen.
 */

/** Das Paket, dem die Naht gehoert. Muss dem `name` in package.json entsprechen. */
export const UEBERGABE_PACKAGE = '@shinon/codingmon';

/** Der Cordis-Dienstschluessel des Host-Dienstes — zugleich der Wire-Namespace. */
export const UEBERGABE_SERVICE = 'codingmonRemote';

/** Der Wire-Namespace des Endpunkts. */
export const UEBERGABE_NAMESPACE = 'codingmon';

/** Die Wire-Methode des Endpunkts. */
export const UEBERGABE_METHOD = 'writeSnapshot';

/** Der kanonische Endpunkt `<namespace>/<method>`, wie das Gateway ihn bildet. */
export const UEBERGABE_ENDPOINT = `${UEBERGABE_NAMESPACE}/${UEBERGABE_METHOD}`;

/** Der Name des einzigen Parameters. Die SRC-Aufloesung liest ihn aus der Signatur. */
export const UEBERGABE_PARAMETER = 'snapshot';

/**
 * Der Vertrag der Uebergabe (Client -> Host) als Feldliste. Der Host nimmt nur
 * auf, was hier steht; `damageTotal` ist Dezimaltext, weil JSON kein BigInt
 * kennt. Die Reihenfolge ist die Reihenfolge des Snapshots, nicht die des
 * Speichers.
 */
export const SNAPSHOT_FIELDS = [
  'schemaVersion', 'species', 'xp', 'wins', 'losses', 'round', 'damageTotal', 'hits', 'loot', 'savedAt',
];
