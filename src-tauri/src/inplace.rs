//! In-place translation for text you can't edit (chat messages in Slack, Discord, a web page…).
//!
//! "Translate and replace" (selection toolbar / hotkey) pastes over the selection when it is in a
//! text field. When the selection is read-only, pasting does nothing, so instead the translation
//! is drawn over the selected lines by a small window that never takes focus
//! (src/window/Inplace). Position, font size and colours of the selection come from UI Automation.
//!
//! Flow (src/window/SelToolbar): inplace_probe() while the selection is still there,
//! translate, then inplace_show(result). Click anywhere, scroll, or press Esc to hide it.

/// Window label (also the key in `windowMap` in src/App.jsx)
pub const LABEL: &str = "inplace";

#[derive(serde::Serialize, Clone, Default)]
pub struct Line {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// What the probe found. `editable`: paste as usual. Otherwise the selection, in physical px
/// relative to its bounding box (`lines`), with font and colours.
#[derive(serde::Serialize, Clone, Default)]
pub struct Probe {
    pub editable: bool,
    pub found: bool,
    pub text: String,
    pub lines: Vec<Line>,
    pub width: f64,
    pub height: f64,
    pub font_px: f64,
    pub font_name: String,
    pub font_weight: i32,
    pub fg: String,
    pub bg: String,
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{Line, Probe, LABEL};
    use crate::APP;
    use log::warn;
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering::SeqCst};
    use std::sync::Mutex;
    use tauri::Manager;
    use windows::core::VARIANT;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, MonitorFromPoint, ReleaseDC, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Ole::{SafeArrayDestroy, SafeArrayGetElement, SafeArrayGetLBound, SafeArrayGetUBound};
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern, IUIAutomationTextRange,
        IUIAutomationValuePattern, UIA_EditControlTypeId, UIA_FontNameAttributeId, UIA_FontSizeAttributeId,
        UIA_FontWeightAttributeId, UIA_ForegroundColorAttributeId, UIA_TextPatternId, UIA_ValuePatternId,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsIconic,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW,
        SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };

    static HWND_RAW: AtomicIsize = AtomicIsize::new(0);
    static VISIBLE: AtomicBool = AtomicBool::new(false);
    // last probe: bounding box in physical px, and what the page needs
    static LAST: Mutex<Option<(RECT, Probe)>> = Mutex::new(None);
    static SHOWN: Mutex<RECT> = Mutex::new(RECT { left: 0, top: 0, right: 0, bottom: 0 });
    // the app window the selection is in, and where it was: the translation follows its focus
    static SRC: AtomicIsize = AtomicIsize::new(0);
    static SRC_RECT: Mutex<RECT> = Mutex::new(RECT { left: 0, top: 0, right: 0, bottom: 0 });
    static PENDING: Mutex<(isize, RECT)> = Mutex::new((0, RECT { left: 0, top: 0, right: 0, bottom: 0 }));
    // hidden because another app is in front; shown again when the source comes back
    static SUSPENDED: AtomicBool = AtomicBool::new(false);
    static WATCHING: AtomicBool = AtomicBool::new(false);

    fn keep() -> bool {
        crate::config::get("inplace_keep").and_then(|v| v.as_bool()).unwrap_or(true)
    }

    unsafe fn rect_of(h: HWND) -> RECT {
        let mut r = RECT::default();
        let _ = GetWindowRect(h, &mut r);
        r
    }

    fn hwnd(raw: isize) -> HWND {
        HWND(raw as *mut _)
    }

    fn colorref_hex(c: u32) -> String {
        format!("#{:02x}{:02x}{:02x}", c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF)
    }

    unsafe fn line_rects(range: &IUIAutomationTextRange) -> Vec<RECT> {
        let Ok(arr) = range.GetBoundingRectangles() else {
            return Vec::new();
        };
        if arr.is_null() {
            return Vec::new();
        }
        let lo = SafeArrayGetLBound(arr, 1).unwrap_or(0);
        let hi = SafeArrayGetUBound(arr, 1).unwrap_or(-1);
        let mut vals = Vec::new();
        for i in lo..=hi {
            let mut v = 0f64;
            if SafeArrayGetElement(arr, &i, &mut v as *mut f64 as *mut _).is_ok() {
                vals.push(v);
            }
        }
        let _ = SafeArrayDestroy(arr);
        vals.chunks(4)
            .filter(|c| c.len() == 4 && c[2] > 0.0 && c[3] > 0.0)
            .map(|c| RECT {
                left: c[0].round() as i32,
                top: c[1].round() as i32,
                right: (c[0] + c[2]).round() as i32,
                bottom: (c[1] + c[3]).round() as i32,
            })
            .collect()
    }

    /// The selected range of the first element (focus first, then under the cursor) that has one.
    unsafe fn selection(automation: &IUIAutomation, start: IUIAutomationElement) -> Option<IUIAutomationTextRange> {
        let walker = automation.ControlViewWalker().ok();
        let mut current = Some(start);
        for _ in 0..8 {
            let el = current.clone()?;
            if let Ok(tp) = el.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
                if let Ok(sel) = tp.GetSelection() {
                    if sel.Length().unwrap_or(0) > 0 {
                        if let Ok(range) = sel.GetElement(0) {
                            let text = range.GetText(8000).map(|b| b.to_string()).unwrap_or_default();
                            if !text.trim().is_empty() {
                                return Some(range);
                            }
                        }
                    }
                }
            }
            current = walker.as_ref().and_then(|w| w.GetParentElement(&el).ok());
        }
        None
    }

    unsafe fn is_editable(el: &IUIAutomationElement) -> bool {
        if el.CurrentControlType().map(|t| t == UIA_EditControlTypeId).unwrap_or(false) {
            return true;
        }
        if let Ok(vp) = el.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
            if let Ok(ro) = vp.CurrentIsReadOnly() {
                return !ro.as_bool();
            }
        }
        false
    }

    /// Most common colour just outside the selection: the page background (the selection
    /// itself is painted in the highlight colour).
    unsafe fn background(lines: &[RECT]) -> String {
        let dc = GetDC(HWND::default());
        let mut counts: Vec<(u32, u32)> = Vec::new();
        let mut probes = Vec::new();
        for r in lines {
            let mid = (r.top + r.bottom) / 2;
            probes.push((r.left - 3, mid));
            probes.push((r.right + 3, mid));
        }
        if let (Some(f), Some(l)) = (lines.first(), lines.last()) {
            probes.push(((f.left + f.right) / 2, f.top - 3));
            probes.push(((l.left + l.right) / 2, l.bottom + 3));
        }
        for (x, y) in probes {
            let c = GetPixel(dc, x, y).0;
            if c == 0xFFFF_FFFF {
                continue;
            }
            match counts.iter_mut().find(|(k, _)| *k == c) {
                Some(e) => e.1 += 1,
                None => counts.push((c, 1)),
            }
        }
        ReleaseDC(HWND::default(), dc);
        colorref_hex(counts.iter().max_by_key(|e| e.1).map(|e| e.0).unwrap_or(0x00FF_FFFF))
    }

    pub fn probe() -> Probe {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let Ok(automation) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) else {
                return Probe::default();
            };
            let focused = automation.GetFocusedElement().ok();
            if let Some(f) = &focused {
                if is_editable(f) {
                    return Probe { editable: true, ..Default::default() };
                }
            }
            let mut range = focused.and_then(|f| selection(&automation, f));
            if range.is_none() {
                let mut pt = POINT::default();
                if GetCursorPos(&mut pt).is_ok() {
                    if let Ok(el) = automation.ElementFromPoint(pt) {
                        range = selection(&automation, el);
                    }
                }
            }
            let Some(range) = range else {
                return Probe::default();
            };
            let lines = line_rects(&range);
            if lines.is_empty() {
                return Probe::default();
            }
            let bbox = lines.iter().fold(lines[0], |a, r| RECT {
                left: a.left.min(r.left),
                top: a.top.min(r.top),
                right: a.right.max(r.right),
                bottom: a.bottom.max(r.bottom),
            });
            let monitor = MonitorFromPoint(POINT { x: bbox.left, y: bbox.top }, MONITOR_DEFAULTTONEAREST);
            let (mut dx, mut dy) = (96u32, 96u32);
            let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
            let scale = dx as f64 / 96.0;

            let attr = |id| -> Option<VARIANT> { range.GetAttributeValue(id).ok() };
            // Everything is sent in physical px; the page divides by its own devicePixelRatio
            // (the overlay may sit on a monitor with another scale than where it was created).
            // UIA font size is in points: 1pt = 1/72 inch.
            let avg_h = lines.iter().map(|r| (r.bottom - r.top) as f64).sum::<f64>() / lines.len() as f64;
            let font_px = attr(UIA_FontSizeAttributeId)
                .and_then(|v| f64::try_from(&v).ok())
                .filter(|p| *p > 3.0 && *p < 200.0)
                .map(|p| p * dx as f64 / 72.0)
                .unwrap_or((avg_h * 0.72).clamp(10.0 * scale, 28.0 * scale));
            let font_name = attr(UIA_FontNameAttributeId)
                .and_then(|v| windows::core::BSTR::try_from(&v).ok())
                .map(|b| b.to_string())
                .unwrap_or_default();
            let font_weight = attr(UIA_FontWeightAttributeId)
                .and_then(|v| i32::try_from(&v).ok())
                .unwrap_or(400);
            let fg = attr(UIA_ForegroundColorAttributeId)
                .and_then(|v| i32::try_from(&v).ok())
                .map(|c| colorref_hex(c as u32))
                .unwrap_or_default();

            let rel = |r: &RECT| Line {
                x: (r.left - bbox.left) as f64,
                y: (r.top - bbox.top) as f64,
                w: (r.right - r.left) as f64,
                h: (r.bottom - r.top) as f64,
            };
            let probe = Probe {
                editable: false,
                found: true,
                text: range.GetText(8000).map(|b| b.to_string()).unwrap_or_default(),
                lines: lines.iter().map(rel).collect(),
                width: (bbox.right - bbox.left) as f64,
                height: (bbox.bottom - bbox.top) as f64,
                font_px,
                font_name,
                font_weight,
                fg,
                bg: background(&lines),
            };
            *LAST.lock().unwrap() = Some((bbox, probe.clone()));
            let fg = GetForegroundWindow();
            *PENDING.lock().unwrap() = (fg.0 as isize, rect_of(fg));
            probe
        }
    }

    fn overlay_window() -> Option<tauri::Window> {
        let app = APP.get()?;
        if let Some(w) = app.get_window(LABEL) {
            return Some(w);
        }
        let w = tauri::WindowBuilder::new(app, LABEL, tauri::WindowUrl::App("index.html".into()))
            .title("In-place translation")
            .inner_size(300.0, 40.0)
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .additional_browser_args("--disable-web-security")
            .build()
            .map_err(|e| warn!("In-place: failed to create window: {:?}", e))
            .ok()?;
        let raw = w.hwnd().ok()?.0 as isize;
        unsafe {
            let ex = GetWindowLongPtrW(hwnd(raw), GWL_EXSTYLE);
            let extra = (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0) as isize;
            SetWindowLongPtrW(hwnd(raw), GWL_EXSTYLE, ex | extra);
        }
        HWND_RAW.store(raw, SeqCst);
        Some(w)
    }

    /// Create the (hidden) window early, so the first translation shows without a delay.
    pub fn prepare() {
        let _ = overlay_window();
    }

    pub fn show(result: String) -> Result<(), String> {
        let (bbox, probe) = LAST.lock().unwrap().clone().ok_or("nothing to show")?;
        let fresh = APP.get().and_then(|a| a.get_window(LABEL)).is_none();
        let window = overlay_window().ok_or("no window")?;
        if fresh {
            // let the page load before it gets the event
            std::thread::sleep(std::time::Duration::from_millis(800));
        }
        let raw = HWND_RAW.load(SeqCst);
        // place and mark visible first: the page answers the event with inplace_resize
        *SHOWN.lock().unwrap() = bbox;
        unsafe {
            let _ = SetWindowPos(
                hwnd(raw),
                HWND_TOPMOST,
                bbox.left,
                bbox.top,
                bbox.right - bbox.left,
                bbox.bottom - bbox.top,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
        VISIBLE.store(true, SeqCst);
        let _ = window.emit("inplace_show", serde_json::json!({ "probe": probe, "result": result }));
        SUSPENDED.store(false, SeqCst);
        let (src, src_rect) = *PENDING.lock().unwrap();
        SRC.store(src, SeqCst);
        *SRC_RECT.lock().unwrap() = src_rect;
        if !WATCHING.swap(true, SeqCst) {
            std::thread::spawn(watch);
        }
        Ok(())
    }

    /// Follow the source window: hide while another app is in front, show again when it
    /// comes back unchanged; gone for good when it moved, resized or was minimized.
    fn watch() {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let visible = VISIBLE.load(SeqCst);
            let suspended = SUSPENDED.load(SeqCst);
            if !visible && !suspended {
                continue;
            }
            unsafe {
                let src = hwnd(SRC.load(SeqCst));
                let saved = *SRC_RECT.lock().unwrap();
                let now = rect_of(src);
                if IsIconic(src).as_bool() || now != saved {
                    hide();
                    SUSPENDED.store(false, SeqCst);
                    continue;
                }
                let fg = GetForegroundWindow();
                let mut pid = 0u32;
                GetWindowThreadProcessId(fg, Some(&mut pid));
                let ours = pid == GetCurrentProcessId();
                let raw = HWND_RAW.load(SeqCst);
                if visible && fg != src && !ours {
                    let _ = ShowWindow(hwnd(raw), SW_HIDE);
                    VISIBLE.store(false, SeqCst);
                    SUSPENDED.store(true, SeqCst);
                } else if suspended && fg == src {
                    let _ = ShowWindow(hwnd(raw), SW_SHOWNOACTIVATE);
                    SUSPENDED.store(false, SeqCst);
                    VISIBLE.store(true, SeqCst);
                }
            }
        }
    }

    /// The page measured the translation: grow the window (physical px) to fit it.
    pub fn resize(width: f64, height: f64) {
        let raw = HWND_RAW.load(SeqCst);
        if raw == 0 || !VISIBLE.load(SeqCst) {
            return;
        }
        let r = *SHOWN.lock().unwrap();
        // physical px, measured by the page with its own devicePixelRatio
        let w = (width.ceil() as i32).max(r.right - r.left);
        let h = (height.ceil() as i32).max(r.bottom - r.top);
        unsafe {
            let _ = SetWindowPos(hwnd(raw), HWND_TOPMOST, r.left, r.top, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    pub fn hide() {
        SUSPENDED.store(false, SeqCst);
        if !VISIBLE.swap(false, SeqCst) {
            return;
        }
        let raw = HWND_RAW.load(SeqCst);
        if raw != 0 {
            unsafe {
                let _ = ShowWindow(hwnd(raw), SW_HIDE);
            }
        }
    }

    /// Scroll, right / middle click or Esc (from the selection toolbar's hooks): the text
    /// under the translation may move, so it goes away.
    pub fn dismiss() {
        if VISIBLE.load(SeqCst) || SUSPENDED.load(SeqCst) {
            hide();
        }
    }

    /// A left click elsewhere: keeps the translation unless "keep" is off in the settings.
    /// (A click on the translation itself is handled by the page: it shows the original.)
    pub fn click(x: i32, y: i32) {
        if !VISIBLE.load(SeqCst) || keep() {
            return;
        }
        let r = *SHOWN.lock().unwrap();
        if x >= r.left && x <= r.right && y >= r.top && y <= r.bottom {
            return;
        }
        hide();
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::Probe;
    pub fn probe() -> Probe {
        Probe::default()
    }
    pub fn prepare() {}
    pub fn show(_result: String) -> Result<(), String> {
        Err("not supported".into())
    }
    pub fn resize(_w: f64, _h: f64) {}
    pub fn hide() {}
    pub fn dismiss() {}
    pub fn click(_x: i32, _y: i32) {}
}

pub use imp::{click, dismiss, prepare};

#[tauri::command(async)]
pub fn inplace_probe() -> Probe {
    imp::probe()
}

#[tauri::command(async)]
pub fn inplace_show(result: String) -> Result<(), String> {
    imp::show(result)
}

#[tauri::command]
pub fn inplace_resize(width: f64, height: f64) {
    imp::resize(width, height);
}

#[tauri::command]
pub fn inplace_hide() {
    imp::hide();
}
