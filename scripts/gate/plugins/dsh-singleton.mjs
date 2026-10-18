/**
 * dsh-singleton — jedes `@deepseek-ai/*`-Paket liegt genau EINMAL im Baum.
 *
 * Warum das ein Gate ist und nicht ein Hinweis: der Tool-Pfad von DSH hängt an
 * einem modulweiten Symbol (`TOOL_RUNTIME_SCHEDULER`). Zwei Kopien von
 * `@deepseek-ai/dsh-tools` sind zwei Symbole — der Scheduler ist dann
 * `undefined`, und JEDER Tool-Call endet mit `reading 'prepare'`; kein
 * statisches Gate sah das (gemessen 2026-10-18, DSH 0.2.1-rc.2).
 */
export const id = 'dsh-singleton';

export function check(ctx) {
  return ctx.repo.dshInstanceIssues();
}
