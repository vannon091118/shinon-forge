    /**
     * Die Sitzungs-Bindung der gezeigten Sitzung. Fehhlt ein Dienst, fehlt die
     * Bindung — dann schweigt die Anzeige, sie wirft nicht (fail-open).
     */
    function seamOf(ctx) {
      if (ctx === null || ctx === undefined) return undefined;
      const shown = ctx.get?.('uiSession')?.adapter?.current?.getSnapshot?.();
      const sessionId = shown?.key ?? shown?.props?.sessionId;
      if (sessionId === undefined) return undefined;
      return ctx.get?.('sessions')?.binding?.(sessionId);
    }

    let violations = 0;
    /** Einmaliges Melden statt pro Render — Verstöße stören nie, sie werden gezählt. */
    const complain = (where, error) => {
      violations += 1;
      if (violations <= 3) {
        console.warn(`[shinon-traceability] ${where} nicht lesbar (${error?.message ?? error}) — Toats schweigen (${violations})`);
      }
    };

    function readToastsOf(ctx, maxVisible) {
      try {
        return foldToasts(seamOf(ctx)?.eventSource?.getSnapshot?.()?.entries, maxVisible);
      } catch (error) {
        complain('Ereignisfenster', error);
        return [];
      }
    }

    /**
     * Meldet jede Änderung: neuer Eintrag (das Fenster wächst) und
     * Sitzungswechsel (dann hängt das Abo an anderer Bindung).
     */
    function subscribeToastsOf(ctx, listener) {
      try {
        let stopWindow = () => {};
        const attachWindow = () => {
          stopWindow();
          stopWindow = () => {};
          const source = seamOf(ctx)?.eventSource;
          if (typeof source?.subscribe === 'function') {
            const off = source.subscribe(listener);
            stopWindow = () => off?.();
          }
        };
        attachWindow();
        const shown = ctx?.get?.('uiSession')?.adapter?.current;
        const stopShown =
          typeof shown?.subscribe === 'function' ? shown.subscribe(() => { attachWindow(); listener(); }) : () => {};
        return () => {
          stopShown();
          stopWindow();
        };
      } catch (error) {
        complain('Abo des Ereignisfensters', error);
        return () => {};
      }
    }

    /**
     * In `apply()` an den echten ctx gebunden; vorher liest die Anzeige nichts.
     * Ohne diese Bindung ist `ctx` undefined — gemessen: der Lespfad wirft dann
     * `TypeError: Cannot read properties of undefined (reading 'get')`.
     */
    let readToasts = () => [];
    let subscribeToasts = () => () => {};

    function useToasts() {
      const [, setRevision] = React.useState(0);
      const toasts = readToasts();
      React.useEffect(() => subscribeToasts(() => setRevision((value) => value + 1)), []);
      return toasts;
    }

    /** Farbe je Ton — Präsentation bleibt hier, der Kern kennt nur Wörter als Ton. */
    const TONE_COLOR = {
      warn: 'var(--dsw-alias-state-warn-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
    };

    /** Icon je Toast-Art. */
    function ToastIcon({ kind }) {
      switch (kind) {
        case 'tool-call':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M8 1l2 5h-4L8 1z', fill: 'currentColor' }),
            h('path', { d: 'M8 15l-2-5h4l-2 5z', fill: 'currentColor' }),
            h('path', { d: 'M1 8l5-2v4L1 8z', fill: 'currentColor' }),
            h('path', { d: 'M15 8l-5 2V6l5 2z', fill: 'currentColor' }),
          );
        case 'tool-result':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M2 8l4 4 8-8', stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          );
        case 'step':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('circle', { cx: '8', cy: '8', r: '6', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }),
            h('path', { d: 'M8 4v4l3 2', stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }),
          );
        case 'error':
          return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
            h('path', { d: 'M8 3l5 9H3L8 3z', fill: 'currentColor', opacity: 0.8 }),
            h('line', { x1: 8, y1: 7, x2: 8, y2: 10, stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.5 }),
            h('circle', { cx: 8, cy: 11.5, r: 1, fill: 'var(--dsw-alias-bg-base)' }),
          );
        default:
          return null;
      }
    }

    /** Ein einzelner Toast mit Ein-/Ausblend-Animation. */
    function ToastItem({ toast, index }) {
      const [visible, setVisible] = React.useState(false);
      const [removing, setRemoving] = React.useState(false);
      const duration = settings.duration;

      React.useEffect(() => {
        const stagger = Math.min(30 * index, 150);
        const t1 = setTimeout(() => setVisible(true), stagger);
        const t2 = setTimeout(() => setRemoving(true), duration);
        const t3 = setTimeout(() => setVisible(false), duration + 300);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }, [index, duration]);

      if (!visible) return null;

      const color = TONE_COLOR[toast.tone] ?? TONE_COLOR.muted;
      return h('div', {
        className: `shinon-trace-toast ${removing ? 'shinon-trace-toast--out' : 'shinon-trace-toast--in'}`,
        role: 'status',
        'aria-live': 'polite',
        style: { '--toast-color': color },
      },
        h('div', { className: 'shinon-trace-toast__icon' }, h(ToastIcon, { kind: toast.kind })),
        h('div', { className: 'shinon-trace-toast__body' },
          h('div', { className: 'shinon-trace-toast__title' }, fill(t(toast.key), toast.values)),
          toast.kind === 'tool-call' && toast.values.id
            ? h('div', { className: 'shinon-trace-toast__message' }, String(toast.values.id))
            : null,
        ),
        h('div', { className: 'shinon-trace-toast__time' },
          toast.ts
            ? new Date(toast.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '',
        ),
      );
    }

    /** Stapel aller sichtbaren Toats — frame-weit unten rechts (Slot `shell.overlay`). */
    function ToastStack() {
      // Hooks IMMER zuerst, bedingungslos: `useToasts` trägt das Abo und den
      // Revisionszähler — ohne den Ruf bliebe die Liste beim ersten Rendern
      // stehen und jedes neue Ereignis unsichtbar (gemessen im Harness).
      const toasts = useToasts();
      if (settings.enabled !== true) return null;
      if (toasts.length === 0) return null;

      return h('div', {
        className: 'shinon-trace-stack',
        'aria-label': 'Traceability-Toasts',
      },
        toasts.map((toast, i) => h(ToastItem, { key: `${toast.ts ?? toast.kind}-${i}`, toast, index: i })),
      );
    }

