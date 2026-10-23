    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/popup';
    const PANEL_ID = 'shinon-popup';
    /** Derselbe Slot wie die Vorgabe des Host-Schemas (packages/popup/index.js). */
    const DOCK_SLOT = 'conversation.composer.dock';
    const OVERLAY_ID = 'shinon-popup-progress';
    /**
     * Derselbe Fensterspiegel, den das Prompter-Panel liest — KEIN zweiter Kanal.
     * Der Prompter-Host schreibt ihn (in-process) und der Prompter-Client pflegt
     * ihn aus SSE; hier wird nur gelesen. Der Name ist ein Literal (ein
     * Client-Bundle kann den Host nicht importieren) und wird von
     * `scripts/gate/tests/abort-trace.test.mjs` gegen die Host-Konstante geprüft.
     */
    const TRACE_GLOBAL = '__shinonPrompterTrace';

    /** Sichtbarkeit (Schritt 1): meldet dieses Bundle bei der System-Uebersicht an. */
    const LABEL = 'Shinon Popup';

    function announce(detail) {
      const registry = (window.__shinonPlugins ??= new Map());
      registry.set(PLUGIN, { label: LABEL, kind: 'client', panel: PANEL_ID, detail });
      window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
    }

