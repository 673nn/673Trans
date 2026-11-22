import { Card, Button, CardFooter, Dropdown, DropdownMenu, DropdownTrigger, DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { BiTransferAlt } from 'react-icons/bi';
import React, { useEffect } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { LuPlus } from 'react-icons/lu';
import { invoke } from '@tauri-apps/api';

import { translateModeAtom, MODES_KEY, defaultModes, normalizeModes } from '../../../../utils/translate_mode';
import { listen } from '@tauri-apps/api/event';
import { ModeIcon } from '../../../../utils/mode_icons';
import { languageList } from '../../../../utils/language';
import { detectLanguageAtom } from '../SourceArea';
import { useConfig } from '../../../../hooks';

export const sourceLanguageAtom = atom();
export const targetLanguageAtom = atom();

export default function LanguageArea() {
    const [rememberLanguage] = useConfig('translate_remember_language', false);
    const [translateSourceLanguage, setTranslateSourceLanguage] = useConfig('translate_source_language', 'auto');
    const [translateTargetLanguage, setTranslateTargetLanguage] = useConfig('translate_target_language', 'zh_cn');
    const [translateSecondLanguage] = useConfig('translate_second_language', 'en');

    const [sourceLanguage, setSourceLanguage] = useAtom(sourceLanguageAtom);
    const [targetLanguage, setTargetLanguage] = useAtom(targetLanguageAtom);
    const detectLanguage = useAtomValue(detectLanguageAtom);
    const { t } = useTranslation();
    const [mode, setMode] = useAtom(translateModeAtom);
    const [savedModes] = useConfig(MODES_KEY, defaultModes());
    const modes = savedModes ? normalizeModes(savedModes) : null;
    const shown = (modes ?? []).filter((m) => m.enabled !== false);

    // opened by an AI button's hotkey / the selection toolbar: turn that button on
    useEffect(() => {
        const pick = () =>
            invoke('take_translate_mode')
                .then((id) => id && setMode(id))
                .catch(() => {});
        pick();
        const un = listen('new_text', pick);
        return () => {
            un.then((f) => f());
        };
    }, []);

    // a button that was removed or hidden can't stay selected
    useEffect(() => {
        if (modes && mode !== 'translate' && !modes.some((m) => m.id === mode)) setMode('translate');
    }, [savedModes]);

    useEffect(() => {
        if (translateSourceLanguage) {
            setSourceLanguage(translateSourceLanguage);
        }
        if (translateTargetLanguage) {
            setTargetLanguage(translateTargetLanguage);
        }
    }, [translateSourceLanguage, translateTargetLanguage]);

    useEffect(() => {
        if (rememberLanguage !== null && rememberLanguage) {
            setTranslateSourceLanguage(sourceLanguage);
            setTranslateTargetLanguage(targetLanguage);
        }
    }, [sourceLanguage, targetLanguage, rememberLanguage]);

    return (
        <>
            <Card
                shadow='none'
                className='bg-content2 h-[35px] rounded-[10px]'
            >
                <CardFooter className='bg-content2 flex justify-between p-0 rounded-[10px]'>
                    <div className='flex'>
                        <Dropdown>
                            <DropdownTrigger>
                                <Button
                                    radius='sm'
                                    variant='light'
                                >
                                    {t(`languages.${sourceLanguage}`)}
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                aria-label='Source Language'
                                className='max-h-[50vh] overflow-y-auto'
                                onAction={(key) => {
                                    setSourceLanguage(key);
                                }}
                            >
                                <DropdownItem key='auto'>{t('languages.auto')}</DropdownItem>
                                {languageList.map((x) => {
                                    return <DropdownItem key={x}>{t(`languages.${x}`)}</DropdownItem>;
                                })}
                            </DropdownMenu>
                        </Dropdown>
                    </div>
                    <div className='flex'>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            className='text-[20px]'
                            onPress={async () => {
                                if (sourceLanguage !== 'auto') {
                                    const oldSourceLanguage = sourceLanguage;
                                    setSourceLanguage(targetLanguage);
                                    setTargetLanguage(oldSourceLanguage);
                                } else {
                                    if (detectLanguage !== '') {
                                        if (targetLanguage === translateTargetLanguage) {
                                            setTargetLanguage(detectLanguage);
                                        } else {
                                            setTargetLanguage(translateTargetLanguage);
                                        }
                                    } else {
                                        if (targetLanguage === translateSecondLanguage) {
                                            setTargetLanguage(translateTargetLanguage);
                                        } else {
                                            setTargetLanguage(secondLanguage);
                                        }
                                    }
                                }
                            }}
                        >
                            <BiTransferAlt />
                        </Button>
                    </div>
                    <div className='flex'>
                        <Dropdown>
                            <DropdownTrigger>
                                <Button
                                    radius='sm'
                                    variant='light'
                                >
                                    {t(`languages.${targetLanguage}`)}
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                aria-label='Target Language'
                                className='max-h-[50vh] overflow-y-auto'
                                onAction={(key) => {
                                    setTargetLanguage(key);
                                }}
                            >
                                {languageList.map((x) => {
                                    return <DropdownItem key={x}>{t(`languages.${x}`)}</DropdownItem>;
                                })}
                            </DropdownMenu>
                        </Dropdown>
                    </div>
                </CardFooter>
            </Card>
            <div className='mode-row'>
                {shown.map((m) => (
                    <Button
                        key={m.id}
                        size='sm'
                        radius='full'
                        variant={mode === m.id ? 'solid' : 'flat'}
                        color={mode === m.id ? 'primary' : 'default'}
                        startContent={<ModeIcon name={m.icon} />}
                        onPress={() => setMode(mode === m.id ? 'translate' : m.id)}
                    >
                        {m.name || t(`translate.mode_${m.builtin}`)}
                    </Button>
                ))}
                <Button
                    size='sm'
                    radius='full'
                    variant='light'
                    isIconOnly
                    title={t('translate.mode_manage')}
                    onPress={() => invoke('open_config_page', { path: '/aimodes' })}
                >
                    <LuPlus />
                </Button>
            </div>
        </>
    );
}
