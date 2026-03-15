import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

async function checkModel(modelName) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Say hello");
    console.log(`✅ ${modelName} works!`);
  } catch (err) {
    if (err.status === 404 || err.message.includes('not found') || err.message.includes('404')) {
        console.error(`❌ ${modelName} failed: MODEL NOT FOUND (404)`);
    } else if (err.status === 403 || err.message.includes('403') || err.message.includes('permission')) {
        console.error(`❌ ${modelName} failed: FORBIDDEN / NO ACCESS (403) - ${err.message}`);
    } else {
        console.error(`❌ ${modelName} failed: ${err.message}`);
    }
  }
}

async function listModels() {
  await Promise.all([
    checkModel("gemini-3.1-pro-preview"),
    checkModel("gemini-3-flash-preview"),
    checkModel("gemini-2.5-pro"),
    checkModel("gemini-2.5-flash")
  ]);
  process.exit(0);
}

listModels();
