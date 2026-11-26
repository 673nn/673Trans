import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { GROUPS, groupOf, lastPage } from '../../nav';

export default function SideBar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const current = groupOf(location.pathname);

    return (
        <nav className='config-nav'>
            {GROUPS.map((g) => {
                const Icon = g.icon;
                const active = g.id === current.id;
                return (
                    <button
                        key={g.id}
                        type='button'
                        className={`config-nav-item ${active ? 'is-active' : ''} ${g.key ? 'is-key' : ''}`}
                        onClick={() => navigate(lastPage(g))}
                    >
                        <Icon className='config-nav-icon' />
                        <span>{t(`config.nav.${g.id}`)}</span>
                    </button>
                );
            })}
        </nav>
    );
}
