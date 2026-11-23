// Shared settings form for AI providers: translators (DeepSeek, Claude, ...),
// OCR (mode='ocr') and text to speech (mode='tts').
// To add another provider: copy src/services/translate/deepseek, change the
// defaults, then register it in src/services/translate/index.jsx,
// src-tauri/src/config.rs (builtin_translate_list) and the i18n files.
import { Input, Button, Switch, Textarea, Select, SelectItem } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/api/shell';
import React, { useState } from 'react';

import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT } from './prompt';
import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { Language } from './languages';

const DEFAULT_TIMEOUT = 30000;

// One row: label (+ small description) on the left, control on the right
function Field({ label, desc, children }) {
    return (
        <div className='config-item'>
            <div className='config-label'>
                <h3>{label}</h3>
                {desc && <p className='config-desc'>{desc}</p>}
            </div>
            <div className='llm-field-control'>{children}</div>
        </div>
    );
}

function Group({ title, children }) {
    return (
        <>
            <h4 className='config-section-title'>{title}</h4>
            <div className='llm-group'>{children}</div>
        </>
    );
}

export function LlmConfig(props) {
    const {
        instanceKey,
        updateServiceList,
        onClose,
        // provider specific
        title,
        translate,
        defaults,
        keyUrl,
        modelHint,
        requestPathHint,
        supportsStream = true,
        // 'translate' (system + user prompt), 'ocr' (one prompt), 'tts' (no prompt)
        mode = 'translate',
        // extra text fields: [{ key, label, desc }]
        extraFields = [],
        // async (config) => void, throws when the settings do not work. Default: translate "hello"
        test,
        // which "Advanced" options the provider understands (translate mode only)
        advanced = { thinking: false, effort: true, extraJson: true },
        // async (config) => string: account balance (DeepSeek)
        balance,
    } = props;
    const { t } = useTranslation();
    const [config, setConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: title,
            apiKey: '',
            timeout: DEFAULT_TIMEOUT,
            ...(mode === 'translate'
                ? { stream: supportsStream, systemPrompt: DEFAULT_SYSTEM_PROMPT, userPrompt: DEFAULT_USER_PROMPT }
                : {}),
            ...defaults,
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [balanceText, setBalanceText] = useState('');
    const [balanceLoading, setBalanceLoading] = useState(false);
    const toastStyle = useToastStyle();
    const set = (key, value) => setConfig({ ...config, [key]: value });
    const runTest = () =>
        test ? test(config) : translate('hello', Language.auto, Language.vi, { config: { ...config, stream: false } });

    // "Test connection": one real request without saving, with the time it took
    const onTest = async () => {
        setTesting(true);
        const started = Date.now();
        try {
            const out = await runTest();
            const ms = Date.now() - started;
            const sample = typeof out === 'string' ? ` · "${out.slice(0, 60)}"` : '';
            toast.success(t('services.llm.test_ok', { ms }) + sample, { style: toastStyle });
        } catch (e) {
            toast.error(t('config.service.test_failed') + ': ' + (e?.message ?? String(e)), { style: toastStyle });
        }
        setTesting(false);
    };
    const onBalance = async () => {
        setBalanceLoading(true);
        try {
            setBalanceText(await balance(config));
        } catch (e) {
            setBalanceText('');
            toast.error(String(e?.message ?? e), { style: toastStyle });
        }
        setBalanceLoading(false);
    };

    return (
        config !== null && (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    // Test with one real request before saving
                    Promise.resolve(runTest()).then(
                        () => {
                            setIsLoading(false);
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            onClose();
                        },
                        (e) => {
                            setIsLoading(false);
                            toast.error(t('config.service.test_failed') + ': ' + (e?.message ?? String(e)), {
                                style: toastStyle,
                            });
                        }
                    );
                }}
            >
                <Toaster />
                <Group title={t('services.llm.general')}>
                    <Field label={t('config.service.service_name')}>
                        <Input
                            aria-label='name'
                            value={config[INSTANCE_NAME_CONFIG_KEY]}
                            variant='bordered'
                            onValueChange={(v) => set(INSTANCE_NAME_CONFIG_KEY, v)}
                        />
                    </Field>
                    <Field
                        label={t('services.llm.timeout')}
                        desc={t('services.llm.timeout_desc')}
                    >
                        <Input
                            aria-label='timeout'
                            type='number'
                            min={1000}
                            step={1000}
                            value={String(config.timeout ?? DEFAULT_TIMEOUT)}
                            variant='bordered'
                            endContent={<span className='text-default-500 text-[12px]'>ms</span>}
                            onValueChange={(v) => set('timeout', parseInt(v) || DEFAULT_TIMEOUT)}
                        />
                    </Field>
                </Group>

                <Group title={title}>
                    <Field
                        label={t('services.llm.request_path')}
                        desc={requestPathHint ?? t('services.llm.request_path_desc')}
                    >
                        <Input
                            aria-label='url'
                            value={config.requestPath}
                            variant='bordered'
                            onValueChange={(v) => set('requestPath', v)}
                        />
                    </Field>
                    <Field
                        label={t('services.llm.api_key')}
                        desc={
                            <>
                                {t('services.llm.api_key_desc')}{' '}
                                {keyUrl && (
                                    <a
                                        className='text-primary cursor-pointer underline'
                                        onClick={() => open(keyUrl)}
                                    >
                                        {t('services.llm.get_key')}
                                    </a>
                                )}
                            </>
                        }
                    >
                        <Input
                            aria-label='api key'
                            type='password'
                            value={config.apiKey}
                            variant='bordered'
                            onValueChange={(v) => set('apiKey', v)}
                        />
                    </Field>
                    <Field
                        label={t('services.llm.model')}
                        desc={modelHint ?? t('services.llm.model_desc')}
                    >
                        <Input
                            aria-label='model'
                            value={config.model}
                            variant='bordered'
                            onValueChange={(v) => set('model', v)}
                        />
                    </Field>
                    {extraFields.map((field) => (
                        <Field
                            key={field.key}
                            label={field.label}
                            desc={field.desc}
                        >
                            <Input
                                aria-label={field.key}
                                value={config[field.key] ?? ''}
                                variant='bordered'
                                onValueChange={(v) => set(field.key, v)}
                            />
                        </Field>
                    ))}
                    {mode === 'translate' && supportsStream && (
                        <Field
                            label={t('services.llm.stream')}
                            desc={t('services.llm.stream_desc')}
                        >
                            <div className='flex justify-end'>
                                <Switch
                                    aria-label='stream'
                                    isSelected={config.stream}
                                    onValueChange={(v) => set('stream', v)}
                                />
                            </div>
                        </Field>
                    )}
                </Group>

                {mode === 'translate' && (
                    <Group title={t('services.llm.prompt')}>
                        <div className='py-2'>
                            <Textarea
                                label={t('services.llm.system_prompt')}
                                labelPlacement='outside'
                                variant='bordered'
                                minRows={2}
                                value={config.systemPrompt}
                                onValueChange={(v) => set('systemPrompt', v)}
                            />
                            <Textarea
                                className='mt-2'
                                label={t('services.llm.user_prompt')}
                                labelPlacement='outside'
                                variant='bordered'
                                minRows={2}
                                value={config.userPrompt}
                                onValueChange={(v) => set('userPrompt', v)}
                            />
                            <p className='config-desc'>{t('services.llm.prompt_description')}</p>
                        </div>
                    </Group>
                )}

                {mode === 'translate' && (
                    <Group title={t('services.llm.advanced')}>
                        <Field
                            label={t('services.llm.temperature')}
                            desc={t('services.llm.temperature_desc')}
                        >
                            <Input
                                aria-label='temperature'
                                type='number'
                                min={0}
                                max={2}
                                step={0.1}
                                placeholder={t('services.llm.provider_default')}
                                value={config.temperature ?? ''}
                                variant='bordered'
                                onValueChange={(v) => set('temperature', v)}
                            />
                        </Field>
                        <Field
                            label={t('services.llm.max_tokens')}
                            desc={t('services.llm.max_tokens_desc')}
                        >
                            <Input
                                aria-label='max tokens'
                                type='number'
                                min={1}
                                step={256}
                                placeholder={t('services.llm.provider_default')}
                                value={config.maxTokens ?? ''}
                                variant='bordered'
                                onValueChange={(v) => set('maxTokens', v)}
                            />
                        </Field>
                        {advanced.thinking && (
                            <Field
                                label={t('services.llm.thinking')}
                                desc={t('services.llm.thinking_desc')}
                            >
                                <Select
                                    aria-label='thinking'
                                    variant='bordered'
                                    selectedKeys={[config.thinking || 'default']}
                                    onSelectionChange={(k) => {
                                        const v = k.currentKey;
                                        set('thinking', v === 'default' ? '' : v);
                                    }}
                                >
                                    <SelectItem key='default'>{t('services.llm.provider_default')}</SelectItem>
                                    <SelectItem key='disabled'>{t('services.llm.thinking_off')}</SelectItem>
                                    <SelectItem key='enabled'>{t('services.llm.thinking_on')}</SelectItem>
                                </Select>
                            </Field>
                        )}
                        {advanced.effort && (
                            <Field
                                label={t('services.llm.effort')}
                                desc={t('services.llm.effort_desc')}
                            >
                                <Select
                                    aria-label='reasoning effort'
                                    variant='bordered'
                                    selectedKeys={[config.reasoningEffort || 'default']}
                                    onSelectionChange={(k) => {
                                        const v = k.currentKey;
                                        set('reasoningEffort', v === 'default' ? '' : v);
                                    }}
                                >
                                    <SelectItem key='default'>{t('services.llm.not_sent')}</SelectItem>
                                    <SelectItem key='low'>{t('services.llm.effort_low')}</SelectItem>
                                    <SelectItem key='medium'>{t('services.llm.effort_medium')}</SelectItem>
                                    <SelectItem key='high'>{t('services.llm.effort_high')}</SelectItem>
                                </Select>
                            </Field>
                        )}
                        {advanced.extraJson && (
                            <div className='py-2'>
                                <Textarea
                                    label={t('services.llm.extra_args')}
                                    labelPlacement='outside'
                                    variant='bordered'
                                    minRows={2}
                                    placeholder='{"top_p": 0.9}'
                                    value={config.extraArgs ?? ''}
                                    onValueChange={(v) => set('extraArgs', v)}
                                />
                                <p className='config-desc'>{t('services.llm.extra_args_desc')}</p>
                            </div>
                        )}
                    </Group>
                )}
                {mode === 'ocr' && (
                    <Group title={t('services.llm.prompt')}>
                        <div className='py-2'>
                            <Textarea
                                aria-label='prompt'
                                variant='bordered'
                                minRows={2}
                                value={config.prompt}
                                onValueChange={(v) => set('prompt', v)}
                            />
                            <p className='config-desc'>{t('services.llm.ocr_prompt_description')}</p>
                        </div>
                    </Group>
                )}

                <div className='flex items-center gap-[8px] mt-4 flex-wrap'>
                    <Button
                        variant='flat'
                        isLoading={testing}
                        onPress={onTest}
                    >
                        {t('services.llm.test')}
                    </Button>
                    {balance && (
                        <Button
                            variant='flat'
                            isLoading={balanceLoading}
                            isDisabled={!config.apiKey}
                            onPress={onBalance}
                        >
                            {t('services.llm.balance')}
                        </Button>
                    )}
                    {balanceText && <span className='text-[13px] text-default-600'>{balanceText}</span>}
                </div>
                <Button
                    type='submit'
                    isLoading={isLoading}
                    fullWidth
                    color='primary'
                    className='llm-save mt-3'
                >
                    {t('common.save')}
                </Button>
            </form>
        )
    );
}
