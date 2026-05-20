/** Qdrant Cloud använder ofta QDRANT_ENDPOINT; äldre kod QDRANT_URL */
export function getQdrantUrl() {
  const raw = process.env.QDRANT_URL || process.env.QDRANT_ENDPOINT || '';
  return raw.trim().replace(/\/$/, '');
}

export function getQdrantApiKey() {
  return process.env.QDRANT_API_KEY?.trim() || '';
}

export function isQdrantConfigured() {
  return !!(getQdrantUrl() && getQdrantApiKey());
}
