// Bing / Microsoft Translator. Microsoft closed the free Edge endpoint, so a free
// Azure Translator key (F0: 2 million characters a month) is the reliable way.
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { Input, Button } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { open } from '@tauri-apps/api/shell';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { translate, Language } from './index';

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const b = (k) => t(`services.translate.bing.${k}`);
    const [config, setConfig] = useConfig(
        instanceKey,
        { [INSTANCE_NAME_CONFIG_KEY]: 'Bing', key: '', region: '' },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const toastStyle = useToastStyle();

    if (config === null) return null;
    const field = (name, label, extra = {}) => (
        <div className='config-item'>
            <Input
                label={label}
                labelPlacement='outside-left'
                value={config[name] ?? ''}
                variant='bordered'
                classNames={{
                    base: 'justify-between',
                    label: 'text-[length:--nextui-font-size-medium]',
                    mainWrapper: 'max-w-[50%]',
                }}
                onValueChange={(v) => setConfig({ ...config, [name]: v })}
                {...extra}
            />
        </div>
    );

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                setIsLoading(true);
                translate('hello', Language.auto, Language.vi, { config }).then(
                    () => {
                        setIsLoading(false);
                        setConfig(config, true);
                        updateServiceList(instanceKey);
                        onClose();
                    },
                    (err) => {
                        setIsLoading(false);
                        toast.error(t('config.service.test_failed') + String(err), { style: toastStyle });
                    }
                );
            }}
        >
            <Toaster />
            {field(INSTANCE_NAME_CONFIG_KEY, t('services.instance_name'))}
            <p className='text-[13px] text-default-500 mb-[10px] leading-relaxed'>
                {b('key_help')}{' '}
                <span
                    className='text-primary cursor-pointer underline'
                    onClick={() => open('https://learn.microsoft.com/azure/ai-services/translator/create-translator-resource')}
                >
                    {b('key_link')}
                </span>
            </p>
            {field('key', b('key'), { type: 'password', placeholder: b('key_placeholder') })}
            {field('region', b('region'), { placeholder: b('region_placeholder') })}
            <Button
                type='submit'
                isLoading={isLoading}
                color='primary'
                fullWidth
            >
                {t('common.save')}
            </Button>
        </form>
    );
}
