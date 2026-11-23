import { Language } from './languages';

export const DEFAULT_SYSTEM_PROMPT =
    'You are a professional translation engine. Translate the text into natural, fluent $to, keeping the tone, formatting and line breaks of the original. Output only the translation: no quotes, no notes, no explanations.';
export const DEFAULT_USER_PROMPT = 'Translate into $to:\n"""\n$text\n"""';

// $text $from $to $detect are replaced in the prompts
export function fillPrompt(template, text, from, to, detect) {
    return (template ?? '')
        .replaceAll('$text', text)
        .replaceAll('$from', from)
        .replaceAll('$to', to)
        .replaceAll('$detect', Language[detect] ?? '');
}

// LLMs like to wrap the answer in the same quotes the prompt used
export function cleanResult(result) {
    let target = (result ?? '').trim();
    if (target.startsWith('"""') && target.endsWith('"""') && target.length >= 6) {
        target = target.slice(3, -3);
    } else if (target.startsWith('"') && target.endsWith('"') && target.length >= 2) {
        target = target.slice(1, -1);
    }
    return target.trim();
}

// Optional request parameters from the "Advanced" settings (empty = provider default).
// thinking: the provider understands DeepSeek's `thinking: { type }` parameter.
export function llmArgs(config, { thinking = false, effort = true } = {}) {
    const args = {};
    const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
    const temperature = num(config.temperature);
    if (temperature !== null && !Number.isNaN(temperature)) args.temperature = temperature;
    const maxTokens = num(config.maxTokens);
    if (maxTokens !== null && !Number.isNaN(maxTokens) && maxTokens > 0) args.max_tokens = Math.round(maxTokens);
    if (effort && config.reasoningEffort) args.reasoning_effort = config.reasoningEffort;
    if (thinking && config.thinking) args.thinking = { type: config.thinking };
    if (config.extraArgs && config.extraArgs.trim()) {
        let extra;
        try {
            extra = JSON.parse(config.extraArgs);
        } catch {
            throw new Error('Extra parameters: invalid JSON');
        }
        Object.assign(args, extra);
    }
    return args;
}
