import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    LuSettings2,
    LuLanguages,
    LuTextSelect,
    LuScanLine,
    LuKeyboard,
    LuPuzzle,
    LuHistory,
    LuCloud,
    LuInfo,
    LuCrop,
    LuGlobe,
} from 'react-icons/lu';
import React from 'react';

// Order of the pages in the sidebar. `path` must match a route in ../../routes
const items = [
    { path: '/general', icon: LuSettings2 },
    { path: '/translate', icon: LuLanguages },
    { path: '/toolbar', icon: LuTextSelect },
    { path: '/recognize', icon: LuScanLine },
    { path: '/screenshot', icon: LuCrop },
    { path: '/network', icon: LuGlobe },
    { path: '/hotkey', icon: LuKeyboard },
    { path: '/service', icon: LuPuzzle, key: true },
    { path: '/history', icon: LuHistory },
    { path: '/backup', icon: LuCloud },
    { path: '/about', icon: LuInfo },
];

export default function SideBar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <nav className='config-nav'>
            {items.map(({ path, icon: Icon, key }) => {
                const active = location.pathname.includes(path);
                return (
                    <button
                        key={path}
                        type='button'
                        className={`config-nav-item ${active ? 'is-active' : ''} ${key ? 'is-key' : ''}`}
                        onClick={() => navigate(path)}
                    >
                        <Icon className='config-nav-icon' />
                        <span>{t(`config.${path.slice(1)}.label`)}</span>
                    </button>
                );
            })}
        </nav>
    );
}
