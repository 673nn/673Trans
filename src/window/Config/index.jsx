import { useLocation, useNavigate, useRoutes } from 'react-router-dom';
import { Tabs, Tab } from '@nextui-org/react';
import { groupOf, rememberPage } from './nav';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api';
import React, { useEffect } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';

import WindowControl from '../../components/WindowControl';
import SideBar from './components/SideBar';
import { osType } from '../../utils/env';
import { useConfig } from '../../hooks';
import { store } from '../../utils/store';
import routes from './routes';
import './style.css';

export default function Config() {
    const [transparent] = useConfig('transparent', true);
    const { t } = useTranslation();
    const location = useLocation();
    const page = useRoutes(routes);
    const navigate = useNavigate();
    const group = groupOf(location.pathname);
    const tabbed = group.pages.length > 1;
    useEffect(() => {
        rememberPage(location.pathname);
    }, [location.pathname]);

    // other windows can open a given page (translate window → AI buttons)
    useEffect(() => {
        invoke('take_config_path')
            .then((p) => p && navigate(p))
            .catch(() => {});
        const un = listen('config_navigate', ({ payload }) => {
            if (payload) navigate(payload);
            invoke('take_config_path').catch(() => {});
        });
        return () => {
            un.then((f) => f());
        };
    }, []);

    useEffect(() => {
        if (appWindow.label === 'config') {
            appWindow.show();
        }
    }, []);

    // remember the size you give this window
    useEffect(() => {
        let timer = null;
        const unlisten = appWindow.onResized(({ payload }) => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                if (await appWindow.isMaximized()) return;
                const factor = await appWindow.scaleFactor();
                const size = payload.toLogical(factor);
                await store.set('config_window_w', Math.round(size.width));
                await store.set('config_window_h', Math.round(size.height));
                await store.save();
            }, 500);
        });
        return () => {
            clearTimeout(timer);
            unlisten.then((f) => f());
        };
    }, []);

    return (
        <>
            <aside
                className={`config-sidebar ${transparent ? 'bg-background/90' : 'bg-background'} ${
                    osType === 'Linux' && 'rounded-l-[10px] border-1'
                } border-r-1 border-default-100 select-none cursor-default`}
            >
                <div
                    className='config-brand'
                    data-tauri-drag-region='true'
                >
                    <span
                        className='config-brand-mark'
                        data-tauri-drag-region='true'
                    >
                        673
                    </span>
                    <span
                        className='config-brand-name'
                        data-tauri-drag-region='true'
                    >
                        Trans
                    </span>
                </div>
                <SideBar />
            </aside>
            <div
                className={`config-main bg-background select-none cursor-default ${
                    osType === 'Linux' && 'rounded-r-[10px] border-1 border-l-0 border-default-100'
                }`}
            >
                <div
                    data-tauri-drag-region='true'
                    className='top-[5px] left-[225px] right-[110px] h-[40px] fixed'
                />
                <div className='config-header'>
                    <div className='flex items-center gap-[16px]'>
                        <h2 className='config-title'>
                            {tabbed ? t(`config.nav.${group.id}`) : t(`config.${location.pathname.slice(1)}.title`)}
                        </h2>
                        {/* pages can put small controls next to the title (see History) */}
                        <div
                            id='config-header-slot'
                            className='relative z-10'
                        />
                    </div>
                    <div className='flex'>{osType !== 'Darwin' && <WindowControl />}</div>
                </div>
                {tabbed && (
                    <div className='config-tabs'>
                        <Tabs
                            variant='underlined'
                            color='primary'
                            selectedKey={location.pathname}
                            onSelectionChange={(k) => navigate(String(k))}
                            aria-label={t(`config.nav.${group.id}`)}
                        >
                            {group.pages.map((p) => (
                                <Tab
                                    key={p}
                                    title={t(`config.${p.slice(1)}.label`)}
                                />
                            ))}
                        </Tabs>
                    </div>
                )}
                <div className={`config-page ${tabbed ? 'has-tabs' : ''}`}>{page}</div>
            </div>
        </>
    );
}
