// Settings for screen capture (src/window/Screenshot): selection helpers, editor defaults, output.
import { Switch, Input, Button, Select, SelectItem } from '@nextui-org/react';
import { open } from '@tauri-apps/api/dialog';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

const SWATCHES = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#111111'];

function NumberBox({ value, setValue, min, max }) {
    const set = (v) => setValue(Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)));
    return (
        <div className='flex items-center gap-[4px]'>
            <Button
                isIconOnly
                size='sm'
                variant='flat'
                onPress={() => set(value - 1)}
            >
                −
            </Button>
            <Input
                size='sm'
                variant='bordered'
                type='number'
                value={String(value)}
                onValueChange={(v) => set(parseInt(v))}
                className='w-[72px]'
                classNames={{ input: 'text-center' }}
            />
            <Button
                isIconOnly
                size='sm'
                variant='flat'
                onPress={() => set(value + 1)}
            >
                +
            </Button>
        </div>
    );
}

export default function Screenshot() {
    const { t } = useTranslation();
    const s = (k) => t(`config.screenshot.${k}`);
    const [crosshair, setCrosshair] = useConfig('screenshot_crosshair', true);
    const [magnifier, setMagnifier] = useConfig('screenshot_magnifier', false);
    const [size, setSize] = useConfig('screenshot_size', false);
    const [handles, setHandles] = useConfig('screenshot_handles', false);
    const [detect, setDetect] = useConfig('screenshot_detect', false);
    const [editor, setEditor] = useConfig('screenshot_editor', false);
    const [color, setColor] = useConfig('screenshot_color', '#ff3b30');
    const [stroke, setStroke] = useConfig('screenshot_stroke', 3);
    const [font, setFont] = useConfig('screenshot_font', 20);
    const [saveDir, setSaveDir] = useConfig('screenshot_save_dir', '');
    const [format, setFormat] = useConfig('screenshot_format', 'png');
    const [copyFile, setCopyFile] = useConfig('screenshot_copy_file', false);
    const [closeAfter, setCloseAfter] = useConfig('screenshot_close_after', true);

    const loaded = [crosshair, magnifier, size, handles, detect, editor, color, stroke, font, saveDir, format, copyFile, closeAfter].every(
        (v) => v !== null
    );
    if (!loaded) return null;

    const switches = [
        ['crosshair', crosshair, setCrosshair],
        ['magnifier', magnifier, setMagnifier],
        ['size', size, setSize],
        ['handles', handles, setHandles],
        ['detect', detect, setDetect],
        ['editor', editor, setEditor],
    ];

    return (
        <>
            <Section title={s('section_selection')}>
                {switches.map(([key, value, setValue]) => (
                    <Row
                        key={key}
                        label={s(key)}
                        desc={s(`${key}_desc`)}
                    >
                        <Switch
                            isSelected={value}
                            onValueChange={setValue}
                        />
                    </Row>
                ))}
            </Section>

            <Section title={s('section_annotation')}>
                <Row
                    label={s('color')}
                    desc={s('color_desc')}
                >
                    <div className='flex items-center gap-[7px]'>
                        {SWATCHES.map((c) => (
                            <button
                                key={c}
                                type='button'
                                title={c}
                                onClick={() => setColor(c)}
                                className='w-[20px] h-[20px] rounded-full'
                                style={{
                                    background: c,
                                    boxShadow:
                                        color.toLowerCase() === c
                                            ? '0 0 0 2px hsl(var(--nextui-background)), 0 0 0 4px hsl(var(--nextui-primary))'
                                            : 'inset 0 0 0 1px rgba(128,128,128,0.45)',
                                }}
                            />
                        ))}
                        <label
                            title={s('color_pick')}
                            className='relative w-[24px] h-[24px] rounded-full cursor-pointer overflow-hidden'
                            style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
                        >
                            <input
                                type='color'
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className='absolute inset-0 opacity-0 cursor-pointer'
                            />
                        </label>
                    </div>
                </Row>
                <Row label={s('stroke')}>
                    <NumberBox
                        value={stroke}
                        setValue={setStroke}
                        min={1}
                        max={30}
                    />
                </Row>
                <Row label={s('font')}>
                    <NumberBox
                        value={font}
                        setValue={setFont}
                        min={10}
                        max={72}
                    />
                </Row>
            </Section>

            <Section title={s('section_output')}>
                <Row
                    label={s('save_dir')}
                    desc={s('save_dir_desc')}
                >
                    <div className='flex items-center gap-[6px] w-[340px] max-w-[55%]'>
                        <Input
                            size='sm'
                            variant='bordered'
                            value={saveDir}
                            onValueChange={setSaveDir}
                            placeholder={s('save_dir_ask')}
                            isClearable
                            onClear={() => setSaveDir('')}
                        />
                        <Button
                            size='sm'
                            variant='flat'
                            onPress={async () => {
                                const dir = await open({ directory: true, defaultPath: saveDir || undefined });
                                if (typeof dir === 'string') setSaveDir(dir);
                            }}
                        >
                            {s('browse')}
                        </Button>
                    </div>
                </Row>
                <Row label={s('format')}>
                    <Select
                        size='sm'
                        variant='bordered'
                        selectedKeys={[format]}
                        onSelectionChange={(k) => k.currentKey && setFormat(k.currentKey)}
                        className='w-[160px]'
                        aria-label={s('format')}
                    >
                        <SelectItem key='png'>PNG</SelectItem>
                        <SelectItem key='jpg'>JPG</SelectItem>
                    </Select>
                </Row>
                <Row
                    label={s('copy_file')}
                    desc={s('copy_file_desc')}
                >
                    <Switch
                        isSelected={copyFile}
                        onValueChange={setCopyFile}
                    />
                </Row>
                <Row label={s('close_after')}>
                    <Switch
                        isSelected={closeAfter}
                        onValueChange={setCloseAfter}
                    />
                </Row>
            </Section>
        </>
    );
}
