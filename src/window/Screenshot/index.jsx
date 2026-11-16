import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { appCacheDir, join } from '@tauri-apps/api/path';
import { currentMonitor } from '@tauri-apps/api/window';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { warn } from 'tauri-plugin-log-api';
import { invoke } from '@tauri-apps/api';
import { useTranslation } from 'react-i18next';
import {
    LuMousePointer2,
    LuPencil,
    LuHighlighter,
    LuMoveUpRight,
    LuSquare,
    LuCircle,
    LuType,
    LuGrid,
    LuUndo2,
    LuRedo2,
    LuScanLine,
    LuLanguages,
    LuDownload,
    LuCopy,
    LuX,
    LuCheck,
} from 'react-icons/lu';

import { store } from '../../utils/store';
import { drawShape, exportImage, PRESET_COLORS } from './draw';

// Options live in Config > Screenshot (screenshot_* keys)
const DEFAULTS = {
    crosshair: true,
    magnifier: false,
    size: false,
    handles: false,
    detect: false,
    editor: false, // also show the editor for the OCR / image translate hotkeys
    color: '#ff3b30',
    stroke: 3,
    font: 20,
    format: 'png',
    copy_file: false,
    close_after: true,
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAG = { src: 15, zoom: 8 }; // 15x15 pixels shown 8x
const MIN_DRAG = 4;
const TOOLS = [
    ['move', LuMousePointer2],
    ['pen', LuPencil],
    ['marker', LuHighlighter],
    ['arrow', LuMoveUpRight],
    ['rect', LuSquare],
    ['ellipse', LuCircle],
    ['text', LuType],
    ['mosaic', LuGrid],
];

const norm = (a) => ({
    l: Math.min(a.l, a.r),
    t: Math.min(a.t, a.b),
    r: Math.max(a.l, a.r),
    b: Math.max(a.t, a.b),
});

const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
        d.getSeconds()
    )}`;
};

export default function Screenshot() {
    const { t } = useTranslation();
    const [imgurl, setImgurl] = useState('');
    const [opts, setOpts] = useState(DEFAULTS);
    const [mode, setMode] = useState('recognize');
    const [phase, setPhase] = useState('idle'); // idle | drag | adjust | edit
    const [rect, setRect] = useState(null); // css px {l,t,r,b}
    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const [windows, setWindows] = useState([]);
    const [hover, setHover] = useState(null);
    // editor
    const [tool, setTool] = useState('move');
    const [color, setColor] = useState(DEFAULTS.color);
    const [stroke, setStroke] = useState(DEFAULTS.stroke);
    const [font, setFont] = useState(DEFAULTS.font);
    const [shapes, setShapes] = useState([]);
    const [redo, setRedo] = useState([]);
    const [current, setCurrent] = useState(null); // shape being drawn
    const [textEdit, setTextEdit] = useState(null); // {x, y, value}
    const [notice, setNotice] = useState('');
    const [tbSize, setTbSize] = useState({ w: 640, h: 80 });

    const imgRef = useRef();
    const magRef = useRef();
    const canvasRef = useRef();
    const tbRef = useRef();
    const monitorRef = useRef(null);
    const drag = useRef(null);
    const busy = useRef(false);

    // ---- setup ------------------------------------------------------------------------------------
    useEffect(() => {
        (async () => {
            const o = { ...DEFAULTS };
            for (const k of Object.keys(DEFAULTS)) {
                const v = await store.get(`screenshot_${k}`);
                if (v !== null && v !== undefined && typeof v === typeof DEFAULTS[k]) o[k] = v;
            }
            setOpts(o);
            setColor(o.color);
            setStroke(o.stroke);
            setFont(o.font);
            try {
                setMode(await invoke('get_screenshot_mode'));
            } catch {
                // keep default
            }
            const monitor = await currentMonitor();
            monitorRef.current = monitor;
            const position = monitor.position;
            await invoke('screenshot', { x: position.x, y: position.y });
            const dir = await appCacheDir();
            setImgurl(convertFileSrc(await join(dir, 'pot_screenshot.png')));
        })();
    }, []);

    const imgReady = () => imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0;
    // physical pixels per css pixel, from the captured image
    const dpi = () => (imgReady() ? imgRef.current.naturalWidth / screen.width : window.devicePixelRatio || 1);
    const editorOn = mode === 'capture' || opts.editor;

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

    // ---- finish (no editor): same as before, cut on the Rust side --------------------------------
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

    // ---- editor actions ---------------------------------------------------------------------------
    const flash = (text) => {
        setNotice(text);
        setTimeout(() => setNotice(''), 1600);
    };
    const exportSel = (type = 'png') => exportImage(imgRef.current, dpi(), norm(rect), shapes, type);

    const doCopy = async () => {
        if (busy.current) return;
        busy.current = true;
        try {
            await invoke('copy_capture', {
                data: exportSel('png'),
                name: `673Trans_${stamp()}.png`,
                asFile: opts.copy_file,
            });
            if (opts.close_after) await appWindow.close();
            else flash(t('screenshot.copied'));
        } catch (e) {
            flash(String(e));
        }
        busy.current = false;
    };

    const doSave = async () => {
        if (busy.current) return;
        busy.current = true;
        const ext = opts.format === 'jpg' ? 'jpg' : 'png';
        const data = exportSel(ext);
        await appWindow.hide(); // the Save dialog must not open behind this full-screen window
        try {
            const path = await invoke('save_capture', { data, name: `673Trans_${stamp()}.${ext}` });
            if (path && opts.close_after) {
                await appWindow.close();
            } else {
                await appWindow.show();
                await appWindow.setFocus();
                if (path) flash(t('screenshot.saved'));
            }
        } catch (e) {
            await appWindow.show();
            flash(String(e));
        }
        busy.current = false;
    };

    const doAction = async (action) => {
        if (busy.current) return;
        busy.current = true;
        const data = exportSel('png');
        await appWindow.hide();
        try {
            await invoke('write_capture_cut', { data });
            await invoke('screenshot_action', { action });
        } catch (e) {
            warn(`screenshot action failed: ${e}`);
        }
        await appWindow.close();
    };

    const doDone = () => {
        if (mode === 'capture') return doCopy();
        return doAction(mode);
    };

    const undo = () => {
        if (!shapes.length) return;
        setRedo([...redo, shapes[shapes.length - 1]]);
        setShapes(shapes.slice(0, -1));
    };
    const redoIt = () => {
        if (!redo.length) return;
        setShapes([...shapes, redo[redo.length - 1]]);
        setRedo(redo.slice(0, -1));
    };

    const commitText = () => {
        if (textEdit && textEdit.value.trim()) {
            setShapes([...shapes, { type: 'text', x: textEdit.x, y: textEdit.y, text: textEdit.value, color, size: font }]);
            setRedo([]);
        }
        setTextEdit(null);
    };

    // ---- keyboard ----------------------------------------------------------------------------------
    useEffect(() => {
        const onKey = (e) => {
            if (textEdit) return; // the text box handles its own keys
            const ctrl = e.ctrlKey || e.metaKey;
            if (e.key === 'Escape') {
                void appWindow.close();
            } else if (e.key === 'Enter' && phase === 'adjust' && rect) {
                void finish(rect);
            } else if (phase === 'edit') {
                if (e.key === 'Enter') void doDone();
                else if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) undo();
                else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) redoIt();
                else if (ctrl && e.key.toLowerCase() === 'c') void doCopy();
                else if (ctrl && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    void doSave();
                } else return;
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // ---- mouse: selection -------------------------------------------------------------------------
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
        if (phase === 'adjust' || phase === 'edit') return;
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

    const afterSelect = async (r) => {
        if (editorOn) {
            setRect(norm(r));
            setPhase('edit');
        } else if (opts.handles) {
            setRect(r);
            setPhase('adjust');
        } else {
            await finish(r);
        }
    };

    const onMouseUp = async (e) => {
        const dr = drag.current;
        drag.current = null;
        if (!dr) return;
        if (dr.type !== 'new') {
            setRect((r) => norm(r));
            return; // moved / resized: stay where we are
        }
        const moved = Math.abs(e.clientX - dr.startX) >= MIN_DRAG || Math.abs(e.clientY - dr.startY) >= MIN_DRAG;
        if (!moved && opts.detect && hover) {
            await afterSelect({ ...hover });
            return;
        }
        if (!moved) {
            // a plain click without window detection: nothing selected yet
            if (editorOn || opts.handles) {
                setPhase('idle');
                setRect(null);
                return;
            }
        }
        await afterSelect({ l: dr.startX, t: dr.startY, r: clampX(e.clientX), b: clampY(e.clientY) });
    };

    // ---- mouse: drawing ----------------------------------------------------------------------------
    const inside = (x, y) => {
        const n = norm(rect);
        return x >= n.l && x <= n.r && y >= n.t && y <= n.b;
    };

    const drawDown = (e) => {
        if (e.button === 2) {
            void appWindow.close();
            return;
        }
        if (e.button !== 0) return;
        const x = e.clientX;
        const y = e.clientY;
        if (!inside(x, y)) return;
        if (tool === 'text') {
            e.preventDefault(); // keep focus in the text box that is about to open
            if (textEdit) commitText();
            else setTextEdit({ x, y, value: '' });
            return;
        }
        if (tool === 'pen' || tool === 'marker') {
            setCurrent({ type: tool, points: [[x, y]], color, size: stroke });
        } else {
            setCurrent({ type: tool, x1: x, y1: y, x2: x, y2: y, color, size: stroke });
        }
    };

    const drawMove = (e) => {
        setCursor({ x: e.clientX, y: e.clientY });
        if (!current) return;
        const x = e.clientX;
        const y = e.clientY;
        if (current.points) setCurrent({ ...current, points: [...current.points, [x, y]] });
        else {
            let x2 = x;
            let y2 = y;
            if (e.shiftKey && (current.type === 'rect' || current.type === 'ellipse')) {
                const s = Math.max(Math.abs(x - current.x1), Math.abs(y - current.y1));
                x2 = current.x1 + Math.sign(x - current.x1 || 1) * s;
                y2 = current.y1 + Math.sign(y - current.y1 || 1) * s;
            }
            setCurrent({ ...current, x2, y2 });
        }
    };

    const drawUp = () => {
        if (!current) return;
        const tiny = !current.points && Math.abs(current.x2 - current.x1) < 2 && Math.abs(current.y2 - current.y1) < 2;
        if (!tiny) {
            setShapes([...shapes, current]);
            setRedo([]);
        }
        setCurrent(null);
    };

    // ---- annotation canvas ------------------------------------------------------------------------
    useEffect(() => {
        const c = canvasRef.current;
        if (!c || phase !== 'edit' || !rect) return;
        const d = dpi();
        const w = Math.round(screen.width * d);
        const h = Math.round(screen.height * d);
        if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
        }
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.scale(d, d);
        const n = norm(rect);
        ctx.save();
        ctx.beginPath();
        ctx.rect(n.l, n.t, n.r - n.l, n.b - n.t);
        ctx.clip();
        [...shapes, ...(current ? [current] : [])].forEach((s) => drawShape(ctx, s, imgRef.current, d));
        ctx.restore();
    }, [shapes, current, rect, phase]);

    // ---- magnifier ----------------------------------------------------------------------------------
    useEffect(() => {
        if (!opts.magnifier || !magRef.current || !imgReady()) return;
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
        ctx.strokeStyle = '#bff03a';
        ctx.lineWidth = 1;
        ctx.strokeRect(half * MAG.zoom + 0.5, half * MAG.zoom + 0.5, MAG.zoom - 1, MAG.zoom - 1);
    }, [cursor, opts.magnifier]);

    useLayoutEffect(() => {
        if (tbRef.current) {
            const w = tbRef.current.offsetWidth;
            const h = tbRef.current.offsetHeight;
            if (w !== tbSize.w || h !== tbSize.h) setTbSize({ w, h });
        }
    });

    // ---- render ------------------------------------------------------------------------------------
    const n = rect ? norm(rect) : null;
    const showRect = n && (phase === 'adjust' || phase === 'edit' || (phase === 'drag' && n.r - n.l + (n.b - n.t) > 0));
    const sizeText = n ? `${Math.round((n.r - n.l) * dpi())} × ${Math.round((n.b - n.t) * dpi())}` : '';
    const magSize = MAG.src * MAG.zoom;
    const magLeft = cursor.x + 24 + magSize > screen.width ? cursor.x - 24 - magSize : cursor.x + 24;
    const magTop = cursor.y + 24 + magSize + 28 > screen.height ? cursor.y - 24 - magSize - 28 : cursor.y + 24;
    const selecting = phase === 'idle' || phase === 'drag';
    const handlesOn = phase === 'adjust' || (phase === 'edit' && tool === 'move');
    const handlePos = (h) => {
        const cx = (n.l + n.r) / 2;
        const cy = (n.t + n.b) / 2;
        return {
            left: (h.includes('w') ? n.l : h.includes('e') ? n.r : cx) - 5,
            top: (h.includes('n') ? n.t : h.includes('s') ? n.b : cy) - 5,
            cursor: { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' }[h] + '-resize',
        };
    };

    // toolbar below the selection, else above it, else inside its bottom edge
    const tbPos = (() => {
        if (!n) return { left: 0, top: 0 };
        const left = Math.max(6, Math.min(screen.width - tbSize.w - 6, n.r - tbSize.w));
        let top = n.b + 8;
        if (top + tbSize.h > screen.height - 4) top = n.t - 8 - tbSize.h;
        if (top < 4) top = n.b - tbSize.h - 8;
        return { left, top };
    })();
    const sizeTool = tool === 'text' ? 'font' : 'stroke';
    const sizeVal = sizeTool === 'font' ? font : stroke;
    const setSizeVal = (v) => (sizeTool === 'font' ? setFont(v) : setStroke(v));
    const showStyle = tool !== 'move';

    const Btn = ({ title, onClick, active, children, accent }) => (
        <button
            type='button'
            title={title}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClick}
            className={`w-[32px] h-[32px] flex items-center justify-center rounded-[7px] text-[17px] transition-colors ${
                active
                    ? 'bg-[#bff03a] text-black'
                    : accent
                      ? 'text-[#bff03a] hover:bg-white/10'
                      : 'text-white/85 hover:bg-white/10'
            }`}
        >
            {children}
        </button>
    );
    const Sep = () => <div className='w-px h-[20px] bg-white/15 mx-[4px]' />;

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
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                        border: '1px solid #38bdf8',
                    }}
                />
            )}

            {/* annotations */}
            {phase === 'edit' && (
                <canvas
                    ref={canvasRef}
                    className='fixed top-0 left-0 pointer-events-none'
                    style={{ width: screen.width, height: screen.height }}
                />
            )}

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

            {opts.crosshair && selecting && (
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

            {(opts.size || phase === 'edit') && showRect && (
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
                onContextMenu={(e) => e.preventDefault()}
            />

            {/* move box + 8 handles */}
            {handlesOn && n && (
                <>
                    <div
                        className='fixed select-none'
                        style={{ left: n.l, top: n.t, width: n.r - n.l, height: n.b - n.t, cursor: 'move' }}
                        onMouseDown={(e) => startHandle(e, 'move')}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onDoubleClick={() => (phase === 'edit' ? doDone() : finish(rect))}
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
                </>
            )}
            {/* while moving / resizing, keep tracking outside the box */}
            {handlesOn && drag.current && (
                <div
                    className='fixed inset-0'
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                />
            )}

            {phase === 'adjust' && n && (
                <div
                    className='fixed pointer-events-none text-[12px] px-[8px] py-[5px] rounded bg-black/75 text-white'
                    style={{ left: n.l, top: n.b + 8 > screen.height - 30 ? n.b - 30 : n.b + 8 }}
                >
                    {t('screenshot.adjust_hint')}
                </div>
            )}

            {/* drawing layer */}
            {phase === 'edit' && tool !== 'move' && (
                <div
                    className='fixed inset-0 select-none'
                    style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
                    onMouseDown={drawDown}
                    onMouseMove={drawMove}
                    onMouseUp={drawUp}
                    onMouseLeave={drawUp}
                    onContextMenu={(e) => e.preventDefault()}
                />
            )}

            {textEdit && (
                <textarea
                    autoFocus
                    rows={1}
                    value={textEdit.value}
                    onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                    onBlur={commitText}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            setTextEdit(null);
                        } else if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitText();
                        }
                    }}
                    placeholder={t('screenshot.text_placeholder')}
                    className='fixed bg-transparent outline-none resize-none overflow-hidden placeholder:text-white/50'
                    style={{
                        left: textEdit.x - 3,
                        top: textEdit.y - 3,
                        padding: 2,
                        border: '1px dashed rgba(255,255,255,0.7)',
                        color,
                        font: `600 ${font}px Inter, "Segoe UI", sans-serif`,
                        lineHeight: 1.25,
                        minWidth: 120,
                        width: Math.max(120, (textEdit.value.split('\n').reduce((m, l) => Math.max(m, l.length), 0) + 2) * font * 0.62),
                        height: (textEdit.value.split('\n').length * 1.25 + 0.3) * font + 6,
                    }}
                />
            )}

            {/* editor toolbar */}
            {phase === 'edit' && n && (
                <div
                    ref={tbRef}
                    className='fixed select-none flex flex-col gap-[6px] items-end'
                    style={{ left: tbPos.left, top: tbPos.top }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className='flex items-center gap-[2px] p-[4px] rounded-[10px] bg-[#1c1c20]/95 border border-white/10 shadow-xl'>
                        {TOOLS.map(([key, Icon]) => (
                            <Btn
                                key={key}
                                title={t(`screenshot.tool_${key}`)}
                                active={tool === key}
                                onClick={() => {
                                    if (textEdit) commitText();
                                    setTool(key);
                                }}
                            >
                                <Icon />
                            </Btn>
                        ))}
                        <Sep />
                        <Btn
                            title={t('screenshot.undo')}
                            onClick={undo}
                        >
                            <LuUndo2 className={shapes.length ? '' : 'opacity-35'} />
                        </Btn>
                        <Btn
                            title={t('screenshot.redo')}
                            onClick={redoIt}
                        >
                            <LuRedo2 className={redo.length ? '' : 'opacity-35'} />
                        </Btn>
                        <Sep />
                        <Btn
                            title={t('screenshot.ocr')}
                            onClick={() => doAction('recognize')}
                        >
                            <LuScanLine />
                        </Btn>
                        <Btn
                            title={t('screenshot.translate')}
                            onClick={() => doAction('translate')}
                        >
                            <LuLanguages />
                        </Btn>
                        <Btn
                            title={t('screenshot.save')}
                            onClick={doSave}
                        >
                            <LuDownload />
                        </Btn>
                        <Btn
                            title={t('screenshot.copy')}
                            onClick={doCopy}
                        >
                            <LuCopy />
                        </Btn>
                        <Sep />
                        <Btn
                            title={t('screenshot.cancel')}
                            onClick={() => appWindow.close()}
                        >
                            <LuX />
                        </Btn>
                        <Btn
                            title={t(`screenshot.done_${mode === 'capture' ? 'copy' : 'action'}`)}
                            onClick={doDone}
                            accent
                        >
                            <LuCheck />
                        </Btn>
                    </div>
                    {showStyle && (
                        <div className='flex items-center gap-[6px] px-[8px] py-[5px] rounded-[10px] bg-[#1c1c20]/95 border border-white/10 shadow-xl'>
                            {tool !== 'mosaic' &&
                                PRESET_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type='button'
                                        title={c}
                                        onClick={() => setColor(c)}
                                        className='w-[18px] h-[18px] rounded-full'
                                        style={{
                                            background: c,
                                            boxShadow:
                                                color.toLowerCase() === c ? '0 0 0 2px #1c1c20, 0 0 0 4px #bff03a' : 'inset 0 0 0 1px rgba(255,255,255,0.25)',
                                        }}
                                    />
                                ))}
                            {tool !== 'mosaic' && (
                                <label
                                    title={t('screenshot.custom_color')}
                                    className='relative w-[22px] h-[22px] rounded-full cursor-pointer overflow-hidden'
                                    style={{
                                        background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                                    }}
                                >
                                    <input
                                        type='color'
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className='absolute inset-0 opacity-0 cursor-pointer'
                                    />
                                </label>
                            )}
                            {tool !== 'mosaic' && <Sep />}
                            <span className='text-[11px] text-white/60 whitespace-nowrap'>
                                {t(sizeTool === 'font' ? 'screenshot.font_size' : 'screenshot.brush_size')}
                            </span>
                            <input
                                type='range'
                                min={sizeTool === 'font' ? 10 : 1}
                                max={sizeTool === 'font' ? 72 : 30}
                                value={sizeVal}
                                onChange={(e) => setSizeVal(+e.target.value)}
                                className='w-[110px] accent-[#bff03a]'
                            />
                            <span className='text-[12px] text-white w-[22px] text-right tabular-nums'>{sizeVal}</span>
                            <div
                                className='w-[26px] h-[26px] flex items-center justify-center'
                                title={t('screenshot.preview')}
                            >
                                <div
                                    className='rounded-full'
                                    style={{
                                        width: Math.min(24, sizeTool === 'font' ? sizeVal / 2.5 : sizeVal),
                                        height: Math.min(24, sizeTool === 'font' ? sizeVal / 2.5 : sizeVal),
                                        background: tool === 'mosaic' ? '#888' : color,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    {notice && (
                        <div className='text-[12px] px-[8px] py-[4px] rounded bg-black/80 text-white'>{notice}</div>
                    )}
                </div>
            )}

            {opts.magnifier && selecting && (
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
                        {Math.round(cursor.x * dpi())}, {Math.round(cursor.y * dpi())}
                    </div>
                </div>
            )}
        </>
    );
}
