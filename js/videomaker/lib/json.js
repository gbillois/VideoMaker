/** Pulls the JSON object out of a model reply (code fence, prose around it, thinking tags). */

function balancedJsonSlice(text) {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function stripThinking(text) {
  return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/gi, '').trim();
}

export function extractJson(text) {
  // Some reasoning models embed a draft JSON object in their thinking:
  // only the final answer is parsed.
  text = stripThinking(text);
  // Prefer a fenced code block, then a balanced JSON payload anywhere in the
  // reply. A missing closing fence (answer cut off) runs to the end of the text.
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  if (codeBlock) {
    const block = codeBlock[1].trim();
    return balancedJsonSlice(block) || block;
  }
  return balancedJsonSlice(text) || text;
}
