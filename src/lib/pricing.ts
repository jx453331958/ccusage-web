// Pricing module - fetches from LiteLLM with fallback hardcoded prices

interface PricingEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  input_cost_per_token_above_128k_tokens?: number;
  output_cost_per_token_above_128k_tokens?: number;
}

interface PricingData {
  [model: string]: PricingEntry;
}

let cachedPricing: PricingData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Fallback prices per token (USD) for common Claude models
const FALLBACK_PRICING: Record<string, { input: number; output: number; inputAbove128k?: number; outputAbove128k?: number }> = {
  'claude-opus-4': { input: 15 / 1e6, output: 75 / 1e6, inputAbove128k: 15 / 1e6, outputAbove128k: 75 / 1e6 },
  'claude-sonnet-4': { input: 3 / 1e6, output: 15 / 1e6, inputAbove128k: 3 / 1e6, outputAbove128k: 15 / 1e6 },
  'claude-3.5-sonnet': { input: 3 / 1e6, output: 15 / 1e6, inputAbove128k: 3 / 1e6, outputAbove128k: 15 / 1e6 },
  'claude-3.5-haiku': { input: 0.8 / 1e6, output: 4 / 1e6, inputAbove128k: 1 / 1e6, outputAbove128k: 5 / 1e6 },
  'claude-3-opus': { input: 15 / 1e6, output: 75 / 1e6, inputAbove128k: 15 / 1e6, outputAbove128k: 75 / 1e6 },
  'claude-3-sonnet': { input: 3 / 1e6, output: 15 / 1e6 },
  'claude-3-haiku': { input: 0.25 / 1e6, output: 1.25 / 1e6 },
};

async function fetchPricing(): Promise<PricingData> {
  const now = Date.now();
  if (cachedPricing && now - cacheTimestamp < CACHE_TTL) {
    return cachedPricing;
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Filter to anthropic/claude models only
    const filtered: PricingData = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('anthropic/') || key.startsWith('claude-') || key.startsWith('claude/')) {
        filtered[key] = value as PricingEntry;
      }
    }

    cachedPricing = filtered;
    cacheTimestamp = now;
    return filtered;
  } catch (e) {
    console.warn('Failed to fetch LiteLLM pricing, using fallback:', e);
    if (cachedPricing) return cachedPricing;
    return {};
  }
}

function findPricing(pricing: PricingData, model: string): PricingEntry | null {
  // Try exact match with common prefixes
  const candidates = [
    model,
    `anthropic/${model}`,
    `claude-3-5-sonnet-latest`,
    `claude-3-5-haiku-latest`,
  ];

  for (const candidate of candidates) {
    if (pricing[candidate]) return pricing[candidate];
  }

  // Try prefix matching (model names often have date suffixes like -20250514)
  for (const [key, value] of Object.entries(pricing)) {
    const cleanKey = key.replace('anthropic/', '');
    if (model.startsWith(cleanKey) || cleanKey.startsWith(model)) {
      return value;
    }
  }

  return null;
}

function findFallback(model: string): { input: number; output: number; inputAbove128k?: number; outputAbove128k?: number } | null {
  // Try prefix matching against fallback keys
  for (const [key, value] of Object.entries(FALLBACK_PRICING)) {
    if (model.startsWith(key) || model.includes(key)) {
      return value;
    }
  }

  // Heuristic matching
  if (model.includes('opus')) return FALLBACK_PRICING['claude-opus-4'];
  if (model.includes('sonnet-4') || model.includes('sonnet4')) return FALLBACK_PRICING['claude-sonnet-4'];
  if (model.includes('sonnet')) return FALLBACK_PRICING['claude-3.5-sonnet'];
  if (model.includes('haiku')) return FALLBACK_PRICING['claude-3.5-haiku'];

  return null;
}

const TIER_THRESHOLD = 200000; // 200k tokens

export async function calculateCost(model: string, inputTokens: number, outputTokens: number): Promise<number> {
  const pricing = await fetchPricing();
  const entry = findPricing(pricing, model);

  if (entry && entry.input_cost_per_token != null && entry.output_cost_per_token != null) {
    let inputCost: number;
    let outputCost: number;

    // Handle tiered pricing
    if (entry.input_cost_per_token_above_128k_tokens && inputTokens > TIER_THRESHOLD) {
      const baseInput = TIER_THRESHOLD;
      const overInput = inputTokens - TIER_THRESHOLD;
      inputCost = baseInput * entry.input_cost_per_token + overInput * entry.input_cost_per_token_above_128k_tokens;
    } else {
      inputCost = inputTokens * entry.input_cost_per_token;
    }

    if (entry.output_cost_per_token_above_128k_tokens && outputTokens > TIER_THRESHOLD) {
      const baseOutput = TIER_THRESHOLD;
      const overOutput = outputTokens - TIER_THRESHOLD;
      outputCost = baseOutput * entry.output_cost_per_token + overOutput * entry.output_cost_per_token_above_128k_tokens;
    } else {
      outputCost = outputTokens * entry.output_cost_per_token;
    }

    return inputCost + outputCost;
  }

  // Fallback
  const fallback = findFallback(model);
  if (fallback) {
    let inputCost: number;
    let outputCost: number;

    if (fallback.inputAbove128k && inputTokens > TIER_THRESHOLD) {
      inputCost = TIER_THRESHOLD * fallback.input + (inputTokens - TIER_THRESHOLD) * fallback.inputAbove128k;
    } else {
      inputCost = inputTokens * fallback.input;
    }

    if (fallback.outputAbove128k && outputTokens > TIER_THRESHOLD) {
      outputCost = TIER_THRESHOLD * fallback.output + (outputTokens - TIER_THRESHOLD) * fallback.outputAbove128k;
    } else {
      outputCost = outputTokens * fallback.output;
    }

    return inputCost + outputCost;
  }

  // Unknown model - use sonnet pricing as default
  return inputTokens * (3 / 1e6) + outputTokens * (15 / 1e6);
}

export async function calculateCostBatch(
  records: { model: string; input_tokens: number; output_tokens: number }[]
): Promise<number> {
  let total = 0;
  for (const r of records) {
    total += await calculateCost(r.model, r.input_tokens, r.output_tokens);
  }
  return total;
}
