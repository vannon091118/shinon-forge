import z from '@deepseek-ai/schemastery';

// Runtime-first profile layer. Host logic stays DOM-free; mobile UI policy belongs in client.js.
export const Config = z.object({ enabled: z.boolean().default(true) });

export function apply(_ctx, config) {
  if (!config.enabled) return () => {};
  return () => {};
}
