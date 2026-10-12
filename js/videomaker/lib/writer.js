// The script writer: one model call (two tries at most) that turns the source
// material, the brief and the chosen pictures into a validated film project,
// with the provider and key the author set in the AI settings.
import { complete, modelFor } from './ai.js';
import { describe } from './settings.js';
import { extractJson } from './json.js';
import { scriptSystem, briefText, normalizeProject, repositoryMaterial } from './script.js';

export class WriterUnavailableError extends Error {}

/** Rough length of the JSON film: structure plus narration and on-screen copy per language. */
export function expectedReplyChars(brief) {
  return Math.round(1_500 + brief.languages.length * (brief.duration * 2.2 * 6 + 1_800));
}

const SHORT_NAME = { anthropic: 'Claude', openai: 'OpenAI', openrouter: 'The model', local: 'The local model' };

/**
 * progress({ phase: 'reading'|'thinking'|'writing'|'checking'|'retry', message, chars?, expected? })
 * Resolves to { project, engine, model, inputTokens, outputTokens }.
 */
export async function writeFilm(settings, input) {
  const progress = input.progress || (() => undefined);
  const info = describe(settings);
  if (!info.ready) {
    throw new WriterUnavailableError(settings.provider === 'local'
      ? 'Set the server address and the model in the AI settings (top right).'
      : 'Add your API key in the AI settings (top right).');
  }
  const model = modelFor(settings);
  const who = SHORT_NAME[settings.provider] || 'The model';
  const system = scriptSystem(input.brief.purpose);
  const imageIds = input.images.map(image => image.id);
  const expected = expectedReplyChars(input.brief);
  let feedback = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    progress(attempt
      ? { phase: 'retry', message: `The script is incomplete: ${who} is fixing it…` }
      : { phase: 'reading', message: `Script handed to ${model}: reading the material and screenshots…` });
    const reply = await complete(settings, {
      system,
      material: repositoryMaterial(input.context, input.images),
      task: briefText(input.brief) + feedback,
      images: input.images,
      signal: input.signal,
      onEvent: event => {
        if (event.type === 'thinking') progress({ phase: 'thinking', message: `${who} is building the story…` });
        else progress({ phase: 'writing', message: 'Writing the scenes…', chars: event.chars, expected });
      },
    });
    inputTokens += reply.inputTokens;
    outputTokens += reply.outputTokens;
    progress({ phase: 'checking', message: 'Checking the script…' });
    try {
      const project = normalizeProject(JSON.parse(extractJson(reply.text)), input.brief, imageIds);
      return { project, engine: settings.provider, model, inputTokens, outputTokens };
    } catch (error) {
      lastError = error;
      const reason = error instanceof Error ? error.message.slice(0, 300) : 'invalid JSON';
      feedback = `\n\nYour previous reply could not be used: ${reason} Reply again with the complete JSON object only.`;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unusable script');
}
