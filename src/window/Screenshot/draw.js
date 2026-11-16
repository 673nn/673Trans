// Drawing of screenshot annotations. Shapes are stored in CSS pixels (screen coordinates).
// `img` is the full-screen capture, `d` = physical pixels per CSS pixel.

export const PRESET_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#111111'];

function pixelate(ctx, img, d, x, y, w, h, block) {
    const sx = Math.round(x * d);
    const sy = Math.round(y * d);
    const sw = Math.max(1, Math.round(w * d));
    const sh = Math.max(1, Math.round(h * d));
    const b = Math.max(2, Math.round(block * d));
    const tw = Math.max(1, Math.ceil(sw / b));
    const th = Math.max(1, Math.ceil(sh / b));
    const tmp = document.createElement('canvas');
    tmp.width = tw;
    tmp.height = th;
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = true;
    t.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
    ctx.restore();
}

export function drawShape(ctx, s, img, d) {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const box = () => ({
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
    });
    switch (s.type) {
        case 'pen':
        case 'marker': {
            if (s.type === 'marker') {
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = s.size * 4;
                ctx.lineCap = 'square';
            }
            const p = s.points;
            ctx.beginPath();
            ctx.moveTo(p[0][0], p[0][1]);
            if (p.length === 1) ctx.lineTo(p[0][0] + 0.01, p[0][1]);
            for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
            ctx.stroke();
            break;
        }
        case 'rect': {
            const b = box();
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            break;
        }
        case 'ellipse': {
            const b = box();
            ctx.beginPath();
            ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'arrow': {
            const { x1, y1, x2, y2 } = s;
            const ang = Math.atan2(y2 - y1, x2 - x1);
            const head = Math.max(10, s.size * 4);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const back = Math.min(head * 0.8, len);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2 - Math.cos(ang) * back, y2 - Math.sin(ang) * back);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
            ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'text': {
            ctx.font = `600 ${s.size}px Inter, "Segoe UI", sans-serif`;
            ctx.textBaseline = 'top';
            s.text.split('\n').forEach((line, i) => ctx.fillText(line, s.x, s.y + i * s.size * 1.25));
            break;
        }
        case 'mosaic': {
            const b = box();
            if (b.w > 0 && b.h > 0 && img) pixelate(ctx, img, d, b.x, b.y, b.w, b.h, Math.max(6, s.size * 3));
            break;
        }
        default:
    }
    ctx.restore();
}

/// The selection with its annotations, at real pixel size, as a data URL.
export function exportImage(img, d, sel, shapes, type = 'png') {
    const sx = Math.floor(sel.l * d);
    const sy = Math.floor(sel.t * d);
    const w = Math.max(1, Math.floor(sel.r * d) - sx);
    const h = Math.max(1, Math.floor(sel.b * d) - sy);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    ctx.save();
    ctx.scale(d, d);
    ctx.translate(-sx / d, -sy / d);
    shapes.forEach((s) => drawShape(ctx, s, img, d));
    ctx.restore();
    return type === 'jpg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}
