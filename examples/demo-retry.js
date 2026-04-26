/**
 * Runnable demo: a model returns invalid JSON, cast() shows the retry loop
 * with the validation error as feedback, and finally returns clean data.
 *
 *   node examples/demo-retry.js
 *
 * No API key needed — the "LLM" is a scripted stub that demonstrates
 * the full retry-with-feedback flow.
 */
import { cast, adapters, CastError } from '../src/index.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};
const c = (col, s) => (process.stdout.isTTY ? col + s + COLORS.reset : s);

function banner(text) {
  console.log('\n' + '═'.repeat(64));
  console.log('  ' + text);
  console.log('═'.repeat(64));
}

const productSchema = adapters.shape({
  name: 'string',
  price: 'number',
  in_stock: 'boolean',
  tags: 'array',
});

// Scripted "LLM" that fails twice then succeeds. Each call sees the message
// history so we can show what feedback got fed back in.
const responses = [
  // Attempt 1: wrong type for price + missing in_stock + missing tags
  'Sure, here is a product:\n\n{"name": "Widget", "price": "free"}',
  // Attempt 2: prose-wrapped, but in_stock is a string
  'Got it — the product details:\n```json\n{"name":"Widget","price":9.99,"in_stock":"yes","tags":["new"]}\n```',
  // Attempt 3: clean
  '{"name":"Widget","price":9.99,"in_stock":true,"tags":["new","sale"]}',
];

let attempt = 0;
const llm = async (messages) => {
  const response = responses[attempt];
  attempt++;
  banner(`LLM call ${attempt}: messages sent (${messages.length} total)`);
  for (const m of messages) {
    const tag = m.role === 'user' ? c(COLORS.cyan, '[user]') : c(COLORS.yellow, '[assistant]');
    const content = m.content.length > 200 ? m.content.slice(0, 197) + '...' : m.content;
    console.log(`  ${tag} ${content.replace(/\n/g, '\n         ')}`);
  }
  console.log(c(COLORS.dim, `\n  → returning: ${response}`));
  return response;
};

console.log(c(COLORS.bold, '\nagentcast retry demo — schema:'));
console.log('  { name: string, price: number, in_stock: boolean, tags: array }');

try {
  const product = await cast({
    llm,
    validate: productSchema,
    prompt: 'Generate one example product as JSON.',
    maxRetries: 3,
  });
  banner('cast() succeeded');
  console.log(c(COLORS.green, '  ✓ valid product:'));
  console.log('  ' + JSON.stringify(product, null, 2).replace(/\n/g, '\n  '));
} catch (err) {
  if (err instanceof CastError) {
    banner('cast() exhausted retries');
    console.log(c(COLORS.red, '  ✗ ' + err.message));
    console.log(c(COLORS.dim, `  attempts: ${err.attempts.length}`));
  } else {
    throw err;
  }
}

console.log('\n' + c(COLORS.dim, 'demo complete'));
