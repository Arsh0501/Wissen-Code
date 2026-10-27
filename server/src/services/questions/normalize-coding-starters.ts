import { generatedQuestionSchema } from './workflow-schemas';

export const CODING_STARTER_LAYOUT_INSTRUCTIONS = `For coding starters, CORE LOGIC markers delimit the function BODY, never the method declaration. In Java, declare the method inside public class Main BEFORE writing BEGIN CORE LOGIC. Correct layout (replace solve with the documented function name and use appropriate parameter/return types):
public static int solve(int n) {
    // BEGIN CORE LOGIC
    // TODO: implement
    return 0;
    // END CORE LOGIC
}
Put main and all input/output handling AFTER this method, outside the marked region. Apply this same body-only layout to JavaScript and C++. In Python put # BEGIN CORE LOGIC on the first indented line AFTER the exact documented def line. Use exactly the same core function name in every language. Never wrap the entire function, the class or main in editable markers.`;

/** Find the method's closing brace without treating strings or comments as code. */
function closingBrace(code: string, opening: number): number {
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let index = opening; index < code.length; index++) {
    const character = code[index];
    const next = code[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index++;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index++;
    } else if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
}

/**
 * Some models wrap the whole core method in markers. Relocate only the markers
 * and leading comments when that region contains exactly the documented method.
 * Ambiguous regions, driver code and executable prefixes are left for validation
 * to reject. The method implementation and all driver code remain intact.
 */
export function normalizeCodingStarter(
  code: string,
  languageId: number,
  signature: string,
): string {
  if (![62, 63, 54].includes(languageId)) return code;
  const name = signature.match(/^def\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  if (!name) return code;
  const begins = [...code.matchAll(/^[ \t]*\/\/ BEGIN CORE LOGIC[ \t]*\r?$/gm)];
  const ends = [...code.matchAll(/^[ \t]*\/\/ END CORE LOGIC[ \t]*\r?$/gm)];
  if (begins.length !== 1 || ends.length !== 1 || begins[0].index! >= ends[0].index!) return code;
  const begin = begins[0];
  const end = ends[0];
  const region = code.slice(begin.index! + begin[0].length, end.index!);
  const method = new RegExp(`^([ \\t]*)[^\\n;{}]*\\b${name}\\s*\\([^;{}]*\\)[^;{}]*\\{`, 'm').exec(
    region,
  );
  if (!method) return code;
  const functionName = new RegExp(`\\b${name}\\s*\\(`).exec(method[0]);
  const declarationPrefix = method[0].slice(0, functionName!.index).trim();
  if (languageId === 63) {
    if (!/^(?:async\s+)?function\s*\*?$/.test(declarationPrefix)) return code;
  } else if (
    !declarationPrefix ||
    /[=;(){}\/]/.test(declarationPrefix) ||
    /\b(?:if|for|while|switch|return|throw|new)\b/.test(declarationPrefix)
  )
    return code;
  const prefix = region.slice(0, method.index);
  if (!/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*$/.test(prefix)) return code;
  const opening = method.index + method[0].lastIndexOf('{');
  const closing = closingBrace(region, opening);
  if (closing < 0 || region.slice(closing + 1).trim()) return code;
  const body = region.slice(opening + 1, closing);
  // Do not move declarations disguised inside a comment-only region.
  if (!body.trim() || !/\bTODO\b/.test(prefix + body)) return code;
  const newline = code.includes('\r\n') ? '\r\n' : '\n';
  const indent = method[1];
  const firstBodyLine = body.split(/\r?\n/).find((line) => line.trim());
  const existingIndent = firstBodyLine?.match(/^[ \t]*/)![0] ?? '';
  const bodyIndent = existingIndent.length > indent.length ? existingIndent : `${indent}    `;
  const comments = prefix
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => bodyIndent + line.trimStart());
  const declaration = region.slice(method.index, opening + 1).replace(/\r?\n[ \t]*(?=\{$)/, ' ');
  const implementation = body.replace(/^\r?\n/, '').trimEnd();
  return (
    code.slice(0, begin.index!) +
    declaration +
    newline +
    `${bodyIndent}// BEGIN CORE LOGIC` +
    newline +
    (comments.length ? comments.join(newline) + newline : '') +
    implementation +
    newline +
    `${bodyIndent}// END CORE LOGIC` +
    newline +
    indent +
    '}' +
    code.slice(end.index! + end[0].length)
  );
}

/** Used only by coding generation; MCQ and debugging generation do not call it. */
export function normalizeGeneratedCodingStarters(raw: unknown) {
  const question = generatedQuestionSchema.parse(raw);
  return {
    ...question,
    starterCodes: question.starterCodes.map((starter) => ({
      ...starter,
      code: normalizeCodingStarter(starter.code, starter.languageId, question.functionSignature),
    })),
  };
}
