#!/usr/bin/env node
/**
 * Laddar ner Länsstyrelsens stiftelseregister (~22 MB) och bygger ett sökbart index.
 * Kör: npm run sync:stiftelser
 */
import 'dotenv/config';
import { downloadStiftelseRegister } from '../api/services/officialSources.js';

console.log('Hämtar stiftelseregister från Länsstyrelsen…');
const result = await downloadStiftelseRegister();
console.log('Klart.');
console.log(`  Råfil: ${(result.rawBytes / 1e6).toFixed(1)} MB`);
console.log(`  Stiftelser i register: ${result.totalInRegister}`);
console.log(`  Indexerade (bidrag/stipendium-relevanta): ${result.indexed}`);
console.log(`  Index: ${result.paths.index}`);
