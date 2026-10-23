    // ── Completion-Spawn und Herausforderung ──────────────────────────────
    /**
     * Die Spawn-Pruefung: deterministisch aus (`localSteps`, Stufe). Gibt es
     * ein Wild, steht kein anderes, laeuft kein Kampf und ist dieser Stand
     * noch nicht verbraucht, faellt der Ball. Reine Auswertung plus EIN
     * Schreibvorgang — dieselbe Funktion treibt der Takt wie der Hand-Trigger.
     */
    function checkSpawn() {
      const wild = spawnFor(store.localSteps, level());
      if (wild === null || store.localSteps <= store.spawnedAt) return null;
      if (store.wild !== null || store.battle !== null || store.lock !== null) return null;
      const stats = statsAt(wild.speciesId, wild.level);
      store.wild = { speciesId: wild.speciesId, level: wild.level, hp: stats.hp, maxHp: stats.hp };
      store.spawnedAt = store.localSteps;
      note(`Ein wilder ${SPECIES[wild.speciesId].label} L${wild.level} erscheint!`);
      persist();
      toHost();
      emit();
      return { ...store.wild };
    }

    /**
     * Die Herausforderung: ein Klick auf das Wild oeffnet den Kampf — als Zug
     * ueber die bestehende Sperre (`beginTurn('start', …)`), mit derselben
     * verzoegerten Eroeffnung wie `startBattle`. Der Ball ist verbraucht,
     * sobald der Zug steht.
     */
    function challengeWild() {
      if (store.wild === null || store.battle !== null) return null;
      if (!guard('challenge')) return null;
      const wild = store.wild;
      const stats = statsAt(wild.speciesId, wild.level);
      const arena = {
        speciesId: wild.speciesId,
        element: SPECIES[wild.speciesId].family,
        level: wild.level,
        stats,
        reward: rewardFor(wild.level),
        source: 'wild',
      };
      const lock = beginTurn('start', { arena });
      if (lock === null) return null;
      store.wild = null;
      store.round += 1;
      note(`Du forderst ${SPECIES[wild.speciesId].label} L${wild.level} heraus!`);
      persist();
      return { locked: true, until: lock.until, arena };
    }

    /** Flucht vor dem Wilden: der Ball bleibt aus, bis der Zaehler weitergeht. */
    function fleeWild() {
      if (store.wild === null || store.battle !== null || store.lock !== null) return null;
      const wild = store.wild;
      store.wild = null;
      note(`${SPECIES[wild.speciesId].label} entkommt — der Wald ist wieder still`);
      persist();
      emit();
      return { fled: wild.speciesId };
    }

    /**
     * Rueckzug aus dem Kampf (J4): abbrechbar, sobald der Agent fertig ist —
     * und davor. Kein Sieg, keine Niederlage, volle HP. Nur ausserhalb eines
     * laufenden Zuges.
     */
    function fleeBattle() {
      const battle = store.battle;
      if (battle === null || battle.over !== null || store.lock !== null) return null;
      store.battle = null;
      store.hp = maxHp();
      store.lastResult = { outcome: 'flee', speciesId: battle.speciesId, level: battle.level, reward: 0, at: Date.now() };
      note(`Rueckzug gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      persist();
      emit();
      return { fled: battle.speciesId };
    }

    // ── 3. PACING: der Zug sperrt den Zustand ───────────────────────────────
    /** Rundendauer aus dem Vertrag; eine kaputte Zahl wird zu 0, nicht zu NaN. */
    const roundDelay = () => Math.max(0, Number(roundDelayMs) || 0);
    /** Timer je Zug. Ausserhalb des Zustands, weil ein Handle nicht auf die Platte gehoert. */
    const timers = new Map();

    /**
     * Ein Input WAEHREND der Sperre wird kalt abgewiesen, nicht eingereiht und
     * nicht verrechnet. Das ist die eine Stelle, die die Luecke schliesst: wer
     * zehnmal klickt, bekommt neun Absagen und genau ein Ergebnis.
     */
    function guard(action) {
      if (store.lock === null) return true;
      store.rejections += 1;
      note(`${PACING.lockedText} (abgewiesen: ${action})`);
      persist();
      emit();
      return false;
    }

    /**
     * Einen Zug beginnen: SYNCHRON, in derselben Millisekunde wie der Klick,
     * wird der Schnappschuss eingefroren, den das Ergebnis benutzen darf — und
     * erst danach wird gewartet. Diese Reihenfolge ist der ganze Punkt: waere
     * die Sperre erst nach dem `await` gesetzt, koennte ein zweiter Klick im
     * selben Tick ein zweites Ergebnis buchen (Race Condition). Der eingefrorene
     * Stand ist die EINZIGE Quelle des Ergebnisses; was der Nutzer waehrend der
     * Wartezeit sieht, ist die Wartezeit selbst.
     */
    function beginTurn(action, payload) {
      if (!guard(action)) return null;
      const now = Date.now();
      const lock = {
        id: `${now}-${store.round}-${store.hits}-${action}`,
        action,
        payload,
        at: now,
        until: now + roundDelay(),
        frozen: {
          level: level(),
          species: store.species,
          hp: store.hp,
          stats: stats(),
          inherited: inheritedAbilities(store.species),
          battle: store.battle === null ? null : { ...store.battle, stats: { ...store.battle.stats } },
        },
      };
      store.lock = lock;
      persist();
      emit();
      timers.set(lock.id, window.setTimeout(() => settle(lock.id), roundDelay()));
      return lock;
    }

    /**
     * Das Ergebnis ausspielen. Der Timer prueft ZUERST seine Kennung: ein Zug,
     * der schon ersetzt wurde, darf nicht mehr schreiben (sonst wuerde ein
     * spaeter Zuendender den aktuellen Kampf ueberschreiben). Alles Folgende
     * laeuft in einem Block — waehrend der Sperre konnte nichts anderes den
     * Zustand bewegen.
     */
    function settle(lockId) {
      const timer = timers.get(lockId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(lockId);
      }
      const lock = store.lock;
      if (lock === null || lock.id !== lockId) return null;
      const { frozen, action, payload } = lock;
      store.lock = null;
      const result = action === 'start' ? openBattle(frozen, payload) : action === 'use' ? strike(frozen, payload) : null;
      persist();
      // Jeder BEENDETE Zug geht an den Host — nicht jeder Klick: die Sperre hat
      // den Zug schon auf einen Ausgang festgelegt, und ein Zwischenstand waere
      // ein Stand, den der Client selbst nie hatte.
      toHost();
      emit();
      return result;
    }

    /** Der Zug, wie ihn der Client nach aussen meldet (fuer Proben und Anzeige). */
    const lockStatus = () => (store.lock === null ? null : { ...store.lock.frozen, id: store.lock.id, action: store.lock.action, until: store.lock.until });

    // ── 1./2. Arena: ein Klick = ein Zug, Ergebnis verzoegert ───────────────
    /**
     * Den Treffer buchen: der Lebenslauf waechst als BigInt, Einzeltreffer und
     * Stellenzahl werden nachgezogen, und ein Stellensprung wird gefeiert.
     * Alle Ausgaben sind formatiert — der Sprung von zwei- auf fuenfstellig ist
     * die Aussage, nicht die Animation.
     */
    function bookHit(dealt, label) {
      const before = store.damageTotal;
      const peakBefore = store.peakHit;
      store.damageTotal += BigInt(Math.max(0, Math.round(dealt)));
      store.hits += 1;
      if (dealt > store.peakHit) store.peakHit = dealt;
      store.digits = Math.max(store.digits, digitsOf(store.damageTotal));
      celebrate('lebenslauf', before, store.damageTotal, label);
      celebrate('treffer', peakBefore, store.peakHit, label);
    }

    /** Einen Gegner stellen — als Zug, nicht sofort. */
    function startBattle() {
      if (store.battle !== null) return store.battle;
      const arena = arenaFor(level(), store.round);
      const lock = beginTurn('start', { arena });
      if (lock === null) return null;
      store.round += 1;
      persist();
      return { locked: true, until: lock.until, arena };
    }

