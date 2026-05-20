import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { embedText, EMBEDDING_DIMENSIONS } from '../embeddings.js';
import { getQdrantApiKey, getQdrantUrl } from '../qdrantConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const AGENT_DIR = path.join(ROOT_DIR, '.agent');
const MEMORY_DIR = path.join(AGENT_DIR, 'memory');

let qdrantClient = null;
const qdrantUrl = getQdrantUrl();
const qdrantKey = getQdrantApiKey();
if (qdrantUrl && qdrantKey) {
  try {
    qdrantClient = new QdrantClient({ url: qdrantUrl, apiKey: qdrantKey });
    console.log('Qdrant client initialized.');
  } catch (err) {
    console.error('Failed to initialize Qdrant client:', err);
  }
}

async function ensureCollection(collectionName) {
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.find((c) => c.name === collectionName);
  if (!exists) {
    await qdrantClient.createCollection(collectionName, {
      vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
    });
  }
}

export class MemoryService {
  static async readFile(filename) {
    try {
      const filePath = path.join(AGENT_DIR, filename);
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      console.warn(`Memory file ${filename} not found or unreadable.`);
      return null;
    }
  }

  static async writeFile(filename, content) {
    if (filename === 'MEMORY.md' && qdrantClient) {
      this.syncToQdrant('memory-curated', content);
    }

    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      console.log(`Skipping local file write for ${filename} on Vercel`);
      return;
    }

    const filePath = path.join(AGENT_DIR, filename);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  static async logEpisodic(message, metadata = {}) {
    const today = new Date().toISOString().split('T')[0];

    if (qdrantClient) {
      this.syncToQdrant('memory-episodic', message, { ...metadata, date: today });
    }

    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      console.log('Skipping local episodic log write on Vercel');
      return;
    }

    const logFile = path.join(MEMORY_DIR, `${today}.md`);
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `\n### [${timestamp}] ${message}\n- **Metadata**: ${JSON.stringify(metadata)}\n`;

    try {
      await fs.appendFile(logFile, logEntry, 'utf-8');
    } catch {
      const header = `---\ndate: ${today}\ntype: episodic-log\n---\n# Episodic Log - ${today}\n`;
      await fs.writeFile(logFile, header + logEntry, 'utf-8');
    }
  }

  static async syncToQdrant(collectionName, text, metadata = {}) {
    if (!qdrantClient) return;

    try {
      await ensureCollection(collectionName);
      const vector = await embedText(text);

      await qdrantClient.upsert(collectionName, {
        wait: true,
        points: [
          {
            id: Date.now(),
            vector,
            payload: {
              text,
              ...metadata,
              synced_at: new Date().toISOString(),
            },
          },
        ],
      });
      console.log(`Synced to Qdrant: ${collectionName}`);
    } catch (err) {
      console.error('Qdrant sync failed:', err);
    }
  }

  static async searchMemory(query, collectionName = 'memory-episodic') {
    if (!qdrantClient) return [];

    try {
      await ensureCollection(collectionName);
      const vector = await embedText(query);

      const searchResult = await qdrantClient.search(collectionName, {
        vector,
        limit: 5,
        with_payload: true,
      });

      return searchResult.map((res) => res.payload);
    } catch (err) {
      console.error('Qdrant search failed:', err);
      return [];
    }
  }
}
