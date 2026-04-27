#!/usr/bin/env node
/**
 * agentcast CLI — extract JSON from prose-wrapped LLM output, validate against a shape.
 *
 * Subcommands:
 *   agentcast extract <text.txt|->                          [--pretty]
 *   agentcast validate <value.json|-> --shape FILE_OR_JSON  [--pretty]
 *
 * Conventions shared across the @mukundakatta agent CLIs:
 *   - `-` reads stdin
 *   - JSON to stdout for machine consumers; --pretty for humans
 *   - exit 0 = success / valid, 1 = no JSON / invalid, 2 = usage error
 */

import { readFileSync, existsSync } from 'node:fs';

import { extractJson } from './extract.js';
import { adapters } from './adapters.js';
import { VERSION } from './version.js';

const USAGE = `agentcast v${VERSION} — JSON extraction + shape validation for LLM output.

Usage:
  agentcast extract <text.txt|->                              [--pretty]
  agentcast validate <value.json|->  --shape FILE_OR_JSON     [--pretty]
  agentcast --help | --version

Notes:
  Pass '-' as the input to read from stdin.
  extract  pulls the first parseable JSON value out of any text (prose,
           fenced code blocks, or balanced {...}/[...] in the middle of
           a sentence). Exits 1 if no JSON could be extracted.
  validate runs adapters.shape(spec) over a JSON value. The --shape arg
           is a JSON file path or an inline object literal whose values
           are compact type strings ("string", "number?", "array", ...).
  Exit codes: 0 ok / valid, 1 no JSON / invalid, 2 usage error.
`;

// --- main ---

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);
  try {
    if (sub === 'extract') return await runExtract(rest);
    if (sub === 'validate') return await runValidate(rest);
    process.stderr.write(`agentcast: unknown subcommand '${sub}'\n\n${USAGE}`);
    return 2;
  } catch (err) {
    return reportError(err);
  }
}

// --- extract ---

async function runExtract(args) {
  const flags = parseFlags(args, { boolean: ['pretty'] });
  if (flags._.length === 0) {
    process.stderr.write('agentcast extract: missing <text.txt|-> argument\n');
    return 2;
  }
  const text = await resolveInput(flags._[0]);
  const value = extractJson(text);
  if (value === null) {
    // No JSON found — emit a structured error to stdout so pipelines can react,
    // and exit 1.
    emit({ extracted: false, error: 'no JSON value could be extracted' }, flags.pretty);
    return 1;
  }
  // Print just the extracted value, not a wrapper. That makes the output
  // pipe-friendly: `agentcast extract response.txt | jq .field`.
  emit(value, flags.pretty);
  return 0;
}

// --- validate ---

async function runValidate(args) {
  const flags = parseFlags(args, {
    string: ['shape'],
    boolean: ['pretty'],
  });
  if (flags._.length === 0) {
    process.stderr.write('agentcast validate: missing <value.json|-> argument\n');
    return 2;
  }
  if (!flags.shape) {
    process.stderr.write('agentcast validate: --shape is required\n');
    return 2;
  }
  const shape = await loadShape(flags.shape);
  const value = await readJson(flags._[0]);
  const validator = adapters.shape(shape);
  const result = validator(value);
  if (result.valid) {
    emit({ valid: true, value: result.value }, flags.pretty);
    return 0;
  }
  emit({ valid: false, error: result.error }, flags.pretty);
  return 1;
}

// --- helpers ---

async function loadShape(arg) {
  if (existsSync(arg)) {
    const raw = readFileSync(arg, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new ParseError(`shape file '${arg}' is not valid JSON: ${err.message}`);
    }
  }
  try {
    return JSON.parse(arg);
  } catch {
    throw new UsageError(`--shape must be a JSON file path or inline JSON object, got '${arg}'`);
  }
}

async function readJson(arg) {
  const raw = await resolveInput(arg);
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ParseError(`'${arg}' is not valid JSON: ${err.message}`);
  }
}

async function resolveInput(arg) {
  if (arg === '-') return await readStdin();
  if (existsSync(arg)) return readFileSync(arg, 'utf8');
  return arg;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Tiny argv parser. Same shape as the other @mukundakatta CLIs.
 */
function parseFlags(argv, schema) {
  const flags = { _: [] };
  for (const name of schema.boolean ?? []) flags[name] = false;
  for (const name of schema.string ?? []) flags[name] = undefined;

  const wantsValue = new Set(schema.string ?? []);

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') {
      flags._.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const inlineValue = eq === -1 ? null : tok.slice(eq + 1);
      if (wantsValue.has(name)) {
        const raw = inlineValue ?? argv[++i];
        if (raw === undefined) throw new UsageError(`flag --${name} requires a value`);
        flags[name] = raw;
      } else if ((schema.boolean ?? []).includes(name)) {
        flags[name] = true;
      } else {
        throw new UsageError(`unknown flag --${name}`);
      }
    } else {
      flags._.push(tok);
    }
  }
  return flags;
}

function emit(value, pretty) {
  const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  process.stdout.write(json + '\n');
}

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
    this.exitCode = 1;
  }
}

function reportError(err) {
  if (err && (err.name === 'UsageError' || err.name === 'ParseError')) {
    process.stderr.write(`agentcast: ${err.message}\n`);
    return err.exitCode ?? 2;
  }
  process.stderr.write(`agentcast: ${err?.message ?? err}\n`);
  return 1;
}

const isMain =
  process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('agentcast'));
if (isMain) {
  main().then(
    (code) => process.exit(code ?? 0),
    (err) => {
      process.stderr.write(`agentcast: ${err?.stack ?? err}\n`);
      process.exit(1);
    }
  );
}
