// Sidebar groups of the settings window. Each group shows its pages as tabs; the page routes
// themselves stay the same (other windows open them directly, e.g. '/aimodes').
import { LuSettings2, LuKeyboard, LuLayoutGrid, LuPuzzle, LuHistory, LuSlidersHorizontal, LuInfo } from 'react-icons/lu';

export const GROUPS = [
    { id: 'general', icon: LuSettings2, pages: ['/general', '/translate'] },
    { id: 'hotkey', icon: LuKeyboard, pages: ['/hotkey'] },
    { id: 'features', icon: LuLayoutGrid, pages: ['/toolbar', '/aimodes', '/screenshot', '/recognize'] },
    { id: 'service', icon: LuPuzzle, pages: ['/service'], key: true },
    { id: 'history', icon: LuHistory, pages: ['/history'] },
    { id: 'other', icon: LuSlidersHorizontal, pages: ['/network', '/backup'] },
    { id: 'about', icon: LuInfo, pages: ['/about'] },
];

export function groupOf(pathname) {
    return GROUPS.find((g) => g.pages.some((p) => pathname === p || pathname.startsWith(p + '/'))) ?? GROUPS[0];
}

// last page opened in each group, so coming back to a group returns to that tab
const LAST_KEY = 'config_nav_last';
export function lastPage(group) {
    try {
        const saved = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')[group.id];
        if (group.pages.includes(saved)) return saved;
    } catch {
        // ignore
    }
    return group.pages[0];
}
export function rememberPage(pathname) {
    const g = groupOf(pathname);
    if (!g.pages.includes(pathname)) return;
    try {
        const all = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
        all[g.id] = pathname;
        localStorage.setItem(LAST_KEY, JSON.stringify(all));
    } catch {
        // ignore
    }
}
