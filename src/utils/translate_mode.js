import { atom } from 'jotai';

// 'translate' (default) | 'chat' | 'polish' | 'rewrite' | 'summarize' | 'meaning'
export const translateModeAtom = atom('translate');

// Services that are driven by a prompt (LLMs). Others can only translate.
export const LLM_SERVICES = ['openai', 'openai_compatible', 'deepseek', 'chatglm', 'geminipro', 'ollama', 'claude'];

const SYSTEM = {
    polish: 'You are a professional editor. Polish the text: fix grammar, spelling and punctuation, improve clarity and fluency, keep the original language, meaning, tone and line breaks. Output only the polished text: no quotes, no notes, no explanations.',
    summarize:
        'You are a professional summarizer. Summarize the text concisely in $to, keeping the key points, names and numbers. Use short sentences or a few bullet points. Output only the summary: no quotes, no notes, no explanations.',
};
SYSTEM.rewrite =
    'You are a careful proofreader and rewriter. Fix every spelling, accent/diacritic, grammar and punctuation mistake, then rewrite awkward or unclear sentences so they read naturally. Keep the original language, meaning, tone and line breaks. Do not translate, do not add new information. Output only the corrected text: no quotes, no notes, no explanations.';
SYSTEM.explain =
    'You are an English-Vietnamese dictionary assistant. Explain the given English word or phrase in Vietnamese: the main meaning for each common part of speech, a short usage or nuance note if useful, and two short English example sentences each followed by its Vietnamese translation. Be concise. Plain text only: no markdown, no headings, no asterisks.';
SYSTEM.dict =
    'You are an English-Vietnamese dictionary. Reply with ONE raw JSON object only (no markdown, no code fences, no text around it) with this exact shape: {"word": string (the headword), "ipa": string (US IPA with slashes, e.g. "/həˈloʊ/"), "meanings": [{"pos": string (noun, verb, adjective, ...), "definitions": [string (short Vietnamese meaning)], "examples": [{"en": string, "vi": string}]}]}. Give the 1-4 most common parts of speech, 1-4 Vietnamese definitions each (most common first) and 1-2 short examples for each part of speech. If the input is a phrase or a different form of a word, explain that exact input.';
SYSTEM.meaning =
    'Explain a text to a reader of $to. Reply in $to, short, in exactly this order and format (translate the three labels into $to if $to is not Vietnamese):\n' +
    'Nghĩa tổng quát: <one or two sentences: what it really means or implies, and its tone>\n' +
    'Dịch sát nghĩa: <a close, faithful translation>\n' +
    'Giải nghĩa:\n' +
    '• <word or phrase>: <short meaning, slang / idiom / nuance>\n' +
    'In Giải nghĩa list only the 2-5 words or phrases a learner could miss (idioms, slang, abbreviations, references, wordplay); leave the section out when there are none. ' +
    'For a single word: its main meaning in Nghĩa tổng quát, the closest equivalent in Dịch sát nghĩa, and other senses in Giải nghĩa. ' +
    'Each line short. No markdown, no asterisks, no headings, nothing else.';
SYSTEM.chat =
    'You turn any text, in any language, into natural casual English for chatting (Slack, Discord, texting). Sound like a friendly native speaker: everyday words, contractions, relaxed tone, light common slang where it fits, emojis only if the original has them. Keep the meaning, names, numbers and line breaks; keep it about the same length. If the text is already English, just make it sound casual and natural. Output only the English text: no quotes, no notes, no explanations.';
SYSTEM.reply =
    'You suggest replies to a chat message (Slack, Discord, texting). Write 3 different short replies in natural, casual English, like a friendly native speaker at work: one that agrees or answers positively, one that asks a follow-up or clarifies, one that politely declines or pushes back. Match the tone of the message; keep each reply to one or two sentences. Output exactly 3 lines, one reply per line, nothing else: no numbers, no labels, no quotes.';
const USER = {
    reply: 'Message:\n"""\n$text\n"""',
    chat: 'Rewrite as casual chat English:\n"""\n$text\n"""',
    meaning: 'Explain the meaning of:\n"""\n$text\n"""',
    dict: 'Word: """$text"""',
    polish: 'Polish this text:\n"""\n$text\n"""',
    explain: 'Explain the word/phrase:\n"""\n$text\n"""',
    rewrite: 'Proofread and rewrite this text:\n"""\n$text\n"""',
    summarize: 'Summarize into $to:\n"""\n$text\n"""',
};

// ---- AI buttons of the translate window (Config > AI buttons) ---------------------------------
// Stored as a list under MODES_KEY. Built-in buttons keep `builtin` (their id) so the name can
// follow the app language until the user renames them, and so they can be reset.
export const MODES_KEY = 'translate_ai_modes';
// [id, icon, hotkey/toolbar action, results are a list of choices]
const BUILTIN = [
    ['chat', 'message', 'replace'],
    ['reply', 'zap', 'popup', true],
    ['polish', 'sparkles', 'replace'],
    ['rewrite', 'spellcheck', 'replace'],
    ['summarize', 'list', 'popup'],
    ['meaning', 'book', 'popup'],
];

// A button: name / icon / prompts; enabled (shown in the translate window), toolbar (shown on
// the selection toolbar), hotkey (global shortcut), action ('replace': paste over the selection,
// 'popup': open the translate window with this button on), list (each result line is a choice).
export function builtinMode(id) {
    const [, icon, action, list] = BUILTIN.find((b) => b[0] === id) ?? [id, 'sparkles', 'popup', false];
    return {
        id,
        builtin: id,
        name: '',
        icon,
        system: SYSTEM[id] ?? '',
        user: USER[id] ?? '$text',
        enabled: true,
        toolbar: false,
        hotkey: '',
        action,
        list: !!list,
    };
}

// Fill fields added in later versions; add built-in buttons the saved list doesn't have yet
export function normalizeModes(modes) {
    if (!Array.isArray(modes)) return defaultModes();
    const out = modes.map((m) => {
        const base = m.builtin ? builtinMode(m.builtin) : { toolbar: false, hotkey: '', action: 'popup', list: false };
        return { ...base, ...m };
    });
    for (const [id] of BUILTIN) {
        if (!out.some((m) => m.builtin === id)) {
            const at = BUILTIN.findIndex((b) => b[0] === id);
            out.splice(Math.min(at, out.length), 0, builtinMode(id));
        }
    }
    return out;
}

export function defaultModes() {
    return BUILTIN.map(([id]) => builtinMode(id));
}

export function newModeId() {
    return `custom_${Date.now().toString(36)}`;
}

export function modeSupported(serviceName, mode) {
    return mode === 'translate' || LLM_SERVICES.includes(serviceName);
}

// Returns the service config with the prompts of `mode` (an AI button, or 'dict' / 'explain'
// for the dictionary). `modes`: the user's AI buttons; built-in prompts are the fallback.
export function applyMode(serviceName, config, mode, modes = null) {
    if (mode === 'translate' || !LLM_SERVICES.includes(serviceName)) return config;
    const custom = Array.isArray(modes) ? modes.find((m) => m.id === mode) : null;
    const system = custom?.system ?? SYSTEM[mode] ?? '';
    const user = custom?.user?.trim() ? custom.user : USER[mode] ?? '$text';
    const promptList =
        serviceName === 'geminipro'
            ? [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }]
            : [
                  { role: 'system', content: system },
                  { role: 'user', content: user },
              ];
    return { ...config, systemPrompt: system, userPrompt: user, promptList };
}
