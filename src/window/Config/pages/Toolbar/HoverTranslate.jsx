// Settings for hover translate (src-tauri/src/hover.rs, src/window/HoverTranslate)
import { Switch, Tab, Tabs } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

export default function HoverTranslateSettings() {
    const { t } = useTranslation();
    const h = (k) => t(`config.toolbar.hover.${k}`);
    const [enable, setEnable] = useConfig('hover_translate_enable', false);
    const [key, setKey] = useConfig('hover_translate_key', 'ctrl');
    const [mode, setMode] = useConfig('hover_translate_mode', 'replace');
    if (enable === null || key === null || mode === null) return null;

    return (
        <Section title={h('title')}>
            <Row
                label={h('enable')}
                desc={h('enable_desc')}
            >
                <Switch
                    isSelected={enable}
                    onValueChange={setEnable}
                />
            </Row>
            <Row
                label={h('key')}
                desc={h('key_desc')}
            >
                <Tabs
                    size='sm'
                    selectedKey={key}
                    onSelectionChange={(k) => setKey(String(k))}
                    isDisabled={!enable}
                >
                    <Tab
                        key='ctrl'
                        title='Ctrl'
                    />
                    <Tab
                        key='alt'
                        title='Alt'
                    />
                    <Tab
                        key='shift'
                        title='Shift'
                    />
                </Tabs>
            </Row>
            <Row
                label={h('mode')}
                desc={mode === 'below' ? h('below_desc') : h('replace_desc')}
            >
                <Tabs
                    size='sm'
                    selectedKey={mode}
                    onSelectionChange={(k) => setMode(String(k))}
                    isDisabled={!enable}
                >
                    <Tab
                        key='replace'
                        title={h('replace')}
                    />
                    <Tab
                        key='below'
                        title={h('below')}
                    />
                </Tabs>
            </Row>
            <p className='text-[12.5px] text-default-400 px-[2px] pt-[6px] pb-[2px] leading-relaxed'>{h('note')}</p>
        </Section>
    );
}
