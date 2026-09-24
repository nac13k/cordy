export type InferredExpectations = { visible: string[]; buttons: string[] };

/**
 * Infers expectations from explicit Spanish wording in the prompt. Only the generic
 * "botón ..." phrasing is inferred; visible texts are declared with --expect.
 */
export function inferExpectations(task: string): InferredExpectations {
  const buttons: string[] = [];
  const normalized = task.replace(/\s+/g, ' ').trim();
  const button = normalized.match(
    /bot[oó]n(?:\s+(?:con\s+texto|de))?\s+(.+?)(?=\s+y\s+|\s*,\s*|\.|$)/i,
  );
  if (button?.[1]) buttons.push(button[1].trim().replace(/["“”]/g, ''));
  return { visible: [], buttons: [...new Set(buttons)] };
}
