// Pricing module - fetches from LiteLLM with fallback hardcoded prices

interface PricingEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  // Claude/Anthropic: 200k threshold tiered pricing
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

export interface PricingData {
  [model: string]: PricingEntry;
}

let cachedPricing: PricingData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Fallback prices per token (USD) for common Claude models
const FALLBACK_PRICING: Record<string, { input: number; output: number; inputAbove200k?: number; outputAbove200k?: number; cacheWrite?: number; cacheRead?: number }> = {
  'claude-opus-4': { input: 15 / 1e6, output: 75 / 1e6, inputAbove200k: 15 / 1e6, outputAbove200k: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.875 / 1e6 },
  'claude-sonnet-4': { input: 3 / 1e6, output: 15 / 1e6, inputAbove200k: 3 / 1e6, outputAbove200k: 15 / 1e6, cacheWrite: 4.50 / 1e6, cacheRead: 0.375 / 1e6 },
  'claude-3.5-sonnet': { input: 3 / 1e6, output: 15 / 1e6, inputAbove200k: 3 / 1e6, outputAbove200k: 15 / 1e6, cacheWrite: 4.50 / 1e6, cacheRead: 0.375 / 1e6 },
  'claude-3.5-haiku': { input: 0.8 / 1e6, output: 4 / 1e6, inputAbove200k: 1 / 1e6, outputAbove200k: 5 / 1e6, cacheWrite: 1.50 / 1e6, cacheRead: 0.10 / 1e6 },
  'claude-3-opus': { input: 15 / 1e6, output: 75 / 1e6, inputAbove200k: 15 / 1e6, outputAbove200k: 75 / 1e6, cacheWrite: 18.75 / 1e6, cacheRead: 1.875 / 1e6 },
  'claude-3-sonnet': { input: 3 / 1e6, output: 15 / 1e6, cacheWrite: 4.50 / 1e6, cacheRead: 0.375 / 1e6 },
  'claude-3-haiku': { input: 0.25 / 1e6, output: 1.25 / 1e6, cacheWrite: 1.50 / 1e6, cacheRead: 0.10 / 1e6 },
};

export async function fetchPricing(): Promise<PricingData> {
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

function findFallback(model: string): { input: number; output: number; inputAbove200k?: number; outputAbove200k?: number; cacheWrite?: number; cacheRead?: number } | null {
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

// Tiered pricing: applies threshold per individual API request (not aggregated)
function tieredCost(tokens: number, basePrice: number | undefined, abovePrice: number | undefined): number {
  if (!tokens || tokens <= 0) return 0;
  if (tokens > TIER_THRESHOLD && abovePrice != null) {
    return TIER_THRESHOLD * (basePrice ?? 0) + (tokens - TIER_THRESHOLD) * abovePrice;
  }
  return tokens * (basePrice ?? 0);
}

/**
 * Calculate cost for a single record using pre-fetched pricing data.
 * This is the synchronous version - use when you already have pricing data.
 * Tiered pricing is applied per-record (matching ccusage CLI behavior).
 */
export function calculateCostWithPricing(
  pricing: PricingData,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreateTokens: number = 0,
  cacheReadTokens: number = 0,
): number {
  const entry = findPricing(pricing, model);

  if (entry && entry.input_cost_per_token != null && entry.output_cost_per_token != null) {
    const inputCost = tieredCost(inputTokens, entry.input_cost_per_token, entry.input_cost_per_token_above_200k_tokens);
    const outputCost = tieredCost(outputTokens, entry.output_cost_per_token, entry.output_cost_per_token_above_200k_tokens);
    const cacheCreateCost = tieredCost(cacheCreateTokens, entry.cache_creation_input_token_cost, entry.cache_creation_input_token_cost_above_200k_tokens);
    const cacheReadCost = tieredCost(cacheReadTokens, entry.cache_read_input_token_cost, entry.cache_read_input_token_cost_above_200k_tokens);
    return inputCost + outputCost + cacheCreateCost + cacheReadCost;
  }

  // Fallback
  const fallback = findFallback(model);
  if (fallback) {
    const inputCost = tieredCost(inputTokens, fallback.input, fallback.inputAbove200k);
    const outputCost = tieredCost(outputTokens, fallback.output, fallback.outputAbove200k);
    let cacheCost = 0;
    if (fallback.cacheWrite && cacheCreateTokens > 0) cacheCost += cacheCreateTokens * fallback.cacheWrite;
    if (fallback.cacheRead && cacheReadTokens > 0) cacheCost += cacheReadTokens * fallback.cacheRead;
    return inputCost + outputCost + cacheCost;
  }

  // Unknown model - use sonnet pricing as default
  let cacheCost = 0;
  if (cacheCreateTokens > 0) cacheCost += cacheCreateTokens * (4.50 / 1e6);
  if (cacheReadTokens > 0) cacheCost += cacheReadTokens * (0.375 / 1e6);
  return inputTokens * (3 / 1e6) + outputTokens * (15 / 1e6) + cacheCost;
}

/**
 * Calculate cost for a single record (async version - fetches pricing if needed).
 */
export async function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreateTokens: number = 0,
  cacheReadTokens: number = 0,
): Promise<number> {
  const pricing = await fetchPricing();
  return calculateCostWithPricing(pricing, model, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens);
}
