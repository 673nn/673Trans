// "Translate and replace" on text that can't be edited (src-tauri/src/inplace.rs)
import { Switch } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

export default function InplaceSettings() {
    const { t } = useTranslation();
    const [keep, setKeep] = useConfig('inplace_keep', true);
    if (keep === null) return null;
    return (
        <Section title={t('config.toolbar.inplace.title')}>
            <Row
                label={t('config.toolbar.inplace.keep')}
                desc={t('config.toolbar.inplace.keep_desc')}
            >
                <Switch
                    isSelected={keep}
                    onValueChange={setKeep}
                />
            </Row>
        </Section>
    );
}
