const TASK_PATTERN = /\[\[task:[^\]]*\]\]/g;
const ACTION_PATTERN = /\[\[suggest_actions?:[^\]]*\]\]/g;
const SEPARATOR_PATTERN = /^---+$/gm;
const TOOL_CALL_PATTERN = /\[\[tool_call:[^\]]*\]\]/g;
const METADATA_PATTERN = /\[\[(?:source|ref|cite):[^\]]*\]\]/g;

export function cleanResponse(text) {
  if (!text) return '';

  let cleaned = text;

  cleaned = cleaned.replace(TASK_PATTERN, '');
  cleaned = cleaned.replace(ACTION_PATTERN, '');
  cleaned = cleaned.replace(TOOL_CALL_PATTERN, '');
  cleaned = cleaned.replace(METADATA_PATTERN, '');

  cleaned = cleaned.replace(SEPARATOR_PATTERN, '');

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}
