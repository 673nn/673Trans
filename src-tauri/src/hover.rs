//! Hover translate: hold a modifier key (Ctrl / Alt / Shift, Config > Selection toolbar) over a
//! line or paragraph in any app, and its translation is drawn over it (or under it) by a small
//! window that never takes focus (src/window/HoverTranslate).
//!
//! The text and its position come from UI Automation, so it works where apps expose their text
//! to Windows accessibility (browsers, Electron apps, Office, most native apps), not in apps that
//! draw their own UI (games, Figma, Adobe apps).
//!
//! Config keys:
//!   hover_translate_enable  bool    default false
//!   hover_translate_key     string  default "ctrl"     ("ctrl" | "alt" | "shift")
//!   hover_translate_mode    string  default "replace"  ("replace" | "below")

/// Window label (also the key in `windowMap` in src/App.jsx)
pub const LABEL: &str = "hovertrans";

#[cfg(target_os = "windows")]
mod imp {
    use super::LABEL;
    use crate::config::get;
    use crate::APP;
    use log::{info, warn};
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering::SeqCst};
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, Instant};
    use tauri::Manager;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Ole::{SafeArrayDestroy, SafeArrayGetElement, SafeArrayGetLBound, SafeArrayGetUBound};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern, TextUnit_Paragraph,
        UIA_PaneControlTypeId, UIA_TextControlTypeId, UIA_TextPatternId, UIA_WindowControlTypeId,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_LWIN, VK_MENU, VK_SHIFT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetWindowLongPtrW, GetWindowThreadProcessId, SetWindowLongPtrW, SetWindowPos, ShowWindow,
        WindowFromPoint, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };

    static HWND_RAW: AtomicIsize = AtomicIsize::new(0);
    static VISIBLE: AtomicBool = AtomicBool::new(false);
    // overlay rectangle (physical px) and the source rectangle under it
    static AREA: Mutex<(RECT, RECT)> = Mutex::new((
        RECT { left: 0, top: 0, right: 0, bottom: 0 },
        RECT { left: 0, top: 0, right: 0, bottom: 0 },
    ));

    fn cfg_str(key: &str, default: &str) -> String {
        get(key).and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_else(|| default.to_string())
    }
    fn enabled() -> bool {
        get("hover_translate_enable").and_then(|v| v.as_bool()).unwrap_or(false)
    }
    fn hwnd(raw: isize) -> HWND {
        HWND(raw as *mut _)
    }
    fn down(vk: u16) -> bool {
        unsafe { GetAsyncKeyState(vk as i32) < 0 }
    }

    /// The trigger key is held on its own: no other modifier, key or mouse button.
    fn trigger_alone(trigger: u16) -> bool {
        if !down(trigger) {
            return false;
        }
        for m in [VK_CONTROL.0, VK_MENU.0, VK_SHIFT.0, VK_LWIN.0] {
            if m != trigger && down(m) {
                return false;
            }
        }
        // mouse buttons 0x01..0x06, keys 0x08..0xFE except the modifier family
        for vk in (0x01u16..=0x06).chain(0x08..=0xFE) {
            if matches!(vk, 0x10..=0x12 | 0xA0..=0xA5 | 0x5B | 0x5C) {
                continue;
            }
            if down(vk) {
                return false;
            }
        }
        true
    }

    fn inside(r: &RECT, p: &POINT, margin: i32) -> bool {
        p.x >= r.left - margin && p.x <= r.right + margin && p.y >= r.top - margin && p.y <= r.bottom + margin
    }

    fn overlay_window() -> Option<tauri::Window> {
        let app = APP.get()?;
        if let Some(w) = app.get_window(LABEL) {
            return Some(w);
        }
        let w = tauri::WindowBuilder::new(app, LABEL, tauri::WindowUrl::App("index.html".into()))
            .title("Hover Translate")
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
            .map_err(|e| warn!("Hover translate: failed to create window: {:?}", e))
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

    pub fn hide() {
        let raw = HWND_RAW.load(SeqCst);
        if raw != 0 {
            unsafe {
                let _ = ShowWindow(hwnd(raw), SW_HIDE);
            }
        }
        VISIBLE.store(false, SeqCst);
    }

    /// Called by the page once the translation is laid out: grow the overlay to fit it.
    pub fn resize(height: i32) {
        let raw = HWND_RAW.load(SeqCst);
        if raw == 0 || !VISIBLE.load(SeqCst) {
            return;
        }
        let mut area = AREA.lock().unwrap();
        let r = area.0;
        let h = height.max(r.bottom - r.top);
        area.0.bottom = r.top + h;
        unsafe {
            let _ = SetWindowPos(hwnd(raw), HWND_TOPMOST, r.left, r.top, r.right - r.left, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    unsafe fn rect_of_range(range: &windows::Win32::UI::Accessibility::IUIAutomationTextRange) -> Option<RECT> {
        let arr = range.GetBoundingRectangles().ok()?;
        if arr.is_null() {
            return None;
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
        let mut out: Option<RECT> = None;
        for c in vals.chunks(4) {
            if c.len() < 4 || c[2] <= 0.0 || c[3] <= 0.0 {
                continue;
            }
            let r = RECT {
                left: c[0] as i32,
                top: c[1] as i32,
                right: (c[0] + c[2]) as i32,
                bottom: (c[1] + c[3]) as i32,
            };
            out = Some(match out {
                None => r,
                Some(o) => RECT {
                    left: o.left.min(r.left),
                    top: o.top.min(r.top),
                    right: o.right.max(r.right),
                    bottom: o.bottom.max(r.bottom),
                },
            });
        }
        out
    }

    /// Text under the cursor and its screen rectangle.
    unsafe fn text_at(automation: &IUIAutomation, pt: POINT) -> Option<(String, RECT)> {
        let element: IUIAutomationElement = automation.ElementFromPoint(pt).ok()?;
        // 1. Documents / rich text: the paragraph under the cursor
        let walker = automation.ControlViewWalker().ok();
        let mut current = Some(element.clone());
        for _ in 0..4 {
            let Some(el) = current.clone() else { break };
            if let Ok(tp) = el.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
                if let Ok(range) = tp.RangeFromPoint(pt) {
                    let _ = range.ExpandToEnclosingUnit(TextUnit_Paragraph);
                    if let Ok(text) = range.GetText(4000) {
                        let text = text.to_string();
                        if !text.trim().is_empty() {
                            if let Some(rect) = rect_of_range(&range) {
                                return Some((text, rect));
                            }
                        }
                    }
                }
                break;
            }
            current = walker.as_ref().and_then(|w| w.GetParentElement(&el).ok());
        }
        // 2. Plain text elements (web pages, labels): their name is the text
        let kind = element.CurrentControlType().unwrap_or_default();
        if kind == UIA_WindowControlTypeId || kind == UIA_PaneControlTypeId {
            return None;
        }
        let name = element.CurrentName().map(|b| b.to_string()).unwrap_or_default();
        if name.trim().is_empty() || name.len() > 4000 {
            return None;
        }
        if kind != UIA_TextControlTypeId && name.split_whitespace().count() < 2 {
            return None; // a button or icon label, not reading text
        }
        let rect = element.CurrentBoundingRectangle().ok()?;
        if rect.right <= rect.left || rect.bottom <= rect.top {
            return None;
        }
        Some((name, rect))
    }

    /// Most common colour on the rectangle border: the background behind the text.
    unsafe fn background(r: &RECT) -> String {
        let dc = GetDC(HWND::default());
        let mut counts: Vec<(u32, u32)> = Vec::new();
        let xs = [r.left + 1, (r.left + r.right) / 2, r.right - 2];
        let ys = [r.top + 1, r.bottom - 2];
        let mut probes = Vec::new();
        for x in xs {
            for y in ys {
                probes.push((x, y));
            }
        }
        probes.push((r.left - 2, (r.top + r.bottom) / 2));
        probes.push((r.right + 2, (r.top + r.bottom) / 2));
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
        let c = counts.iter().max_by_key(|e| e.1).map(|e| e.0).unwrap_or(0x00FF_FFFF);
        format!("#{:02x}{:02x}{:02x}", c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF)
    }

    fn worker() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let automation: Option<IUIAutomation> = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok() };
        let Some(automation) = automation else {
            warn!("Hover translate: UI Automation unavailable");
            return;
        };
        info!("Hover translate: ready");
        let mut held_since: Option<Instant> = None;
        let mut last_text = String::new();
        let mut outside_since: Option<Instant> = None;
        loop {
            thread::sleep(Duration::from_millis(40));
            if !enabled() {
                if VISIBLE.load(SeqCst) {
                    hide();
                }
                thread::sleep(Duration::from_millis(400));
                continue;
            }
            let mut pt = POINT::default();
            if unsafe { GetCursorPos(&mut pt) }.is_err() {
                continue;
            }

            // close: Esc, or the cursor stays away from the source text and the overlay
            if VISIBLE.load(SeqCst) {
                if down(VK_ESCAPE.0) {
                    hide();
                    last_text.clear();
                    continue;
                }
                let (over, src) = *AREA.lock().unwrap();
                if inside(&over, &pt, 6) || inside(&src, &pt, 6) {
                    outside_since = None;
                } else if outside_since.get_or_insert_with(Instant::now).elapsed() > Duration::from_millis(350) {
                    hide();
                    last_text.clear();
                    outside_since = None;
                }
            }

            let trigger = match cfg_str("hover_translate_key", "ctrl").as_str() {
                "alt" => VK_MENU.0,
                "shift" => VK_SHIFT.0,
                _ => VK_CONTROL.0,
            };
            if !trigger_alone(trigger) {
                held_since = None;
                continue;
            }
            // held for a moment: not the start of a shortcut like Ctrl+C
            if held_since.get_or_insert_with(Instant::now).elapsed() < Duration::from_millis(300) {
                continue;
            }
            unsafe {
                // never our own windows
                let under = WindowFromPoint(pt);
                let mut pid = 0u32;
                GetWindowThreadProcessId(under, Some(&mut pid));
                if pid == GetCurrentProcessId() {
                    continue;
                }
                let Some((text, rect)) = text_at(&automation, pt) else {
                    continue;
                };
                if text == last_text && VISIBLE.load(SeqCst) {
                    continue;
                }
                last_text = text.clone();
                show(text, rect);
            }
        }
    }

    unsafe fn show(text: String, src: RECT) {
        let Some(window) = overlay_window() else {
            return;
        };
        let raw = HWND_RAW.load(SeqCst);
        let mode = cfg_str("hover_translate_mode", "replace");
        let bg = background(&src);
        let (w, h) = (src.right - src.left, src.bottom - src.top);
        let over = if mode == "below" {
            RECT { left: src.left, top: src.bottom + 2, right: src.right, bottom: src.bottom + 2 + h.max(24) }
        } else {
            src
        };
        *AREA.lock().unwrap() = (over, src);
        let scale = window.scale_factor().unwrap_or(1.0);
        let _ = window.emit(
            "hover_translate",
            serde_json::json!({
                "text": text,
                "mode": mode,
                "bg": bg,
                "width": w as f64 / scale,
                "height": h as f64 / scale,
            }),
        );
        let _ = SetWindowPos(
            hwnd(raw),
            HWND_TOPMOST,
            over.left,
            over.top,
            over.right - over.left,
            over.bottom - over.top,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        VISIBLE.store(true, SeqCst);
    }

    pub fn init() {
        thread::spawn(worker);
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn init() {}
    pub fn hide() {}
    pub fn resize(_height: i32) {}
}

pub fn init_hover_translate() {
    imp::init();
}

#[tauri::command]
pub fn hover_translate_hide() {
    imp::hide();
}

#[tauri::command]
pub fn hover_translate_resize(height: i32) {
    imp::resize(height);
}
