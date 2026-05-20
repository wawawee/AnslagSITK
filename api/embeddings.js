import 'dotenv/config';

export const EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-vl-1b-v2:free';

export const EMBEDDING_DIMENSIONS = Number(process.env.QDRANT_VECTOR_SIZE || 2048);

export async function embedText(text) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY saknas för embeddings');

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sitk.se',
      'X-OpenRouter-Title': 'AnslagSITK',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const vector = data.data?.[0]?.embedding;
  if (!vector?.length) throw new Error('Tom embedding från OpenRouter');
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding dimension ${vector.length} != ${EMBEDDING_DIMENSIONS}`);
  }
  return vector;
}
