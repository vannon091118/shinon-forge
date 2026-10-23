    /**
     * ── Uebergabe (Client -> Host) ─────────────────────────────────────────
     * Der Stand liegt in `localStorage` und haengt damit am BROWSER-Profil; der
     * Host haelt daneben einen dauerhaften Spiegel (`assets/pet-store.js`).
     * Diese Funktion ist der ABSENDER und wirft nie, wartet nie, aendert nie
     * den Spielstand: ohne Kanal bleibt alles wie vorher, und der Zustand merkt
     * sich die Absage. Die Namen sind LITERAL (das Bundle kann nichts aus
     * `assets/` laden); Quelle ist `assets/uebergabe.js` und
     * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen.
     */
    const HOST_NAMESPACE = 'codingmon';
    const HOST_METHOD = 'writeSnapshot';
    const HOST_ACTIVITY_METHOD = 'readActivity';
    const HOST_PARAMETER = 'snapshot';
    const HOST_SERVICE = 'codingmonRemote';
    const strict = (type) => ({ mode: 'strict', typeSymbol: `${PLUGIN}#${type}`, create: () => null });
    /** Der eigene Remote-Beitrag (Form: `assets/uebergabe.js`; der Browser kennt nur seine Liste). */
    const CONTRIBUTION = { package: PLUGIN, descriptors: [
      { id: `${PLUGIN}#${HOST_NAMESPACE}/${HOST_METHOD}`, service: HOST_SERVICE, namespace: HOST_NAMESPACE, method: HOST_METHOD, invocation: { kind: 'direct' }, parameters: [{ name: HOST_PARAMETER, wire: HOST_PARAMETER, source: 'json', codec: strict('Snapshot') }], result: strict('SnapshotAck') },
      { id: `${PLUGIN}#${HOST_NAMESPACE}/${HOST_ACTIVITY_METHOD}`, service: HOST_SERVICE, namespace: HOST_NAMESPACE, method: HOST_ACTIVITY_METHOD, invocation: { kind: 'direct' }, parameters: [], result: strict('Activity') },
    ] };
    let clientCtx = null;
    let hostMirror = { sent: 0, lastAt: null, lastLevel: null, error: null, reason: 'kein Kanal' };

    /** Den Namensraum des Beitrags finden — als Cordis-Dienst `remote.<namespace>`. */
    function hostNamespace() {
      const remote = clientCtx?.remote;
      if (remote === null || remote === undefined) return null;
      const viaCtx = typeof clientCtx.get === 'function' ? clientCtx.get(`remote.${HOST_NAMESPACE}`) : undefined;
      return viaCtx ?? remote[HOST_NAMESPACE] ?? null;
    }

    function toHost() {
      if (mutationBatchDepth > 0) { pendingHostSnapshot = true; return true; }
      return sendSnapshotNow();
    }
    function sendSnapshotNow() {
      try {
        const namespace = hostNamespace();
        const send = namespace?.[HOST_METHOD];
        if (typeof send !== 'function') {
          hostMirror = { ...hostMirror, reason: 'kein Kanal' };
          return false;
        }
        const snapshot = {
          schemaVersion: STORE_VERSION,
          species: store.species,
          xp: Math.floor(store.xp),
          wins: store.wins,
          losses: store.losses,
          round: store.round,
          damageTotal: store.damageTotal.toString(),
          hits: store.hits,
          loot: { ...store.loot },
          savedAt: new Date().toISOString(),
          completions: Math.max(0, Math.floor(store.completions)),
          wild: store.wild === null ? null : {
            speciesId: store.wild.speciesId,
            level: store.wild.level,
            hp: store.wild.hp,
            maxHp: store.wild.maxHp,
          },
          breeding: store.breeding,
        };
        // Die Methode liefert ein RemoteResult: { ok: true, value } oder
        // { ok: false, error }. Der Fehlerzweig ist ein ERGEBNIS, kein Wurf —
        // ein abwesender oder ablehnender Host darf das Spiel nicht anhalten.
        Promise.resolve(send(snapshot)).then(
          (result) => {
            if (result?.ok === true) {
              hostMirror = {
                sent: hostMirror.sent + 1,
                lastAt: result.value?.storedAt ?? null,
                lastLevel: result.value?.level ?? null,
                error: null,
                reason: 'gespiegelt',
              };
            } else {
              hostMirror = { ...hostMirror, error: result?.error?.message ?? 'abgelehnt', reason: 'abgelehnt' };
            }
          },
          (error) => { hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' }; },
        );
        return true;
      } catch (error) {
        hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' };
        return false;
      }
    }
    const note = (text) => {
      store.log = [`${new Date().toLocaleTimeString('de-DE')}  ${text}`, ...store.log].slice(0, 40);
    };

    const level = () => levelFor(store.xp);
    const stats = () => effectiveStatsFor(store.species, level(), activeCreature());
    const maxHp = () => stats().hp;

    /**
     * Der Praesentationszustand — ABGELEITET aus dem Zustand, nie gesetzt.
     *
     * `idle`    kein Kampf, keine Sperre: der Sprite darf wandern.
     * `combat`  ein Kampf steht offen, es ist nichts in Arbeit.
     * `action`  der Zug laeuft (die Sperre steht): etwas wird getan.
     * `victory` / `defeat` / `flee`  das Ergebnis ist gerade gefallen.
     *
     * Die REIHENFOLGE ist die Aussage: die Sperre zuerst. Waehrend eines
     * Zuges steht die Sperre, und der Kampf steht waehrenddessen oft noch
     * nicht einmal offen (der Gegner wird erst im Zug aufgestellt). Ohne
     * diese Reihenfolge stuende die Figur im wichtigsten Moment als "idle"
     * da und liefe spazieren, waehrend gespielt wird.
     *
     * Zwei Regeln, die das Timing betreffen und nicht das Ergebnis: der
     * Praesentationszustand aendert NICHTS an HP, XP, Beute oder Skillstatus —
     * die Mechanik steht in `finish()`, und die steht nicht in einer Animation.
     * Und der Endzustand ist ein Fenster, kein Zustand: nach 1,6 Sekunden
     * faellt er auf `idle` zurueck, damit eine alte Schlacht nicht ewig als
     * Sieg herumsteht.
     */
    const PRESENTATION_WINDOW_MS = 1600;
    function presentationState(s, now = Date.now()) {
      if (s.lock !== null) return 'action';
      if (s.battle !== null) return 'combat';
      const result = s.lastResult;
      if (result && Number.isFinite(result.at) && now - result.at < PRESENTATION_WINDOW_MS) {
        if (result.outcome === 'win') return 'victory';
        if (result.outcome === 'flee') return 'flee';
        return 'defeat';
      }
      return 'idle';
    }

    // XP stammen ausschliesslich aus erfolgreichen Host-Completions; Tokens
    // werden weder aus dem DOM gelesen noch als Fortschritt interpretiert.

    /**
     * Einen Meilenstein feiern — aber nur, wenn wirklich eine Stelle dazukommt.
     * `kind` trennt, WELCHER Wert gewachsen ist (Lebenslauf, Einzeltreffer, XP,
     * Beute), damit die Anzeige nicht alles in einen Topf wirft.
     */
    function celebrate(kind, before, after, label) {
      const mark = milestoneFor(before, after);
      if (mark === null) return null;
      const digits = digitsOf(after);
      store.milestones = [{ at: Date.now(), kind, mark, value: exactText(after), digits, label }, ...store.milestones].slice(0, 20);
      note(`MEILENSTEIN ${formatNumber(mark)}+ (${kind}) — ${label}: ${formatNumber(after)} (${digits} Stellen)`);
      return mark;
    }

    function award(xp, reason) {
      const before = level();
      const xpBefore = store.xp;
      store.xp += Math.max(0, Math.round(xp));
      store.digits = Math.max(store.digits, digitsOf(store.xp));
      const after = level();
      if (after > before) {
        const learned = abilitiesFor(after, store.species)
          .filter((ability) => ability.minLevel > before);
        store.hp = stats().hp;
        note(`LEVEL ${after} — ${formOf(after).label}!${learned.length ? ` Gelernt: ${learned.map((a) => a.label).join(', ')}` : ''}`);
      } else if (reason) {
        note(reason);
      }
      celebrate('xp', xpBefore, store.xp, `Level ${after}`);
      persist();
      emit();
    }

    function readActivity() {
      try {
        const namespace = hostNamespace();
        const read = namespace?.[HOST_ACTIVITY_METHOD];
        if (typeof read !== 'function') return;
        Promise.resolve(read()).then((result) => {
          if (result?.ok !== true || !Number.isInteger(result.value?.completions)) return;
          const total = Math.max(0, result.value.completions);
          const gained = Math.max(0, total - store.completions);
          if (gained === 0) return;
          withMutationBatch(() => {
            store.completions = total;
            store.localSteps = total;
            advanceBreedingCompletions(total);
            award(gained, null);
            checkSpawn();
            persist();
            toHost();
            emit();
          });
        }).catch(() => {});
      } catch { /* ohne Remote-Beitrag bleibt der Spielstand unveraendert */ }
    }

