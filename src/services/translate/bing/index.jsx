import { fetch } from '@tauri-apps/api/http';

// Official Microsoft Translator API with the user's own Azure key (free tier F0).
async function translateWithKey(text, from, to, key, region) {
    const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };
    if (region) headers['Ocp-Apim-Subscription-Region'] = region;
    const query = { 'api-version': '3.0', to };
    if (from) query.from = from;
    const res = await fetch('https://api.cognitive.microsofttranslator.com/translate', {
        method: 'POST',
        headers,
        query,
        body: { type: 'Json', payload: [{ Text: text }] },
    });
    if (res.ok && res.data?.[0]?.translations) {
        return res.data[0].translations[0].text.trim();
    }
    throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
}

export async function translate(text, from, to, options = {}) {
    const config = options.config ?? {};
    if (config.key && config.key.trim()) {
        return translateWithKey(text, from, to, config.key.trim(), (config.region ?? '').trim());
    }

    const token_url = 'https://edge.microsoft.com/translate/auth';

    let token = await fetch(token_url, {
        method: 'GET',
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.42',
        },
        responseType: 2,
    });

    if (token.ok) {
        const url = 'https://api-edge.cognitive.microsofttranslator.com/translate';

        let res = await fetch(url, {
            method: 'POST',
            headers: {
                accept: '*/*',
                'accept-language': 'zh-TW,zh;q=0.9,ja;q=0.8,zh-CN;q=0.7,en-US;q=0.6,en;q=0.5',
                authorization: 'Bearer ' + token.data,
                'cache-control': 'no-cache',
                'content-type': 'application/json',
                pragma: 'no-cache',
                'sec-ch-ua': '"Microsoft Edge";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                Referer: 'https://appsumo.com/',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.42',
            },
            query: {
                from: from,
                to: to,
                'api-version': '3.0',
                includeSentenceLength: 'true',
            },
            body: { type: 'Json', payload: [{ Text: text }] },
        });

        if (res.ok) {
            let result = res.data;
            if (result[0].translations) {
                return result[0].translations[0].text.trim();
            } else {
                throw JSON.stringify(result);
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    } else {
        throw 'Microsoft đã đóng cổng dịch Bing miễn phí (Get Token Failed). Mở Cài đặt > Dịch vụ > Bing và thêm khóa Azure Translator miễn phí, hoặc dùng Google / dịch vụ AI.';
    }
}

export * from './Config';
export * from './info';
