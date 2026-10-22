/** Stable preflight diagnostic codes and rendering. */
export function diagnostic(code, message, metadata = {}) {
  return {
    code,
    severity: 'error',
    message,
    ...(metadata.path ? { path: metadata.path } : {}),
    ...(Number.isInteger(metadata.line) ? { line: metadata.line } : {}),
    ...(metadata.details ? { details: metadata.details } : {}),
  };
}

export function formatDiagnostic(item) {
  const location = item.path
    ? ` (${item.path}${item.line ? `:${item.line}` : ''})`
    : '';
  const details = item.details ? ` — ${item.details}` : '';
  return `ERROR ${item.code}: ${item.message}${location}${details}`;
}
