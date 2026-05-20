/**
 * Kuraterade OpenRouter-modeller — inte hela katalogen.
 * Priser: https://openrouter.ai/models (visas per modell i deras UI)
 */

export const CURATED_MODELS = [
  {
    id: 'openrouter/free',
    label: 'openrouter/free',
    tier: 'lottery',
    badge: 'Gratis-lotto',
    description:
      'Slumpar bland gratis modeller som stödjer din request. Billigast men varierande kvalitet.',
  },
  {
    id: 'minimax/minimax-m2.5:free',
    label: 'MiniMax M2.5',
    tier: 'free',
    badge: 'Gratis',
    description: 'SOTA för kontor/kod — bra allround gratis.',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super',
    tier: 'free',
    badge: 'Gratis',
    description: '120B MoE, 1M context — stark på agentuppgifter.',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B',
    tier: 'free',
    badge: 'Gratis',
    description: 'Multimodal, 256K context, dokument & kod.',
  },
  {
    id: 'deepseek/deepseek-v4-flash:free',
    label: 'DeepSeek V4 Flash',
    tier: 'free',
    badge: 'Gratis',
    description: 'Snabb MoE, 1M context — bra för kod & chat.',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    tier: 'budget',
    badge: 'Billig',
    description: 'Låg kostnad, stabil för planering & syntes.',
  },
  {
    id: 'xiaomi/mimo-v2.5-pro',
    label: 'MiMo V2.5 Pro',
    tier: 'quality',
    badge: 'Premium',
    description: 'Agent & långa uppgifter, 1M context.',
  },
  {
    id: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    tier: 'quality',
    badge: 'Premium',
    description: 'Multimodal, kod, UI-generering, multi-agent.',
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    tier: 'quality',
    badge: 'Premium',
    description: 'Stark på kod, agenter och professionellt skrivande.',
  },
  {
    id: 'tencent/hy3-preview',
    label: 'Tencent Hy3',
    tier: 'quality',
    badge: 'Premium',
    description: 'MoE för agentflöden, konfigurerbar reasoning.',
  },
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    tier: 'quality',
    badge: 'Premium',
    description: 'Nära Pro-kvalitet till Flash-pris & hastighet.',
  },
  {
    id: 'openrouter/owl-alpha',
    label: 'Owl Alpha',
    tier: 'quality',
    badge: 'Premium',
    description: 'Agent & tool use, lång context.',
  },
];

export const MODEL_PRESETS = {
  recommended: {
    id: 'recommended',
    label: 'Rekommenderad',
    description: 'Gratis först → premium → openrouter/free som sista utväg.',
    reason: [
      'deepseek/deepseek-v4-flash:free',
      'minimax/minimax-m2.5:free',
      'google/gemini-2.5-flash-lite',
      'openrouter/free',
    ],
    pro: [
      'google/gemini-3.5-flash',
      'moonshotai/kimi-k2.6',
      'anthropic/claude-sonnet-4.6',
      'openrouter/free',
    ],
  },
  budget: {
    id: 'budget',
    label: 'Budget (gratis)',
    description: 'Endast :free-modeller + openrouter/free.',
    reason: ['minimax/minimax-m2.5:free', 'deepseek/deepseek-v4-flash:free', 'openrouter/free'],
    pro: ['nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free', 'openrouter/free'],
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    description: 'Bästa betalda modellerna (högre kostnad).',
    reason: ['google/gemini-3.5-flash', 'anthropic/claude-sonnet-4.6'],
    pro: ['anthropic/claude-sonnet-4.6', 'moonshotai/kimi-k2.6', 'xiaomi/mimo-v2.5-pro'],
  },
  lottery: {
    id: 'lottery',
    label: 'Bara gratis-lotto',
    description: 'Endast openrouter/free — snabbast, mest slumpmässigt.',
    reason: ['openrouter/free'],
    pro: ['openrouter/free'],
  },
};

const VALID_IDS = new Set(CURATED_MODELS.map(m => m.id));

export function isValidCuratedModel(id) {
  return typeof id === 'string' && VALID_IDS.has(id);
}

/** Slå ihop preset + valfria enskilda överstyringar från UI */
export function resolveModelSettings(input = {}) {
  const presetId = input.presetId || 'recommended';
  const preset = MODEL_PRESETS[presetId] || MODEL_PRESETS.recommended;

  const pickChain = (mode, override) => {
    if (Array.isArray(override) && override.length > 0) {
      return override.filter(isValidCuratedModel);
    }
    if (typeof override === 'string' && isValidCuratedModel(override)) {
      return [override];
    }
    return [...(mode === 'reason' ? preset.reason : preset.pro)];
  };

  return {
    presetId: preset.id,
    reason: pickChain('reason', input.reasonModel ?? input.reason),
    pro: pickChain('pro', input.proModel ?? input.pro),
  };
}

export function getModelChain(mode, modelSettings) {
  const resolved = resolveModelSettings(modelSettings);
  const chain = mode === 'reason' ? resolved.reason : resolved.pro;
  if (chain.length === 0) return ['openrouter/free'];
  return chain;
}
