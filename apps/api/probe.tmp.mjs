import { readFileSync } from 'node:fs';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
const line = readFileSync('../../.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('GOOGLE_GENERATIVE_AI_API_KEY='));
const google = createGoogleGenerativeAI({ apiKey: line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '') });
for (const id of ['gemini-2.5-flash-lite']) {
  const t = Date.now();
  try {
    const { text } = await generateText({ model: google(id), prompt: 'Reply with the word OK.', maxRetries: 0 });
    console.log(`${id}: ok in ${Date.now() - t} ms (${text.trim().slice(0, 20)})`);
  } catch (err) {
    console.log(`${id}: ${err.statusCode ?? ''} ${String(err.message).split('\n')[0].slice(0, 110)}`);
  }
}
