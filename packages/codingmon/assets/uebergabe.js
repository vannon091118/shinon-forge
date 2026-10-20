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

/**
 * Die LESE-Methode derselben Naht: der Client fragt den Aktivitaetsstand des
 * Hosts (abgeschlossene Agent-Schritte), statt auf einen Push zu warten — ein
 * Push (`ctx.emit`) erreicht den Browser nicht. Derselbe Beitrag, zweite
 * Methode; `test/uebergabe.test.mjs` vergleicht auch sie Zeichen fuer Zeichen.
 */
export const UEBERGABE_ACTIVITY_METHOD = 'readActivity';

/** Der kanonische Endpunkt der Lese-Methode. */
export const UEBERGABE_ACTIVITY_ENDPOINT = `${UEBERGABE_NAMESPACE}/${UEBERGABE_ACTIVITY_METHOD}`;

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
  'completions', 'wild',
];

/**
 * Die Typnamen des Wire-Vertrags. Sie stehen im Beitrag auf BEIDEN Seiten und
 * sind deshalb hier definiert: `<paket>#<Typ>` ist die Form, die Typert fuer
 * Schemata verlangt.
 */
export const SNAPSHOT_TYPE = `${UEBERGABE_PACKAGE}#Snapshot`;
export const SNAPSHOT_ACK_TYPE = `${UEBERGABE_PACKAGE}#SnapshotAck`;
export const ACTIVITY_TYPE = `${UEBERGABE_PACKAGE}#Activity`;

/**
 * Der Remote-Beitrag als DATEN — ohne Codec-Fabriken.
 *
 * WARUM OHNE `create`: die Fabrik ist auf dem HOST noetig (das Gateway loest
 * dort die strenge Definition auf), im BROWSER wird sie nie gerufen — der
 * Client baut den Aufruf aus Namensraum, Methode und Wire-Feldern und prueft
 * nichts; geprueft wird am Host (`pet-store.js`). Diese Datei ist darum die
 * gemeinsame QUELLE der Form: `pet-remote.js` setzt die Fabriken ein, und
 * `client.js` traegt dieselbe Form als Literal (sein Bundle kann nichts
 * importieren) — `test/uebergabe.test.mjs` vergleicht beide Zeichen fuer
 * Zeichen, damit die Dopplung nicht STILL driftet.
 */
export const REMOTE_CONTRIBUTION = {
  package: UEBERGABE_PACKAGE,
  descriptors: [
    {
      id: `${UEBERGABE_PACKAGE}#${UEBERGABE_ENDPOINT}`,
      service: UEBERGABE_SERVICE,
      namespace: UEBERGABE_NAMESPACE,
      method: UEBERGABE_METHOD,
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: UEBERGABE_PARAMETER,
          wire: UEBERGABE_PARAMETER,
          source: 'json',
          codec: { mode: 'strict', typeSymbol: SNAPSHOT_TYPE },
        },
      ],
      result: { mode: 'strict', typeSymbol: SNAPSHOT_ACK_TYPE },
      sourceLocation: { file: 'packages/codingmon/assets/pet-remote.js', line: 1, column: 1 },
    },
    {
      id: `${UEBERGABE_PACKAGE}#${UEBERGABE_ACTIVITY_ENDPOINT}`,
      service: UEBERGABE_SERVICE,
      namespace: UEBERGABE_NAMESPACE,
      method: UEBERGABE_ACTIVITY_METHOD,
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict', typeSymbol: ACTIVITY_TYPE },
      sourceLocation: { file: 'packages/codingmon/assets/pet-remote.js', line: 1, column: 1 },
    },
  ],
};
