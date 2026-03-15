import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const AGENT_DIR = path.join(ROOT_DIR, '.agent');
const MEMORY_DIR = path.join(AGENT_DIR, 'memory');

// Initialize Qdrant if credentials are provided
let qdrantClient = null;
if (process.env.QDRANT_URL && process.env.QDRANT_API_KEY) {
  try {
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
    console.log('Qdrant Cloud client initialized.');
  } catch (err) {
    console.error('Failed to initialize Qdrant client:', err);
  }
}

// Initialize Gemini for embeddings
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');
const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

export class MemoryService {
  /**
   * Reads a core memory file (AGENTS.md, MEMORY.md, WORKING.md)
   */
  static async readFile(filename) {
    try {
      const filePath = path.join(AGENT_DIR, filename);
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      console.warn(`Memory file ${filename} not found or unreadable.`);
      return null;
    }
  }

  /**
   * Updates a core memory file
   */
  static async writeFile(filename, content) {
    const filePath = path.join(AGENT_DIR, filename);
    await fs.writeFile(filePath, content, 'utf-8');

    // If it's MEMORY.md, we might want to sync with Qdrant
    if (filename === 'MEMORY.md' && qdrantClient) {
      this.syncToQdrant('memory-curated', content);
    }
  }

  /**
   * Appends to the daily episodic log
   */
  static async logEpisodic(message, metadata = {}) {
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(MEMORY_DIR, `${today}.md`);

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `\n### [${timestamp}] ${message}\n- **Metadata**: ${JSON.stringify(metadata)}\n`;

    try {
      await fs.appendFile(logFile, logEntry, 'utf-8');
    } catch (err) {
      // Create file if it doesn't exist
      const header = `---\ndate: ${today}\ntype: episodic-log\n---\n# Episodic Log - ${today}\n`;
      await fs.writeFile(logFile, header + logEntry, 'utf-8');
    }

    // Sync to Qdrant if available
    if (qdrantClient) {
      this.syncToQdrant('memory-episodic', message, { ...metadata, date: today });
    }
  }

  /**
   * Syncs content to Qdrant vector database
   */
  static async syncToQdrant(collectionName, text, metadata = {}) {
    if (!qdrantClient) return;

    try {
      // Create collection if it doesn't exist (simplified)
      const collections = await qdrantClient.getCollections();
      if (!collections.collections.find(c => c.name === collectionName)) {
        await qdrantClient.createCollection(collectionName, {
          vectors: { size: 768, distance: 'Cosine' }
        });
      }

      // Generate embedding
      const embedResult = await embedModel.embedContent(text);
      const vector = embedResult.embedding.values;

      await qdrantClient.upsert(collectionName, {
        wait: true,
        points: [
          {
            id: Date.now(), // Simplified ID
            vector: vector,
            payload: {
              text,
              ...metadata,
              synced_at: new Date().toISOString()
            }
          }
        ]
      });
      console.log(`Synced content to Qdrant collection: ${collectionName}`);
    } catch (err) {
      console.error('Qdrant sync failed:', err);
    }
  }

  /**
   * Searches memory using semantic search
   */
  static async searchMemory(query, collectionName = 'memory-episodic') {
    if (!qdrantClient) return [];

    try {
      const embedResult = await embedModel.embedContent(query);
      const vector = embedResult.embedding.values;

      const searchResult = await qdrantClient.search(collectionName, {
        vector: vector,
        limit: 5,
        with_payload: true
      });

      return searchResult.map(res => res.payload);
    } catch (err) {
      console.error('Qdrant search failed:', err);
      return [];
    }
  }
}
