    /**
     * Der Kampf im Dock (Gen-1): Gegner von vorn, eigenes von hinten — ECHTE
     * Sprites aus den Gittern, keine Familien-Platzhalter. Der HP-Balken
     * leert sich ueber die Breiten-Transition, der Treffer schuettelt ueber
     * einen Neuaufbau (`key` = HP: neues HP, neue Einblendung, Wackeln plus
     * Blinken). Ergebnis, Schaden und Log kommen aus `damage` — hier steht
     * nur, was der Zustand schon weiss.
     */
    function DockBattle({ s, lvl }) {
      const battle = s.battle;
      // Die Arena rechnet mit den EFFEKTIVEN Werten (mit Zuchtboni) — wie der
      // Kampf selbst und wie das Panel. Vorher stand hier die Basisleiter, und
      // der eigene Balken war kleiner als das, was der Kampf abzog.
      const mine = stats();
      const learned = abilitiesFor(lvl, s.species);
      const locked = s.lock !== null;
      const myTurn = battle.over === null && battle.turn === 'challenger';
      const eff = effectiveness(SPECIES[s.species].family, battle.element);
      const factor = String(eff.factor).replace('.', ',');
      return h('div', { className: '__cm_dock __cm_fight', 'data-plugin': PLUGIN },
        h(LockNotice, { s }),
        h('div', { className: '__cm_board' },
          h('div', { className: '__cm_side __cm_side--enemy' },
            h('span', {
              key: `enemy-${battle.hp}`,
              className: '__cm_hit',
              dangerouslySetInnerHTML: { __html: speciesSprite(battle.speciesId, 'front', 64) },
            }),
            h('div', { className: '__cm_side-id' },
              h('strong', null, `${SPECIES[battle.speciesId].label} L${battle.level}`),
              h(Bar, { value: battle.hp, max: battle.maxHp, tone: 'enemy' }),
              h('span', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, battle.hp))}/${formatNumber(battle.maxHp)}`))),
          h('span', { className: '__cm_vs' }, 'VS'),
          h('div', { className: '__cm_side __cm_side--own' },
            h('span', {
              key: `own-${s.hp}`,
              className: '__cm_hit',
              dangerouslySetInnerHTML: { __html: speciesSprite(s.species, 'back', 64) },
            }),
            h('div', { className: '__cm_side-id' },
              h('strong', null, `${s.name} L${lvl}`),
              h(Bar, { value: s.hp, max: mine.hp, tone: 'hp' }),
              h('span', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(mine.hp)}`))),
        ),
        h('p', { className: '__cm_sub' },
          `Wirkung ${ELEMENTS[SPECIES[s.species].family].label} → ${ELEMENTS[battle.element].label}: ×${factor} ${eff.symbol}`),
        h('div', { className: '__cm_actions' },
          learned.map((ability) => h('button', {
            key: ability.id,
            type: 'button',
            className: '__cm_move',
            disabled: locked || !myTurn,
            title: `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`,
            onClick: () => useAbility(ability.id),
          },
            h('span', { className: '__cm_move-name' }, ability.label),
            h('span', { className: '__cm_move-meta' }, `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`))),
        ),
        h('div', { className: '__cm_actions' },
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: locked || battle.over !== null,
            onClick: () => fleeBattle(),
          }, 'Rückzug'),
          h('span', { className: '__cm_sub' }, locked
            ? 'gesperrt — das Ergebnis kommt verzoegert'
            : (battle.turn === 'challenger' ? 'Du bist am Zug' : 'Gegner ist am Zug'))),
        h(TypeLine, { text: s.log[0] ?? '…' }),
      );
    }

    /**
     * Ball, Wurf und Wild im Dock: Der Ball (Shinon-Ball aus UI_SVG) fliegt
     * per CSS ein und verblasst, das Wilde blendet verzoegert ein — ohne einen
     * einzigen Timer im Zustand. Ein Klick fordert heraus, der zweite Knopf
     * laesst entkommen. Leerstand rendert nichts.
     */
    function WildDock() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      if (s.battle !== null) return h(DockBattle, { s, lvl });
      // Ein beginnender Zug hat noch keinen Kampf, aber eine Sperre — und die
      // ist sichtbar, nicht ein leeres Dock. Die Knoepfe stehen dabei, kalt
      // gesperrt: kein Klick wird eingereiht.
      if (s.lock !== null) {
        const learned = abilitiesFor(lvl, s.species);
        return h('div', { className: '__cm_dock __cm_fight', 'data-plugin': PLUGIN },
          h(LockNotice, { s }),
          h('div', { className: '__cm_actions' },
            learned.map((ability) => h('button', {
              key: ability.id,
              type: 'button',
              className: '__cm_move',
              disabled: true,
              title: 'Gesperrt — das Ergebnis kommt verzoegert',
              onClick: () => useAbility(ability.id),
            },
              h('span', { className: '__cm_move-name' }, ability.label),
              h('span', { className: '__cm_move-meta' }, `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`))),
          ));
      }
      if (s.wild === null) return null;
      const wild = s.wild;
      const label = SPECIES[wild.speciesId].label;
      return h('div', { className: '__cm_dock', 'data-plugin': PLUGIN },
        h('button', {
          type: 'button',
          className: '__cm_wild',
          title: `${label} L${wild.level} herausfordern`,
          onClick: () => challengeWild(),
        },
          h('span', { className: '__cm_ball', dangerouslySetInnerHTML: { __html: uiSvg('ball', 40) } }),
          h('span', { className: '__cm_wild-sprite', dangerouslySetInnerHTML: { __html: speciesSprite(wild.speciesId, 'front', 64) } }),
          h('span', { className: '__cm_sub' }, `Ein wilder ${label} L${wild.level} erscheint!`),
          h('span', { className: '__cm_sub' }, 'Klicken zum Kämpfen')),
        h('button', {
          type: 'button',
          className: '__cm_btn',
          onClick: () => fleeWild(),
        }, 'Fliehen'),
      );
    }

    /**
     * Das Kampfergebnis fuer `conversation.chat.turnTail`: eine Zeile je
     * beendeten Kampf, gelesen aus `lastResult`. Kein Kampf, keine Zeile.
     */
    function BattleResult() {
      const s = useStore();
      if (s.lastResult === null) return null;
      const result = s.lastResult;
      const label = SPECIES[result.speciesId].label;
      const text = result.outcome === 'win'
        ? `Sieg gegen ${label} L${result.level} — +${formatNumber(result.reward)} XP`
        : result.outcome === 'loss'
          ? `K.o. gegen ${label} L${result.level} — das Codemon rappelt sich wieder auf`
          : `Rückzug gegen ${label} L${result.level}`;
      return h('div', { className: '__cm_result', 'data-plugin': PLUGIN },
        h('span', { className: '__cm_result-mark', dangerouslySetInnerHTML: { __html: speciesGlyph(result.speciesId, result.level, 18) } }),
        h('span', null, text));
    }

