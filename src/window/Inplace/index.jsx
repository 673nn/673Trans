// In-place translation (src-tauri/src/inplace.rs): the translation drawn over a read-only
// selection, matching its position, font size and colours. Click it, click anywhere,
// scroll or press Esc to close.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api';

import './fonts/fonts.css';

// CSS font stack for the font the app reported. Chromium apps report their CSS list
// ("Slack-Lato, Slack-Fractions, appleLogo, sans-serif"); their web fonts aren't installed,
// so the known ones map to the bundled copies (./fonts).
function fontStack(name) {
    const list = (name || '')
        .split(',')
        .map((f) => f.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    const out = [];
    for (const f of list) {
        const low = f.toLowerCase();
        if (low.includes('lato')) out.push('Lato');
        else if (low.includes('roboto') || low.includes('google sans') || low.includes('product sans')) out.push('Roboto');
        else if (low === 'inter' || low.includes('inter var')) out.push('Inter Variable', 'Inter');
        else if (!['sans-serif', 'serif', 'system-ui', 'applelogo'].includes(low)) out.push(f);
    }
    out.push('Segoe UI', 'sans-serif');
    return [...new Set(out)].map((f) => (f === 'sans-serif' ? f : `"${f}"`)).join(', ');
}

function contrast(bg) {
    const n = parseInt((bg || '#ffffff').slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#f2f2f2';
}

export default function Inplace() {
    const [data, setData] = useState(null); // {probe, result}
    const textRef = useRef();

    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        const un = listen('inplace_show', ({ payload }) => setData(payload));
        return () => {
            un.then((f) => f());
        };
    }, []);

    const [fontPx, setFontPx] = useState(null);

    // Fit the translation in the original lines: shrink the font a little if that is enough,
    // otherwise keep the size and grow the window downwards. Measured once the font is loaded.
    useLayoutEffect(() => {
        if (!data || !textRef.current) return;
        let alive = true;
        const p = data.probe;
        const el = textRef.current;
        const fit = () => {
            if (!alive) return;
            const room = p.height + 2;
            let size = p.font_px;
            el.style.fontSize = `${size}px`;
            while (el.offsetTop + el.scrollHeight > room && size > p.font_px * 0.8) {
                size -= 0.5;
                el.style.fontSize = `${size}px`;
            }
            if (el.offsetTop + el.scrollHeight > room) size = p.font_px;
            el.style.fontSize = `${size}px`;
            setFontPx(size);
            const height = Math.max(p.height, el.offsetTop + el.scrollHeight + 2);
            invoke('inplace_resize', { width: p.width, height }).catch(() => {});
        };
        document.fonts.ready.then(fit);
        return () => {
            alive = false;
        };
    }, [data]);

    if (!data) return null;
    const p = data.probe;
    const bg = p.bg || '#ffffff';
    const fg = p.fg && p.fg !== bg ? p.fg : contrast(bg);
    const first = p.lines[0] ?? { x: 0, y: 0, h: p.height };
    const lineH = p.lines.reduce((s, l) => s + l.h, 0) / Math.max(1, p.lines.length);
    const family = fontStack(p.font_name);

    return (
        <div
            onMouseDown={() => invoke('inplace_hide')}
            style={{ position: 'relative', width: '100vw', height: '100vh', cursor: 'default', userSelect: 'none' }}
        >
            {/* hide the original lines (and the selection highlight) */}
            {p.lines.map((l, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        left: Math.max(0, l.x - 1),
                        top: Math.max(0, l.y - 1),
                        width: l.w + 2,
                        height: l.h + 3,
                        background: bg,
                    }}
                />
            ))}
            <div
                ref={textRef}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: first.y,
                    width: p.width,
                    textIndent: first.x,
                    color: fg,
                    font: `${p.font_weight >= 600 ? 700 : 400} ${fontPx ?? p.font_px}px/${Math.max(lineH, p.font_px * 1.2)}px ${family}`,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                }}
            >
                {/* inline background: covers exactly the lines the translation uses */}
                <span style={{ background: bg, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                    {data.result}
                </span>
            </div>
        </div>
    );
}
