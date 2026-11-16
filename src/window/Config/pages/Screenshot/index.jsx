// Settings for the region selection when you capture the screen (src/window/Screenshot).
import { Switch } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

export default function Screenshot() {
    const { t } = useTranslation();
    const [crosshair, setCrosshair] = useConfig('screenshot_crosshair', true);
    const [magnifier, setMagnifier] = useConfig('screenshot_magnifier', false);
    const [size, setSize] = useConfig('screenshot_size', false);
    const [handles, setHandles] = useConfig('screenshot_handles', false);
    const [detect, setDetect] = useConfig('screenshot_detect', false);

    const rows = [
        ['crosshair', crosshair, setCrosshair],
        ['magnifier', magnifier, setMagnifier],
        ['size', size, setSize],
        ['handles', handles, setHandles],
        ['detect', detect, setDetect],
    ];

    return (
        <Section title={t('config.screenshot.section_selection')}>
            {rows.map(([key, value, setValue]) => (
                <Row
                    key={key}
                    label={t(`config.screenshot.${key}`)}
                    desc={t(`config.screenshot.${key}_desc`)}
                >
                    {value !== null && (
                        <Switch
                            isSelected={value}
                            onValueChange={setValue}
                        />
                    )}
                </Row>
            ))}
        </Section>
    );
}
