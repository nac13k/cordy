import { createTwoFilesPatch } from 'diff';

export const TEST_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TEST_SLUG_MAX_LENGTH = 64;
const MARKER = /^\s*\/\/ cordy:(begin|end) (\S+)\s*$/;
const NAMED_IMPORT = /^import\s+\{([^}]*)\}\s+from\s+(['"])([^'"]+)\2;?\s*$/;

export type MarkerProblem = { line: number; message: string };
export type ManagedBlock = {
  slug: string;
  startLine: number;
  endLine: number | null;
  status: 'ok' | 'invalid';
  problems: MarkerProblem[];
};
export type ManagedFile = { blocks: ManagedBlock[]; problems: MarkerProblem[] };
export type RequiredImport = { module: string; names: string[] };
export type ManagedWritePlan =
  { kind: 'append' } | { kind: 'replace'; startLine: number; endLine: number };

export function isValidTestSlug(slug: string) {
  return slug.length <= TEST_SLUG_MAX_LENGTH && TEST_SLUG_PATTERN.test(slug);
}

export function parseManagedFile(content: string): ManagedFile {
  const blocks: ManagedBlock[] = [];
  const problems: MarkerProblem[] = [];
  let open: ManagedBlock | undefined;
  content.split('\n').forEach((text, index) => {
    const line = index + 1;
    const match = MARKER.exec(text);
    if (!match) return;
    const [, kind, slug] = match;
    if (kind === 'begin') {
      const block: ManagedBlock = {
        slug,
        startLine: line,
        endLine: null,
        status: 'ok',
        problems: [],
      };
      if (!isValidTestSlug(slug)) block.problems.push({ line, message: `invalid slug '${slug}'` });
      if (open) {
        open.problems.push({ line: open.startLine, message: `missing 'cordy:end ${open.slug}'` });
        block.problems.push({
          line,
          message: `nested inside '${open.slug}'`,
        });
      }
      blocks.push(block);
      open = block;
      return;
    }
    if (!open) {
      problems.push({ line, message: `'cordy:end ${slug}' without matching begin` });
      return;
    }
    if (slug !== open.slug)
      open.problems.push({
        line,
        message: `end slug '${slug}' does not match begin '${open.slug}'`,
      });
    open.endLine = line;
    open = undefined;
  });
  if (open)
    open.problems.push({ line: open.startLine, message: `missing 'cordy:end ${open.slug}'` });
  const counts = new Map<string, number>();
  for (const block of blocks) counts.set(block.slug, (counts.get(block.slug) ?? 0) + 1);
  for (const block of blocks) {
    if ((counts.get(block.slug) ?? 0) > 1)
      block.problems.push({ line: block.startLine, message: `duplicate slug '${block.slug}'` });
    block.status = block.problems.length ? 'invalid' : 'ok';
  }
  return { blocks, problems };
}

export function managedFileProblems(file: ManagedFile): MarkerProblem[] {
  return [...file.problems, ...file.blocks.flatMap((block) => block.problems)].sort(
    (a, b) => a.line - b.line,
  );
}

export function planManagedWrite(
  content: string | undefined,
  slug: string,
  update: boolean,
): ManagedWritePlan {
  const file = parseManagedFile(content ?? '');
  const problems = managedFileProblems(file);
  if (problems.length)
    throw new Error(
      `malformed Cordy markers: ${problems.map((problem) => `line ${problem.line}: ${problem.message}`).join('; ')}`,
    );
  const existing = file.blocks.find((block) => block.slug === slug);
  if (existing && !update)
    throw new Error(`test '${slug}' already exists; use --update to replace it`);
  if (!existing && update) throw new Error(`test '${slug}' does not exist; cannot --update it`);
  return existing
    ? { kind: 'replace', startLine: existing.startLine, endLine: existing.endLine as number }
    : { kind: 'append' };
}

function renderImport(module: string, names: string[], quote = "'") {
  return `import { ${names.join(', ')} } from ${quote}${module}${quote};`;
}

export function renderImports(required: RequiredImport[]) {
  return required.map((item) => renderImport(item.module, item.names));
}

export function mergeImports(content: string, required: RequiredImport[]) {
  const lines = content === '' ? [] : content.split('\n');
  let lastImport = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    if (text.startsWith('import ')) lastImport = index;
    else if (text !== '' && !text.startsWith('//')) break;
  }
  for (const item of required) {
    const existing = lines.findIndex(
      (text, index) => index <= lastImport && NAMED_IMPORT.exec(text)?.[3] === item.module,
    );
    if (existing >= 0) {
      const [, specifiers, quote] = NAMED_IMPORT.exec(lines[existing]) as RegExpExecArray;
      const names = specifiers
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      const present = new Set(names.map((name) => name.split(/\s+as\s+/)[0]));
      const missing = item.names.filter((name) => !present.has(name));
      if (missing.length)
        lines[existing] = renderImport(item.module, [...names, ...missing], quote);
      continue;
    }
    lines.splice(lastImport + 1, 0, renderImport(item.module, item.names));
    lastImport += 1;
  }
  return lines.join('\n');
}

export function applyManagedWrite(
  content: string | undefined,
  slug: string,
  block: string,
  required: RequiredImport[],
  update: boolean,
) {
  planManagedWrite(content, slug, update);
  const merged = mergeImports(content ?? '', required);
  const plan = planManagedWrite(merged, slug, update);
  if (plan.kind === 'replace') {
    const lines = merged.split('\n');
    lines.splice(plan.startLine - 1, plan.endLine - plan.startLine + 1, ...block.split('\n'));
    return lines.join('\n');
  }
  const head = merged.replace(/\n+$/, '');
  return `${head}${head ? '\n\n' : ''}${block}\n`;
}

export function unifiedDiff(file: string, before: string, after: string) {
  return createTwoFilesPatch(file, file, before, after);
}

export type OutputDecision = { write?: string; diff?: string; message?: string };

export function decideOutput(input: {
  file: string;
  current: string | undefined;
  testName?: string;
  update: boolean;
  dryRun: boolean;
  diff: boolean;
  succeeded: boolean;
  requiredImports: RequiredImport[];
  renderFile: () => string;
  renderBlock: () => string;
}): OutputDecision {
  const { file, current, testName } = input;
  if (input.dryRun) {
    if (!testName) return { message: `dry-run:${file} would be overwritten; nothing was written` };
    const plan = planManagedWrite(current, testName, input.update);
    const before = current ?? '';
    const header = unifiedDiff(file, before, mergeImports(before, input.requiredImports));
    const action =
      plan.kind === 'replace'
        ? `test '${testName}' (lines ${plan.startLine}-${plan.endLine}) would be replaced`
        : `test '${testName}' would be appended`;
    return { diff: header, message: `dry-run: ${action} in ${file}; nothing was written` };
  }
  if (testName && !input.succeeded)
    return { message: `${file} left unchanged: the run did not fully succeed` };
  const next = testName
    ? applyManagedWrite(current, testName, input.renderBlock(), input.requiredImports, input.update)
    : input.renderFile();
  if (input.diff)
    return {
      diff: unifiedDiff(file, current ?? '', next),
      message: `--diff: ${file} was not written`,
    };
  return { write: next };
}
