/**
 * branding-css.mjs — Eigentuemer: das ausgelieferte Vendor-CSS und seine Klassen.
 *
 * `scripts/branding-check.mjs` misst die WIRKUNG; dieses Modul beschafft den
 * GEGENSTAND. Es liest die echten CSS-Bloecke der gelieferten Bundles, findet die
 * gehashten Klassennamen und liefert die Zuordnung, gegen die die Mess-Seite baut.
 *
 * Warum getrennt (2026-10-23): der Eintrag war 660 Zeilen lang und trug zwei
 * Aufgaben — Beschaffung und Messung. Wer eine Regel sucht, fand sie zwischen
 * Mess-Code; wer eine Messung aendert, musste die Extraktion mitlesen.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * @param {object} options
 * @param {string} options.root  Repo-Wurzel (die Bundles liegen unter `node_modules/`)
 * @param {(problem: string) => never} options.fail  Abbruch mit Klartext
 */
export function readVendorStyles({ root, fail }) {
  const VENDOR = join(root, 'node_modules/@deepseek-ai');

  /**
   * Alle String-Literale einer Datei, exakt wie JS sie sieht (`vm` loest Escapes).
   * Templates mit `${…}` fallen raus — dort steht Code, kein CSS.
   */
  function stringLiterals(file) {
    const text = readFileSync(join(VENDOR, file), 'utf8');
    const out = [];
    const skipped = [];
    for (const match of text.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\[\s\S])*)`/g)) {
      const raw = match[0];
      if (raw.includes('${')) continue;
      try {
        out.push(vm.runInNewContext(raw));
      } catch (error) {
        // Nicht verschweigen: ein Literal, das hier scheitert, fehlt der Messung.
        skipped.push(`${raw.slice(0, 40)}… (${error.message.slice(0, 40)})`);
      }
    }
    return { literals: out, skipped };
  }

  /**
   * ALLE CSS-Bloecke einer Datei — nicht nur die zu einem Suchtoken (siehe unten): ein Modul kann
   * mehrere Strings haben (`const css = "…"` und `const css$1 = "…"`), und eine Regel
   * fuer `runningWhaleAnimated` steht in einer ANDEREN Zelle als der Klassenname daneben.
   * Was der Browser bekommt, ist die Summe — die Summe misst dieser Nachbau.
   */
  function cssBlocks(file) {
    const { literals, skipped } = stringLiterals(file);
    const blocks = literals.filter((value) => typeof value === 'string'
      && value.includes('{') && /\.[A-Za-z_-]/.test(value) && value.includes('}'));
    if (blocks.length === 0) {
      fail(`kein CSS-Block in ${file} — ${literals.length} Literale gelesen`
        + (skipped.length > 0 ? `, ${skipped.length} uebersprungen: ${skipped.slice(0, 2).join(' | ')}` : ''));
    }
    return { blocks, skipped, literalCount: literals.length };
  }

  /**
   * Den gehashten Klassennamen zu einem logischen Namen finden — im CSS SEINES Pakets,
   * ueber exakten Suffix mit Trenner davor (die Praefixe selbst enthalten `_`, z. B.
   * `pI_x6G_sidebarCol`, deshalb ist ein Split am ersten `_` falsch) und dem kuerzesten
   * Kandidaten (das ist die Klasse selbst, nicht ein laengerer Name mit gleichem Suffix).
   */
  function cls(name, css, owner) {
    const tokens = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
    const candidates = [...tokens]
      .filter((token) => token.endsWith(name) && token.length > name.length && /[_-]/.test(token[token.length - name.length - 1]))
      .sort((left, right) => left.length - right.length);
    if (candidates.length === 0) fail(`Klasse zu "${name}" steht nicht im CSS von ${owner}`);
    return candidates[0];
  }

  const chat = cssBlocks('dsh-client-ui-chat/lib/client.js');
  const hero = cssBlocks('dsh-client-ui-conversation/lib/client.js');
  const sidebar = cssBlocks('dsh-client-ui-sidebar/lib/client.js');
  const layout = cssBlocks('dsh-client-ui-layout/lib/client.js');

  const vendorCss = [...sidebar.blocks, ...hero.blocks, ...chat.blocks, ...layout.blocks].join('\n');
  // Die Wal-Maske ist ein APNG, ausgeliefert unter der Mediatype `image/png`.
  if (!/mask:url\(data:image\/png;base64,/.test(vendorCss)) {
    fail('die Wal-Maske (data:image/png, APNG) steht nicht mehr in diesem CSS — der Test misst dann die falsche Fassung');
  }
  const layoutCss = layout.blocks.join('\n');
  const sidebarCss = sidebar.blocks.join('\n');
  const heroCss = hero.blocks.join('\n');
  const chatCss = chat.blocks.join('\n');
  const C = {
    frame: cls('frame', layoutCss, 'ui-layout'),
    sidebarCol: cls('sidebarCol', layoutCss, 'ui-layout'),
    overlayLayer: cls('overlayLayer', layoutCss, 'ui-layout'),
    toggle: cls('toggle', sidebarCss, 'ui-sidebar'),
    railMark: cls('railMark', sidebarCss, 'ui-sidebar'),
    brandMark: cls('brandMark', sidebarCss, 'ui-sidebar'),
    brandIdentity: cls('brandIdentity', sidebarCss, 'ui-sidebar'),
    fishHitbox: cls('fishHitbox', heroCss, 'ui-conversation'),
    fish: cls('fish', heroCss, 'ui-conversation'),
    headline: cls('headline', heroCss, 'ui-conversation'),
    running: cls('running', chatCss, 'ui-chat'),
    runningIcon: cls('runningIcon', chatCss, 'ui-chat'),
    runningWhaleAnimated: cls('runningWhaleAnimated', chatCss, 'ui-chat'),
    runningWhaleStill: cls('runningWhaleStill', chatCss, 'ui-chat'),
  };

  // Die Zahlen, die der Bericht nennt: wie viele Bloecke je Paket eingehaengt sind
  // und wie viele Literale die Extraktion uebersprungen hat. Eine stille Null waere
  // hier fatal — sie saehe aus wie "kein CSS".
  const counts = {
    sidebar: sidebar.blocks.length,
    hero: hero.blocks.length,
    chat: chat.blocks.length,
    layout: layout.blocks.length,
    skipped: sidebar.skipped.length + hero.skipped.length + chat.skipped.length + layout.skipped.length,
  };

  return { vendorCss, C, counts };
}
