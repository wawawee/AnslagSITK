#!/usr/bin/env node
/** Testa modellkedjan (free / paid / auto). Kör: npm run test:models */
import 'dotenv/config';
import OpenAI from 'openai';
import { getModelCandidates, MODEL_TIER, FREE_MODELS, PAID_MODELS } from '../api/modelRouter.js';

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.error('Saknar OPENROUTER_API_KEY');
  process.exit(1);
}

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: key,
  defaultHeaders: { 'HTTP-Referer': 'https://sitk.se', 'X-OpenRouter-Title': 'AnslagSITK-test' },
});

console.log(`Tier: ${MODEL_TIER}\nFree: ${FREE_MODELS.pro.join(', ')}\nPaid: ${PAID_MODELS.pro.join(', ')}\n`);

for (const model of getModelCandidates('pro').slice(0, 6)) {
  const t0 = Date.now();
  try {
    const r = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Svara: OK' }],
      max_tokens: 8,
    });
    console.log(`✓ ${model} (${Date.now() - t0}ms) → ${r.model}`);
  } catch (e) {
    console.log(`✗ ${model} (${Date.now() - t0}ms) ${e.message?.slice(0, 70)}`);
  }
}
