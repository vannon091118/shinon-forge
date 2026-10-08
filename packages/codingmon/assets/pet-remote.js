/**
 * pet-remote — die Host-Haelfte der Uebergabe (Client -> Host).
 *
 * WARUM ES DIESE DATEI GIBT: `pet-store.js` legt den Stand dauerhaft ab, aber
 * ein Speicher ohne Absender ist ein leeres Blatt: bis hierher hat NICHTS im
 * Baum je `write` gerufen, und der Spiegel meldete folgerichtig „noch kein
 * Stand". Diese Datei ist der Empfaenger. Sie ist die Host-Seite des
 * Typert-RPC von DSH (api-gateway): ein Cordis-Dienst mit EINER als Remote
 * gekennzeichneten Methode, von der der Client einen generierten Beitrag
 * mountet und sie ueber den gemeinsamen Carrier ruft.
 *
 * WARUM SRC UND NICHT EIN GENERIERTES HOST-MANIFEST: das Gateway loest einen
 * Endpunkt zuerst aus `ctx.typert.local` (strenge, GENERIERTE Definition) und
 * sonst aus dem Dienst selbst auf („SRC": Name, Parameterliste und
 * `typertRemote`-Bindung des Dienstes). Die zweite Form ist die ehrliche fuer
 * dieses Paket: die strict-Datei ist ein Erzeugnis von
 * `@deepseek-ai/dsh-typert-generator`, den dieses Paket nicht mitbringt, und
 * eine von Hand nachgebaute „generierte" Datei waere eine Fiktion mit
 * Dateinamen. SRC verlangt dafuer weniger: oeffentliche Methode mit einfachen
 * ParameterNamen (das Gateway liest sie aus der Signatur — deshalb steht
 * `writeSnapshot(snapshot)` genau so da und mit einem Parameter, nicht mit
 * einem Objekt), JSON-sichere Werte, und die Bindung aus `TypertRemoteService`.
 * Was SRC NICHT tut, ist den Inhalt pruefen — deshalb prueft der SPIEGEL
 * (`pet-store.js` parst, BEVOR er ein Medium anfasst). GENAU EINE Grenze: eine
 * zweite Pruefung desselben Schemas hier waere eine zweite Wahrheit, und im
 * Test nicht auseinanderzuhalten, weil beide dieselbe Meldung erzeugen.
 *
 * WAS HIER NICHT STEHT: kein Timer, kein Netz, kein Modell, und keine zweite
 * Ablage. Die Methode nimmt einen Stand an, prueft ihn, gibt ihn an den Spiegel
 * weiter und quittiert ihn.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { levelFor } from './mechanik.js';
import { SnapshotAckSchema } from './snapshot-schema.js';
import {
  UEBERGABE_ENDPOINT, UEBERGABE_METHOD, UEBERGABE_NAMESPACE, UEBERGABE_PACKAGE,
  UEBERGABE_PARAMETER, UEBERGABE_SERVICE,
} from './uebergabe.js';

/**
 * Eine oeffentliche Methode als Remote-Endpunkt kennzeichnen — ohne
 * Build-Schritt.
 *
 * `Remote` aus `dsh-typert-protocol` ist die oeffentliche Fassung der
 * Standard-Methodendekoratoren: sie bekommt den Methodenwert und einen
 * Dekoratorkontext und traegt die Kennzeichnung ueber dessen `addInitializer`
 * in die Prototyp-Tabelle ein (die kompilierte DSH-Fassung desselben Aufrufs
 * steht in jedem `lib/types/index.js` der DSH-Pakete). Ein ESM-Modul ohne
 * Compiler hat keinen solchen Kontext — also stellt der Aufruf unten genau den
 * Vertrag her, den die Spezifikation vorsieht: ein Empfaengerobjekt, dessen
 * Prototyp die Klasse ist, an dem der Initialisierer laeuft. Mehr braucht die
 * Kennzeichnung nicht; sie ist idempotent und haengt am Prototyp, nicht an
 * einer Instanz.
 * @param {object} prototype - Prototyp der Dienstklasse.
 * @param {string} method - Name der oeffentlichen Methode.
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
   */
  constructor(ctx, store) {
    // Der Dienstschluessel und der WIRE-Namespace sind zwei Dinge: Cordis kennt
    // den Dienst unter `codingmonRemote`, der Endpunkt heisst aber
    // `codingmon/writeSnapshot`. Ohne die zweite Angabe waere der Namespace der
    // Dienstschluessel, das Gateway faende den Endpunkt nicht (`claimsEndpoint`
    // vergleicht den Namespace der Bindung) und der Aufruf liefe ins Leere.
    super(ctx, UEBERGABE_SERVICE, { namespace: UEBERGABE_NAMESPACE });
    this.store = store;
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
}

// Die Kennzeichnung gehoert an den Prototyp, bevor der erste Ruf ihn braucht.
markRemote(CodingmonRemote.prototype, UEBERGABE_METHOD);

/**
 * Den Empfaenger montieren. Der Aufrufer besitzt den Dienst mit seinem Fiber:
 * endet der Fiber, endet auch der Endpunkt — es gibt keinen zweiten Weg hinein.
 * @param {object} ctx - Cordis-Context des Hosts.
 * @param {object} store - offener Spiegel.
 * @returns {object} der Dienst (nur zur Sichtpruefung; der Aufrufer muss ihn nicht halten).
 */
export function mountPetRemote(ctx, store) {
  return new CodingmonRemote(ctx, store);
}

/**
 * Der CLIENT-Beitrag: die generierte Form, die `ctx.remote.$mount(...)` erwartet
 * (`{ package, descriptors }`). Die Codecs sind der Grund, warum die Umwandlung
 * hier und nicht in `uebergabe.js` steht: `mode: 'strict'` mit einer
 * Schemafabrik ist die Form der generierten Beitraege, und das Client-Gateway
 * lehnt einen Beitrag mit einem Codec ohne strict VOR dem Mounten ab
 * („Client-supplied fields without strict generated codecs fail before methods
 * become callable"). Die Fabrik wird auf der Client-Seite nicht ausgefuehrt —
 * der Client schickt die Werte, der Host prueft sie.
 * @returns {object} Beitrag aus Paketname und einem Endpunkt.
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
    ],
  };
}
