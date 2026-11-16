// Hover translate overlay (src-tauri/src/hover.rs): shows the translation of the text under the
// cursor, drawn over it ("replace") or just under it ("below"), in a window that never takes focus.
import React, { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api';

import { translateForPaste } from '../SelToolbar';

const cache = new Map();

// readable text colour for a background
function textColor(bg) {
    const n = parseInt(bg.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#f3f3f3';
}

export default function HoverTranslate() {
    const [item, setItem] = useState(null); // {text, mode, bg, width, height}
    const [result, setResult] = useState('');
    const [failed, setFailed] = useState(false);
    const boxRef = useRef();
    const seq = useRef(0);

    useEffect(() => {
        document.body.style.background = 'transparent';
        const un = listen('hover_translate', async ({ payload }) => {
            const id = ++seq.current;
            setItem(payload);
            setFailed(false);
            const key = payload.text;
            if (cache.has(key)) {
                setResult(cache.get(key));
                return;
            }
            setResult('');
            try {
                const out = await translateForPaste(payload.text);
                cache.set(key, out);
                if (id === seq.current) setResult(out);
            } catch (e) {
                if (id === seq.current) {
                    setFailed(true);
                    setResult(String(e?.message ?? e));
                }
            }
        });
        return () => {
            un.then((f) => f());
        };
    }, []);

    // grow the window when the translation is taller than the original text
    useEffect(() => {
        if (!boxRef.current || !result) return;
        const h = Math.ceil(boxRef.current.scrollHeight * window.devicePixelRatio);
        invoke('hover_translate_resize', { height: h }).catch(() => {});
    }, [result, item]);

    if (!item) return null;
    const fg = textColor(item.bg);
    // font size from the height of the original line(s), within reason
    const lines = Math.max(1, Math.round(item.height / 22));
    const fontPx = Math.max(11, Math.min(20, Math.round((item.height / lines) * 0.68)));
    const below = item.mode === 'below';

    return (
        <div
            ref={boxRef}
            onMouseDown={() => invoke('hover_translate_hide')}
            style={{
                width: '100vw',
                minHeight: '100vh',
                boxSizing: 'border-box',
                background: item.bg,
                color: below ? fg : fg,
                opacity: below ? 0.96 : 1,
                font: `${fontPx}px/1.35 "Segoe UI", Inter, sans-serif`,
                padding: below ? '3px 6px' : '0 2px',
                display: 'flex',
                alignItems: 'center',
                borderLeft: below ? '3px solid #bff03a' : 'none',
                borderRadius: below ? 4 : 0,
                userSelect: 'none',
                cursor: 'default',
                overflow: 'hidden',
            }}
        >
            <span style={{ opacity: result ? 1 : 0.55, color: failed ? '#e5484d' : undefined }}>{result || '…'}</span>
        </div>
    );
}
