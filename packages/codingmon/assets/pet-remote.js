/**
 * pet-remote — die Host-Haelfte der Uebergabe (Client -> Host).
 *
 * WARUM ES DIESE DATEI GIBT: `pet-store.js` legt den Stand dauerhaft ab, aber
 * ein Speicher ohne Absender ist ein leeres Blatt: bis hierher hat NICHTS im
 * Baum je `write` gerufen, und der Spiegel meldete folgerichtig „noch kein
 * Stand". Diese Datei ist der Empfaenger. Sie ist die Host-Seite des
 * Typert-RPC von DSH (api-gateway): ein Cordis-Dienst mit ZWEI als Remote
 * → Kanon: docs/COMMENT-KANON.md#k-6ba3af2466b5
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { levelFor } from './mechanik.js';
import { ActivitySchema, SnapshotAckSchema, SnapshotSchema } from './snapshot-schema.js';
import {
  UEBERGABE_ACTIVITY_ENDPOINT, UEBERGABE_ACTIVITY_METHOD, UEBERGABE_ENDPOINT, UEBERGABE_METHOD,
  UEBERGABE_NAMESPACE, UEBERGABE_PACKAGE, UEBERGABE_PARAMETER, UEBERGABE_SERVICE,
} from './uebergabe.js';

/**
 * Eine oeffentliche Methode als Remote-Endpunkt kennzeichnen — ohne
 * Build-Schritt.
 *
 * `Remote` aus `dsh-typert-protocol` ist die oeffentliche Fassung der
 * Standard-Methodendekoratoren: sie bekommt den Methodenwert und einen
 * Dekoratorkontext und traegt die Kennzeichnung ueber dessen `addInitializer`
 * in die Prototyp-Tabelle ein (die kompilierte DSH-Fassung desselben Aufrufs
 * → Kanon: docs/COMMENT-KANON.md#k-2b8e8cc83d2f
 */
function markRemote(prototype, method) {
  const receiver = Object.create(prototype);
  Remote(prototype[method], {
    kind: 'method',
    name: method,
    static: false,
    private: false,
    addInitializer: (initializer) => initializer.call(receiver),
  });
}

/**
 * Der Host-Dienst der Uebergabe. Er besitzt keinen Zustand: er nimmt an, prueft
 * und reicht weiter an das Handle, das `apply` beim Oeffnen des Spiegels haelt.
 */
class CodingmonRemote extends TypertRemoteService {
  /**
   * @param {object} ctx - Cordis-Context des Hosts.
   * @param {object} store - offener Spiegel (`openPetStore`), nicht `null`.
   * @param {object} activity - lebendiger Zaehler aus `apply`
   *   (`{ completions, running }`, wird dort mutiert, hier nur gelesen).
   */
  constructor(ctx, store, activity) {
    // Der Dienstschluessel und der WIRE-Namespace sind zwei Dinge: Cordis kennt
    // den Dienst unter `codingmonRemote`, der Endpunkt heisst aber
    // `codingmon/writeSnapshot`. Ohne die zweite Angabe waere der Namespace der
    // Dienstschluessel, das Gateway faende den Endpunkt nicht (`claimsEndpoint`
    // vergleicht den Namespace der Bindung) und der Aufruf liefe ins Leere.
    super(ctx, UEBERGABE_SERVICE, { namespace: UEBERGABE_NAMESPACE });
    this.store = store;
    this.activity = activity;
  }

  /**
   * Einen Stand annehmen und dauerhaft ablegen. Die Parameterliste ist Teil des
   * Vertrags: SRC liest den Wire-Namen `snapshot` aus genau diesem Namen.
   * @param {object} snapshot - Stand des Clients nach `SnapshotSchema`.
   * @returns {Promise<object>} Quittung nach `SnapshotAckSchema`.
   */
  writeSnapshot(snapshot) {
    // Fail-closed, aber an EINER Stelle: der Spiegel prueft den Vertrag, bevor er
    // das Medium anfasst (und wirft dabei). Das Gateway bildet den Wurf auf ein
    // Fehlerergebnis ab; der Client sieht `ok: false`, nicht eine stille Luege.
    return this.store.write(snapshot).then((stored) => SnapshotAckSchema.parse({
      storedAt: stored.storedAt,
      level: levelFor(stored.xp),
      xp: stored.xp,
    }));
  }

  /**
   * Den Aktivitaetsstand nennen: abgeschlossene Agent-Schritte und ob gerade
   * einer laeuft. Reine Primitiven aus dieser Realm — Typert serialisiert an der
   * Carrier-Grenze ohnehin, und ein fremder Prototyp wuerde abgelehnt.
   * @returns {object} nach `ActivitySchema`.
   */
  readActivity() {
    return ActivitySchema.parse({
      completions: Math.max(0, Math.floor(this.activity?.completions ?? 0)),
      running: this.activity?.running === true,
      at: new Date().toISOString(),
    });
  }
}

// Die Kennzeichnung gehoert an den Prototyp, bevor der erste Ruf ihn braucht.
markRemote(CodingmonRemote.prototype, UEBERGABE_METHOD);
markRemote(CodingmonRemote.prototype, UEBERGABE_ACTIVITY_METHOD);

/**
 * Den Empfaenger montieren. Der Aufrufer besitzt den Dienst mit seinem Fiber:
 * endet der Fiber, endet auch der Endpunkt — es gibt keinen zweiten Weg hinein.
 * @param {object} ctx - Cordis-Context des Hosts.
 * @param {object} store - offener Spiegel.
 * @param {object} activity - lebendiger Zaehler (`{ completions, running }`).
 * @returns {object} der Dienst (nur zur Sichtpruefung; der Aufrufer muss ihn nicht halten).
 */
export function mountPetRemote(ctx, store, activity) {
  return new CodingmonRemote(ctx, store, activity ?? { completions: 0, running: false });
}

/**
 * Der CLIENT-Beitrag: die generierte Form, die `ctx.remote.$mount(...)` erwartet
 * (`{ package, descriptors }`). Die Codecs sind der Grund, warum die Umwandlung
 * hier und nicht in `uebergabe.js` steht: `mode: 'strict'` mit einer
 * Schemafabrik ist die Form der generierten Beitraege, und das Client-Gateway
 * lehnt einen Beitrag mit einem Codec ohne strict VOR dem Mounten ab
 * („Client-supplied fields without strict generated codecs fail before methods
 * become callable"). Die Fabrik wird auf der Client-Seite nicht ausgefuehrt —
 * → Kanon: docs/COMMENT-KANON.md#k-4753c134ca3d
 */
export function petRemoteContribution() {
  return {
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
            codec: {
              mode: 'strict',
              typeSymbol: `${UEBERGABE_PACKAGE}#Snapshot`,
              create: () => SnapshotSchema,
            },
          },
        ],
        result: {
          mode: 'strict',
          typeSymbol: `${UEBERGABE_PACKAGE}#SnapshotAck`,
          create: () => SnapshotAckSchema,
        },
        sourceLocation: { file: 'packages/codingmon/assets/pet-remote.js', line: 1, column: 1 },
      },
      {
        id: `${UEBERGABE_PACKAGE}#${UEBERGABE_ACTIVITY_ENDPOINT}`,
        service: UEBERGABE_SERVICE,
        namespace: UEBERGABE_NAMESPACE,
        method: UEBERGABE_ACTIVITY_METHOD,
        invocation: { kind: 'direct' },
        parameters: [],
        result: {
          mode: 'strict',
          typeSymbol: `${UEBERGABE_PACKAGE}#Activity`,
          create: () => ActivitySchema,
        },
        sourceLocation: { file: 'packages/codingmon/assets/pet-remote.js', line: 1, column: 1 },
      },
    ],
  };
}
