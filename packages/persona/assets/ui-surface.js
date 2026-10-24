/**
 * ui-surface.js — die Flaeche der Persona nach aussen: Panel-Daten und Routen.
 *
 * Eigentuemer-Grenze (2026-10-23): hier steht NUR, wie der Zustand der Persona
 * zu einem HTTP-Global, einem Server-Sent-Event und drei Routen wird. Wer den
 * Zustand baut (Runtime, Zustandsmaschine) und wer ihn entscheidet (Review,
 * Beziehung), reicht ihn als Getter hinein — die Flaeche liest, sie schreibt
 * keinen fremden Zustand.
 *
 * Warum Getter statt Werte: der Host baut die Runtime NACH dieser Flaeche
 * (deren `publish` ist der `onChange` der Runtime) und den Beziehungs-Produzenten
 * ebenfalls danach. Ein Wert zum Bauzeitpunkt waere `undefined` — ein Getter
 * wird erst beim Aufruf ausgewertet, wenn beides steht.
 *
 * Die Vertragsnamen bleiben im Eintrag definiert und werden hier nur benutzt:
 * `scripts/gate/tests/persona-review-panel.test.mjs` und
 * `persona-ui-contract.test.mjs` lesen die Literale dort und den Snapshot hier.
 */

/** Einen JSON-Body lesen — gedeckelt, fail-closed, ohne den Request zu haengen. */
function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { resolve({ ok: false, error: 'BODY_TOO_LARGE' }); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ ok: false, error: 'INVALID_JSON' });
      }
    });
    req.on('error', () => resolve({ ok: false, error: 'BODY_UNREADABLE' }));
  });
}

/** Eine JSON-Antwort — ein Weg fuer alle schreibenden Routen. */
function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

/**
 * Die Flaeche bauen.
 *
 * `names` traegt die oeffentlichen Literale (Vertraege, Routen, Deckel) — sie
 * stehen im Eintrag, damit die Pin-Tests genau eine Quelle haben.
 */
export function createUiSurface({ names, contract, persona, runtime, root, tone, userMood, decision, relation, review, log }) {
  const uiClients = new Set();

  /** Der Zustandsdatensatz der UI — Zahlen und Namen, nie ein Prompt-Text. */
  const snapshot = () => {
    const here = root();
    // Selbstmodell, Erinnerungen und offene Vorschlaege kommen vom Eigentuemer
    // des Zustands — das Panel liest Zahlen, keine Prompt-Texte.
    const panel = runtime().panel(here);
    const state = persona.snapshot();
    const ton = tone();
    return {
      contract: names.uiContract,
      updatedAt: Date.now(),
      workspace: typeof here === 'string' && here !== '' ? here : null,
      state: {
        identity: state.identity,
        stance: state.stance,
        uncertainty: state.uncertainty,
        mood: state.mood,
        relation: state.relation,
        capabilities: [...state.capabilities],
        limitations: [...state.limitations],
      },
      userMood: userMood(),
      // Fuer das Panel: Stufen aus dem Vertrag (dieselbe Liste wie der Produzent), Stand aus dem Zustand.
      relation: { levels: [...(contract.relation?.levels ?? [])], current: state.relation },
      // Der KLANG kommt aus dem Vertrag: „Ruhig und bereit" ist das Panel-Etikett
      // zu „idle"; der Prompt traegt den Arbeitsmodus aus MOOD_MODUS, keinen Namen.
      voice: contract.voice?.[state.mood] ?? null,
      tone: ton === null ? null : { stance: ton.stance ?? null, ready: ton.ready === true },
      self: panel.self,
      memory: panel.memory,
      proposals: panel.proposals,
      intent: decision(),
    };
  };

  // ── Die Prüf-Naht: ansehen und ausdrücklich entscheiden ────────────────────
  // Kein Vorschlag wird hier angenommen, weil er plausibel klingt. `review()`
  // zeigt Belege, `decide()` ist der EINE Akt, der eine Selbstauflage erzeugt.
  const reviewService = {
    contract: names.reviewContract,
    review: () => ({
      contract: names.reviewContract,
      memory: runtime().panel(null).memory,
      // Begruendung und Quellenbezug gehoeren zur Anzeige: ein Vorschlag ohne
      // sie waere eine Behauptung, und der Mensch entscheidet ueber den Grund
      // mit. Sie fehlen bei aelteren Vorschlaegen — dann bleiben sie leer.
      proposals: (runtime().memory(null).proposals ?? []).map((proposal) => ({
        id: proposal.id,
        claim: proposal.claim,
        evidence: proposal.evidence,
        status: proposal.status,
        decidedAt: proposal.decidedAt,
        createdAt: proposal.createdAt ?? null,
        source: proposal.source ?? null,
        reason: proposal.reason ?? null,
        sources: Array.isArray(proposal.sources) ? [...proposal.sources] : [],
      })),
      commitments: review.accepted(runtime().memory(null)).map((proposal) => ({ id: proposal.id, claim: proposal.claim, evidence: proposal.evidence })),
    }),
    decide: (id, decisionValue) => {
      // Der Widerruf ist der dritte ausdrueckliche Akt, kein Sonderfall des
      // Ablehnens: angenommen ist angenommen, und nur der Eigentuemer nimmt
      // eine Auflage zurueck (der Kern fuehrt die Symmetrie).
      if (decisionValue === 'revoked') {
        const undone = runtime().revoke(id);
        if (undone.ok !== true) return { ok: false, error: undone.error ?? 'WIDERRUF_VERWEIGERT' };
        publish();
        log(`Auflage ${id} widerrufen`);
        return { ok: true, proposal: undone.proposal };
      }
      const now = new Date().toISOString();
      const result = review.decide(runtime().memory(now), id, decisionValue, now);
      if (!result.ok) return { ok: false, error: result.error };
      runtime().setMemory(result.memory);
      runtime().persistMemory();
      publish();
      log(`Vorschlag ${id} ${decisionValue === 'accepted' ? 'angenommen' : 'abgelehnt'}`);
      return { ok: true, proposal: result.proposal };
    },
  };

  /*
   * Die offenen Panels bekommen jede Aenderung sofort — sonst nur beim Laden.
   * Der Pruef-Stand reist als EIGENES Ereignis (`review`): das Zustands-Panel
   * liest weiter das unbenannte `data`, das Pruef-Panel haengt an `review` und
   * braucht keinen Abruf-Timer. Beide Ereignisse tragen JSON, nie Prompt-Text.
   */
  const reviewEvent = () => `event: review\ndata: ${JSON.stringify(reviewService.review())}\n\n`;
  const publish = () => {
    const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
    const stand = reviewEvent();
    for (const response of uiClients) {
      try {
        response.write(payload);
        response.write(stand);
      } catch {
        uiClients.delete(response);
      }
    }
  };

  const routeDisposers = [];
  const mount = (webCtx) => {
    const webServer = typeof webCtx?.get === 'function' ? webCtx.get('webServer') : undefined;
    if (typeof webServer?.register !== 'function') return;
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: names.uiRoute,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        // Der Startstand des Pruef-Panels kommt auf derselben Verbindung — ein
        // zweiter Kanal waere ein zweites Fenster auf denselben Zustand.
        res.write(reviewEvent());
        uiClients.add(res);
        req.on('close', () => uiClients.delete(res));
      },
    }));
    // Jede Entscheidung ist ein ausdruecklicher Akt: GET zeigt die Belege,
    // POST nimmt genau eine `accepted`/`rejected`-Entscheidung entgegen.
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: names.reviewRoute,
      handler: async (req, res) => {
        if (req.method === 'GET') { sendJson(res, 200, reviewService.review()); return; }
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
        const body = await readJsonBody(req, names.bodyLimit);
        if (!body.ok) { sendJson(res, 400, { ok: false, error: body.error }); return; }
        const id = typeof body.value?.id === 'string' ? body.value.id : '';
        const chosen = body.value?.decision;
        if (id === '' || (chosen !== 'accepted' && chosen !== 'rejected' && chosen !== 'revoked')) {
          sendJson(res, 400, { ok: false, error: 'INVALID_REQUEST' });
          return;
        }
        const result = reviewService.decide(id, chosen);
        sendJson(res, result.ok ? 200 : 409, result);
      },
    }));
    // Die Beziehungsstufe ist ein AUSDRUECKLICHER Akt des Menschen, kein
    // abgeleitetes Urteil: GET zeigt Stufen und Stand, POST setzt genau eine.
    // Der Handler emittiert das Signal; den Rest (Validierung, `relation.updated`)
    // machen Spine, Persona-Zustand und Narrative Engine.
    routeDisposers.push(webServer.register({
      kind: 'exact',
      path: names.relationRoute,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, {
            contract: names.relationContract,
            levels: relation().levels(),
            current: persona.snapshot().relation,
          });
          return;
        }
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
        const body = await readJsonBody(req, names.bodyLimit);
        if (!body.ok) { sendJson(res, 400, { ok: false, error: body.error }); return; }
        // Das Panel schickt nur die Stufe; die Sitzung ist die, in der die
        // Persona zuletzt gesehen wurde. Ein Aufrufer MIT Sitzung gewinnt.
        const result = relation().set({
          level: body.value?.level,
          sessionId: body.value?.sessionId || runtime().lastSessionId,
        });
        if (result.ok) publish();
        sendJson(res, result.ok ? 200 : 400, result);
      },
    }));
    // Die Routen haengen am Fiber, nicht am Prozess.
    webCtx.effect?.(() => () => {
      for (const dispose of routeDisposers.splice(0)) {
        try { dispose?.(); } catch { /* schon weg */ }
      }
    });
  };

  /** Beim Abbau: offene Panels schliessen, damit der Prozess nicht haengt. */
  const close = () => {
    for (const response of uiClients) { try { response.end(); } catch { /* weg */ } }
    uiClients.clear();
  };

  return { snapshot, publish, reviewEvent, reviewService, mount, close };
}
