import React, { useEffect, useState, useRef } from 'react';
import { appCacheDir, join } from '@tauri-apps/api/path';
import { currentMonitor } from '@tauri-apps/api/window';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { warn } from 'tauri-plugin-log-api';
import { invoke } from '@tauri-apps/api';
import { useTranslation } from 'react-i18next';

import { store } from '../../utils/store';

// Options live in Config > Screenshot (screenshot_* keys)
const DEFAULT_OPTIONS = {
    crosshair: true,
    magnifier: false,
    size: false,
    handles: false,
    detect: false,
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAG = { src: 15, zoom: 8 }; // 15x15 pixels shown 8x
const MIN_DRAG = 4;

const norm = (a) => ({
    l: Math.min(a.l, a.r),
    t: Math.min(a.t, a.b),
    r: Math.max(a.l, a.r),
    b: Math.max(a.t, a.b),
});

export default function Screenshot() {
    const { t } = useTranslation();
    const [imgurl, setImgurl] = useState('');
    const [opts, setOpts] = useState(DEFAULT_OPTIONS);
    const [phase, setPhase] = useState('idle'); // idle | drag | adjust
    const [rect, setRect] = useState(null); // css px {l,t,r,b}
    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const [windows, setWindows] = useState([]); // css px rects, top to bottom
    const [hover, setHover] = useState(null);

    const imgRef = useRef();
    const magRef = useRef();
    const monitorRef = useRef(null);
    const drag = useRef(null); // { type, startX, startY, orig }

    // ---- setup ------------------------------------------------------------------------------------
    useEffect(() => {
        (async () => {
            const o = { ...DEFAULT_OPTIONS };
            for (const k of Object.keys(DEFAULT_OPTIONS)) {
                const v = await store.get(`screenshot_${k}`);
                if (typeof v === 'boolean') o[k] = v;
            }
            setOpts(o);
            const monitor = await currentMonitor();
            monitorRef.current = monitor;
            const position = monitor.position;
            await invoke('screenshot', { x: position.x, y: position.y });
            const dir = await appCacheDir();
            setImgurl(convertFileSrc(await join(dir, 'pot_screenshot.png')));
        })();
    }, []);

    // physical pixels per css pixel, from the captured image
    const dpi = () => imgRef.current.naturalWidth / screen.width;

    const loadWindows = async () => {
        if (!opts.detect) return;
        try {
            const list = await invoke('list_windows');
            const m = monitorRef.current.position;
            const d = dpi();
            setWindows(
                list
                    .map((w) => ({
                        l: (w.x - m.x) / d,
                        t: (w.y - m.y) / d,
                        r: (w.x + w.w - m.x) / d,
                        b: (w.y + w.h - m.y) / d,
                    }))
                    .filter((w) => w.r > 0 && w.b > 0 && w.l < screen.width && w.t < screen.height)
            );
        } catch (e) {
            warn(`list_windows failed: ${e}`);
        }
    };

    // ---- finish / cancel ----------------------------------------------------------------------------
    const finish = async (r) => {
        const n = norm(r);
        appWindow.hide();
        const d = dpi();
        const left = Math.floor(n.l * d);
        const top = Math.floor(n.t * d);
        const width = Math.floor(n.r * d) - left;
        const height = Math.floor(n.b * d) - top;
        if (width <= 0 || height <= 0) {
            warn('Screenshot area is too small');
            await appWindow.close();
        } else {
            await invoke('cut_image', { left, top, width, height });
            await emit('success');
            await appWindow.close();
        }
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                void appWindow.close();
            } else if (e.key === 'Enter' && phase === 'adjust' && rect) {
                void finish(rect);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // ---- mouse ----------------------------------------------------------------------------------
    const clampX = (x) => Math.max(0, Math.min(screen.width, x));
    const clampY = (y) => Math.max(0, Math.min(screen.height, y));

    const startHandle = (e, type) => {
        e.stopPropagation();
        if (e.buttons !== 1) return;
        drag.current = { type, startX: e.clientX, startY: e.clientY, orig: norm(rect) };
    };

    const onMouseDown = (e) => {
        if (e.buttons !== 1) {
            void appWindow.close();
            return;
        }
        if (phase === 'adjust') return; // handled by the box and its handles
        drag.current = { type: 'new', startX: e.clientX, startY: e.clientY };
        setRect({ l: e.clientX, t: e.clientY, r: e.clientX, b: e.clientY });
        setPhase('drag');
    };

    const onMouseMove = (e) => {
        const x = e.clientX;
        const y = e.clientY;
        setCursor({ x, y });
        const dr = drag.current;
        if (!dr) {
            if (opts.detect && phase === 'idle') {
                setHover(windows.find((w) => x >= w.l && x <= w.r && y >= w.t && y <= w.b) ?? null);
            }
            return;
        }
        if (dr.type === 'new') {
            setRect({ l: dr.startX, t: dr.startY, r: clampX(x), b: clampY(y) });
            return;
        }
        const dx = x - dr.startX;
        const dy = y - dr.startY;
        let { l, t, r, b } = dr.orig;
        if (dr.type === 'move') {
            const w = r - l;
            const h = b - t;
            l = Math.max(0, Math.min(screen.width - w, l + dx));
            t = Math.max(0, Math.min(screen.height - h, t + dy));
            r = l + w;
            b = t + h;
        } else {
            if (dr.type.includes('w')) l = clampX(l + dx);
            if (dr.type.includes('e')) r = clampX(r + dx);
            if (dr.type.includes('n')) t = clampY(t + dy);
            if (dr.type.includes('s')) b = clampY(b + dy);
        }
        setRect({ l, t, r, b });
    };

    const onMouseUp = async (e) => {
        const dr = drag.current;
        drag.current = null;
        if (!dr) return;
        if (dr.type !== 'new') return; // moved / resized: stay in adjust mode
        const moved = Math.abs(e.clientX - dr.startX) >= MIN_DRAG || Math.abs(e.clientY - dr.startY) >= MIN_DRAG;
        // a click on a detected window takes that window
        if (!moved && opts.detect && hover) {
            const r = { ...hover };
            if (opts.handles) {
                setRect(r);
                setPhase('adjust');
            } else {
                await finish(r);
            }
            return;
        }
        const r = { l: dr.startX, t: dr.startY, r: clampX(e.clientX), b: clampY(e.clientY) };
        if (opts.handles && moved) {
            setRect(r);
            setPhase('adjust');
        } else {
            await finish(r);
        }
    };

    // ---- magnifier ----------------------------------------------------------------------------------
    useEffect(() => {
        if (!opts.magnifier || !magRef.current || !imgRef.current || !imgRef.current.complete) return;
        const ctx = magRef.current.getContext('2d');
        const d = dpi();
        const px = Math.floor(cursor.x * d);
        const py = Math.floor(cursor.y * d);
        const half = Math.floor(MAG.src / 2);
        const size = MAG.src * MAG.zoom;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(imgRef.current, px - half, py - half, MAG.src, MAG.src, 0, 0, size, size);
        // the pixel under the cursor
        ctx.strokeStyle = '#bff03a';
        ctx.lineWidth = 1;
        ctx.strokeRect(half * MAG.zoom + 0.5, half * MAG.zoom + 0.5, MAG.zoom - 1, MAG.zoom - 1);
    }, [cursor, opts.magnifier]);

    // ---- render ------------------------------------------------------------------------------------
    const n = rect ? norm(rect) : null;
    const showRect = n && (phase === 'adjust' || (phase === 'drag' && n.r - n.l + (n.b - n.t) > 0));
    const sizeText = (() => {
        if (!n || !imgRef.current?.complete) return '';
        const d = dpi();
        return `${Math.round((n.r - n.l) * d)} × ${Math.round((n.b - n.t) * d)}`;
    })();
    const magSize = MAG.src * MAG.zoom;
    const magLeft = cursor.x + 24 + magSize > screen.width ? cursor.x - 24 - magSize : cursor.x + 24;
    const magTop = cursor.y + 24 + magSize + 28 > screen.height ? cursor.y - 24 - magSize - 28 : cursor.y + 24;
    const handlePos = (h) => {
        const cx = (n.l + n.r) / 2;
        const cy = (n.t + n.b) / 2;
        return {
            left: (h.includes('w') ? n.l : h.includes('e') ? n.r : cx) - 5,
            top: (h.includes('n') ? n.t : h.includes('s') ? n.b : cy) - 5,
            cursor: { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' }[h] + '-resize',
        };
    };

    return (
        <>
            <img
                ref={imgRef}
                className='fixed top-0 left-0 w-full select-none'
                src={imgurl}
                draggable={false}
                onLoad={() => {
                    if (imgurl !== '' && imgRef.current.complete) {
                        void appWindow.show();
                        void appWindow.setFocus();
                        void appWindow.setResizable(false);
                        void loadWindows();
                    }
                }}
            />

            {/* dim everything outside the selection */}
            {showRect && (
                <div
                    className='fixed pointer-events-none'
                    style={{
                        left: n.l,
                        top: n.t,
                        width: n.r - n.l,
                        height: n.b - n.t,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                        border: '1px solid #38bdf8',
                    }}
                />
            )}

            {/* window under the cursor */}
            {opts.detect && phase === 'idle' && hover && (
                <div
                    className='fixed pointer-events-none'
                    style={{
                        left: hover.l,
                        top: hover.t,
                        width: hover.r - hover.l,
                        height: hover.b - hover.t,
                        background: 'rgba(56,189,248,0.15)',
                        border: '2px solid #38bdf8',
                    }}
                />
            )}

            {/* crosshair guides */}
            {opts.crosshair && phase !== 'adjust' && (
                <>
                    <div
                        className='fixed pointer-events-none'
                        style={{ left: 0, right: 0, top: cursor.y, height: 1, background: 'rgba(56,189,248,0.7)' }}
                    />
                    <div
                        className='fixed pointer-events-none'
                        style={{ top: 0, bottom: 0, left: cursor.x, width: 1, background: 'rgba(56,189,248,0.7)' }}
                    />
                </>
            )}

            {/* selection size */}
            {opts.size && showRect && (
                <div
                    className='fixed pointer-events-none text-[12px] leading-none px-[6px] py-[4px] rounded bg-black/75 text-white'
                    style={{ left: n.l, top: n.t > 28 ? n.t - 26 : n.t + 4 }}
                >
                    {sizeText}
                </div>
            )}

            {/* hit area: new selection */}
            <div
                className='fixed top-0 left-0 bottom-0 right-0 cursor-crosshair select-none'
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
            />

            {/* adjust mode: move box, 8 handles, hint */}
            {phase === 'adjust' && n && (
                <>
                    <div
                        className='fixed select-none'
                        style={{ left: n.l, top: n.t, width: n.r - n.l, height: n.b - n.t, cursor: 'move' }}
                        onMouseDown={(e) => startHandle(e, 'move')}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onDoubleClick={() => finish(rect)}
                    />
                    {HANDLES.map((h) => {
                        const p = handlePos(h);
                        return (
                            <div
                                key={h}
                                className='fixed select-none'
                                style={{
                                    left: p.left,
                                    top: p.top,
                                    width: 10,
                                    height: 10,
                                    background: '#fff',
                                    border: '1px solid #38bdf8',
                                    borderRadius: 2,
                                    cursor: p.cursor,
                                }}
                                onMouseDown={(e) => startHandle(e, h)}
                                onMouseMove={onMouseMove}
                                onMouseUp={onMouseUp}
                            />
                        );
                    })}
                    <div
                        className='fixed pointer-events-none text-[12px] px-[8px] py-[5px] rounded bg-black/75 text-white'
                        style={{ left: n.l, top: n.b + 8 > screen.height - 30 ? n.b - 30 : n.b + 8 }}
                    >
                        {t('screenshot.adjust_hint')}
                    </div>
                </>
            )}

            {/* magnifier */}
            {opts.magnifier && phase !== 'adjust' && (
                <div
                    className='fixed pointer-events-none rounded overflow-hidden shadow-lg'
                    style={{ left: magLeft, top: magTop, width: magSize, border: '2px solid #bff03a', background: '#000' }}
                >
                    <canvas
                        ref={magRef}
                        width={magSize}
                        height={magSize}
                        style={{ width: magSize, height: magSize, display: 'block' }}
                    />
                    <div className='text-[11px] leading-none text-center text-white bg-black/80 py-[6px]'>
                        {Math.round(cursor.x * (imgRef.current?.complete && imgRef.current.naturalWidth ? dpi() : 1))},{' '}
                        {Math.round(cursor.y * (imgRef.current?.complete && imgRef.current.naturalWidth ? dpi() : 1))}
                    </div>
                </div>
            )}
        </>
    );
}
