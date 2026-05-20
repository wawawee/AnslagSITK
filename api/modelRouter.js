/**
 * Modellkedja: gratis (:free / openrouter/free) → betald fallback.
 * OPENROUTER_MODEL_TIER=free | paid | auto (default)
 */

export const MODEL_TIER = (process.env.OPENROUTER_MODEL_TIER || 'auto').toLowerCase();

/** Testade 2026-05 på OPENROUTER_API_KEY — se README / npm run test:models */
export const FREE_MODELS = {
  reason: [
    'google/gemini-2.5-flash-lite',
    'deepseek/deepseek-v4-flash:free',
    'minimax/minimax-m2.5:free',
    'openrouter/free',
  ],
  pro: [
    'google/gemini-2.5-flash-lite',
    'minimax/minimax-m2.5:free',
    'deepseek/deepseek-v4-flash:free',
    'openrouter/free',
  ],
  fast: [
    'google/gemini-2.5-flash-lite',
    'minimax/minimax-m2.5:free',
  ],
};

export const PAID_MODELS = {
  reason: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
  pro: ['openai/gpt-4o', 'google/gemini-2.5-flash'],
  fast: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
};

export function getModelCandidates(mode = 'pro') {
  const m = mode === true ? 'pro' : mode === false ? 'reason' : mode;
  const free = FREE_MODELS[m] || FREE_MODELS.pro;
  const paid = PAID_MODELS[m] || PAID_MODELS.pro;
  if (MODEL_TIER === 'free') return [...free];
  if (MODEL_TIER === 'paid') return [...paid];
  return [...free, ...paid];
}
