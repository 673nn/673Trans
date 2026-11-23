// DeepSeek: OpenAI compatible chat completions API
import { translate as openaiTranslate } from '../openai';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT, cleanResult, llmArgs } from '../_llm/prompt';

export const DEFAULT_REQUEST_PATH = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_MODEL = 'deepseek-v4-flash';

export async function translate(text, from, to, options = {}) {
    const { config } = options;
    const result = await openaiTranslate(text, from, to, {
        ...options,
        config: {
            service: 'openai',
            requestPath: config.requestPath || DEFAULT_REQUEST_PATH,
            model: config.model || DEFAULT_MODEL,
            apiKey: config.apiKey,
            stream: config.stream ?? true,
            promptList: [
                { role: 'system', content: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
                { role: 'user', content: config.userPrompt ?? DEFAULT_USER_PROMPT },
            ],
            requestArguments: JSON.stringify(llmArgs(config, { thinking: true })),
            timeout: config.timeout,
        },
    });
    return typeof result === 'string' ? cleanResult(result) : result;
}

// Account balance: GET /user/balance on the same host as the API URL
export async function balance(config) {
    const base = new URL(config.requestPath || DEFAULT_REQUEST_PATH).origin;
    const res = await window.fetch(`${base}/user/balance`, {
        headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw `Http ${res.status} ${JSON.stringify(data)}`;
    const infos = data.balance_infos ?? [];
    if (infos.length === 0) return data.is_available ? 'OK' : '0';
    return infos.map((b) => `${b.total_balance} ${b.currency}`).join(' · ');
}

export * from './Config';
export * from './info';
