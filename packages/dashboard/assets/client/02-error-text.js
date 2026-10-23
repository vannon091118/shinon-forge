    /** Ein Projektionsfehler als Text: der Client-Dienst traegt code und message. */
    function errorText(error) {
      if (error === null || error === undefined) return '';
      const code = error.code ?? error.name;
      const message = error.message ?? String(error);
      return code === undefined ? message : `${code}: ${message}`;
    }

    /** Herkunft und Arbeitsverzeichnis einer Sitzung, so weit der Katalog sie kennt. */
    function originOf(row) {
      if (row === undefined) return 'nicht im Katalog';
      const origin = row.origin === 'subagent' ? 'Unteragent' : row.parentId === undefined ? 'Sitzung' : 'Abzweig';
      return row.cwd === undefined ? origin : `${origin} · ${row.cwd}`;
    }

    /** Eine Sitzungszeile: Name mit Zustandspunkt, Kennung, Herkunft, Marken. */
    function SessionRow({ id, row, pinned, archived }) {
      const marks = [];
      if (pinned.includes(id)) marks.push(badge('pin', 'angeheftet'));
      if (archived.includes(id)) marks.push(badge('arch', 'archiviert'));
      return h('tr', { className: 'shinon-ws__session' },
        h('td', null,
          h('span', { className: `shinon-ws__dot${row?.running === true ? ' shinon-ws__dot--live' : ''}` }),
          h('span', { className: 'shinon-ws__name' }, row?.displayTitle ?? row?.title ?? '(nicht im Katalog)'),
          ...marks),
        h('td', null, h('code', null, shortId(id))),
        h('td', null, h('span', { className: 'shinon-ws__origin' }, originOf(row))));
    }

    /** Die Sitzungstabelle eines Blocks: dieselbe Kopfzeile, dieselbe Zeile. */
    function SessionTable({ ids, byId, pinned, archived }) {
      return h('table', { className: 'shinon-plugins' },
        h('thead', null, h('tr', null,
          h('th', null, 'Sitzung'),
          h('th', null, 'Kennung'),
          h('th', null, 'Herkunft'))),
        h('tbody', null, ids.map((id) => h(SessionRow, { key: id, id, row: byId[id], pinned, archived }))));
    }

    /** Ein Workspace mit seinen zugeordneten Sitzungen und deren Marken. */
    function WorkspaceBlock({ item, byId, pinned, archived }) {
      const ids = item.sessionIds ?? [];
      const pinnedHere = ids.filter((id) => pinned.includes(id)).length;
      const archivedHere = ids.filter((id) => archived.includes(id)).length;
      return h('div', { className: 'shinon-ws__block' },
        h('div', { className: 'shinon-ws__head' },
          h('span', { className: 'shinon-ws__name' },
            item.title === '' || item.title === undefined ? '(ohne Namen)' : item.title),
          h('code', null, item.workspaceId),
          h('span', { className: 'shinon-ws__count' },
            `${ids.length} Sitzung${ids.length === 1 ? '' : 'en'}`
            + (pinnedHere === 0 ? '' : `, ${pinnedHere} angeheftet`)
            + (archivedHere === 0 ? '' : `, ${archivedHere} archiviert`))),
        h('code', { className: 'shinon-ws__path' }, item.path),
        ids.length === 0
          ? h('p', { className: 'shinon-ws__empty' }, 'keine Sitzung zugeordnet')
          : h(SessionTable, { ids, byId, pinned, archived }));
    }

    /**
     * Workspaces und Sitzungen: die Liste des Hosts, im Browser sichtbar.
     * Drei ehrliche Sonderfaelle statt einer stillen Luecke: kein Kanal, ein
     * Workspace ohne Sitzung und eine Sitzung ohne Workspace.
     */
    function WorkspaceSection() {
      const surfaces = useSurfaces();
      if (!surfaces.hasWorkspaces && !surfaces.hasSessions) {
        return h('section', { className: 'shinon-section' },
          h('h3', null, 'Workspaces und Sitzungen'),
          h('p', { className: 'shinon-dashboard__sub' },
            'Ohne Kanal: weder `workspaces` noch `sessions` ist in dieser Sitzung verbunden. Der Host haelt '
            + 'die Liste in ctx.workspaceRegistry (dsh-workspace); in den Browser bringt sie die '
            + 'Client-Haelfte von dsh-api-workspace-controller.'));
      }
      const accounted = new Set(surfaces.items.flatMap((item) => item.sessionIds ?? []));
      const catalogue = Object.keys(surfaces.byId);
      const orphans = catalogue.filter((id) => !accounted.has(id));
      const onlyMarked = [...new Set([...surfaces.pinned, ...surfaces.archived])]
        .filter((id) => surfaces.byId[id] === undefined && !accounted.has(id));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Workspaces und Sitzungen — ${surfaces.items.length} Workspaces, ${catalogue.length} Sitzungen`),
        h('p', { className: 'shinon-dashboard__sub' },
          'Gelesen aus den Client-Diensten `workspaces` (die Projektion von ctx.workspaceRegistry) und `sessions`. '
          + 'Nur Anzeige: dieses Panel legt keinen Workspace an, benennt nichts um und aendert keine Zuordnung.'
          + (surfaces.hasSessions ? '' : ' `sessions` fehlt — Sitzungen zeigen nur ihre Kennung.')
          + (surfaces.wsState === 'loading' ? ' Die Workspace-Projektion laedt noch.' : '')
          + (surfaces.wsError === null || surfaces.wsError === undefined
            ? '' : ` Projektionsfehler: ${errorText(surfaces.wsError)}.`)),
        surfaces.items.length === 0
          ? h('p', { className: 'shinon-ws__empty' }, 'Der Host meldet keinen Workspace.')
          : surfaces.items.map((item) => h(WorkspaceBlock, {
              key: item.workspaceId, item, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived,
            })),
        orphans.length === 0 ? null : h('div', { className: 'shinon-ws__block' },
          h('div', { className: 'shinon-ws__head' },
            h('span', { className: 'shinon-ws__name' }, 'Sitzungen ohne Workspace'),
            h('span', { className: 'shinon-ws__count' }, `${orphans.length} ohne Zuordnung`)),
          h(SessionTable, { ids: orphans, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived })),
        onlyMarked.length === 0 ? null : h('div', { className: 'shinon-ws__block' },
          h('div', { className: 'shinon-ws__head' },
            h('span', { className: 'shinon-ws__name' }, 'Nur im Anheft-/Archiv-Satz'),
            h('span', { className: 'shinon-ws__count' }, `${onlyMarked.length} nicht im Katalog`)),
          h(SessionTable, { ids: onlyMarked, byId: surfaces.byId, pinned: surfaces.pinned, archived: surfaces.archived })));
    }

    /** Die globale EXP-Leiste: dieselbe Zusage wie im Composer-Dock, gross. */
    function ExpSection() {
      const { pet } = usePet();
      if (pet === null) {
        return h('section', { className: 'shinon-section' },
          h('h3', null, 'Erfahrung'),
          h('p', { className: 'shinon-dashboard__sub' }, 'Kein Codemon geladen — @shinon/codingmon meldet keinen Zustand.'));
      }
      const next = 250 * pet.level * (pet.level + 1) / 2;
      const prev = 250 * (pet.level - 1) * pet.level / 2;
      const pct = Math.max(0, Math.min(100, Math.round(((pet.xp - prev) / Math.max(1, next - prev)) * 100)));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Erfahrung — Level ${pet.level}`),
        h('div', { className: 'shinon-exp' },
          h('span', { className: 'shinon-exp__lvl' }, `LV ${pet.level}`),
          h('span', { className: 'shinon-exp__track' },
            h('span', { className: 'shinon-exp__fill', style: { width: `${pct}%` } })),
          h('span', { className: 'shinon-exp__meta' }, `${pet.xp} / ${next} XP`)),
        h('p', { className: 'shinon-dashboard__sub' },
          `${pet.wins} Siege · ${pet.losses} K.o. · HP ${Math.max(0, pet.hp)}/${pet.stats.hp} · 1 XP pro Token, XP fuer Siege`));
    }

    /** Sichtbarkeit: jedes erwartete Plugin mit Zustand, plus alles Unerwartete. */
    function PluginSection() {
      const { map } = useRegistry();
      const live = EXPECTED.filter((entry) => entry.active && map.has(entry.id)).length;
      const silent = EXPECTED.filter((entry) => entry.active && !map.has(entry.id)).length;
      const extra = [...map.keys()].filter((id) => !EXPECTED.some((entry) => entry.id === id));
      return h('section', { className: 'shinon-section' },
        h('h3', null, `Plugin-Sichtbarkeit — ${live} laufen, ${silent} still`),
        h('table', { className: 'shinon-plugins' },
          h('thead', null, h('tr', null,
            h('th', null, 'Plugin'),
            h('th', null, 'Zustand'),
            h('th', null, 'Panel'))),
          h('tbody', null,
            EXPECTED.map((entry) => {
              const announced = map.get(entry.id);
              const state = !entry.active ? 'inactive' : (announced ? 'live' : 'silent');
              const text = state === 'inactive' ? 'inaktiv (nicht im Profil)' : state === 'live' ? 'laeuft' : 'STILL — nicht geladen';
              return h('tr', { key: entry.id },
                h('td', null, [
                  h('div', null, announced?.label ?? entry.label),
                  h('code', null, entry.id),
                ]),
                h('td', null, h('span', { className: `shinon-state shinon-state--${state}` },
                  h('span', { className: 'shinon-state__dot' }), text)),
                h('td', null, h('code', null, announced?.panel ?? (announced ? 'ohne Panel' : '—'))));
            }),
            extra.map((id) => h('tr', { key: id },
              h('td', null, [h('div', null, map.get(id)?.label ?? id), h('code', null, id)]),
              h('td', null, h('span', { className: 'shinon-state shinon-state--live' },
                h('span', { className: 'shinon-state__dot' }), 'laeuft (nicht erwartet)')),
              h('td', null, h('code', null, map.get(id)?.panel ?? 'ohne Panel')))))));
    }

    function DashboardPanel() {
      const { map } = useRegistry();
      const { pet } = usePet();
      const surfaces = useSurfaces();
      return h('div', { className: 'shinon-dashboard' },
        h('h2', null, 'Shinon Forge'),
        h('p', { className: 'shinon-dashboard__sub' }, 'Sichtbarkeit, Erfahrung und Zustand — was laeuft, steht hier.'),
        h('div', { className: 'shinon-dashboard__cards' },
          h(Card, { label: 'Angemeldet', value: `${map.size} / ${EXPECTED.filter((entry) => entry.active).length}` }),
          h(Card, { label: 'Codemon', value: pet === null ? '—' : `${pet.species} · L${pet.level}` }),
          h(Card, { label: 'Siege', value: pet === null ? '—' : String(pet.wins) }),
          h(Card, { label: 'Workspaces', value: surfaces.hasWorkspaces ? String(surfaces.items.length) : '—' }),
          h(Card, { label: 'Sitzungen', value: surfaces.hasSessions ? String(Object.keys(surfaces.byId).length) : '—' })),
        h(ExpSection),
        h(WorkspaceSection),
        h(PluginSection));
    }

