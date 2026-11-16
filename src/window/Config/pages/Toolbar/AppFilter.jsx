// App filter of the selection toolbar: block list or allow list of programs (exe names).
// Stored as comma separated exe names in selection_toolbar_blacklist / _whitelist,
// read by src-tauri/src/sel_toolbar.rs (blacklisted).
import { Button, Input, Modal, ModalBody, ModalContent, ModalHeader, Spinner, Tab, Tabs } from '@nextui-org/react';
import { LuLayoutGrid, LuPlus, LuSearch, LuX, LuCheck, LuFolderOpen } from 'react-icons/lu';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

const parse = (s) =>
    (s ?? '')
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
const same = (a, b) => a.toLowerCase().replace(/\.exe$/, '') === b.toLowerCase().replace(/\.exe$/, '');
const COLORS = ['#0a84ff', '#ff9500', '#34c759', '#af52de', '#ff375f', '#5ac8fa', '#ffcc00', '#64d2ff'];
const colorOf = (name) => COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

function Avatar({ name }) {
    return (
        <div
            className='w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-[13px] font-semibold text-white flex-none'
            style={{ background: colorOf(name) }}
        >
            {name.replace(/\.exe$/i, '').slice(0, 1).toUpperCase()}
        </div>
    );
}

export default function AppFilter() {
    const { t } = useTranslation();
    const a = (k, o) => t(`config.toolbar.filter.${k}`, o);
    const [mode, setMode] = useConfig('selection_toolbar_filter_mode', 'block');
    const [blacklist, setBlacklist] = useConfig('selection_toolbar_blacklist', '');
    const [whitelist, setWhitelist] = useConfig('selection_toolbar_whitelist', '');
    const [picker, setPicker] = useState(false);
    const [running, setRunning] = useState(null);
    const [query, setQuery] = useState('');

    if (mode === null || blacklist === null || whitelist === null) return null;
    const allow = mode === 'allow';
    const list = parse(allow ? whitelist : blacklist);
    const save = (next) => (allow ? setWhitelist : setBlacklist)(next.join(', '));
    const add = (exe) => {
        if (!exe || list.some((x) => same(x, exe))) return;
        save([...list, exe]);
    };
    const remove = (exe) => save(list.filter((x) => !same(x, exe)));

    const openPicker = async () => {
        setPicker(true);
        setQuery('');
        setRunning(null);
        try {
            setRunning(await invoke('list_running_apps'));
        } catch {
            setRunning([]);
        }
    };
    const browse = async () => {
        const file = await open({ multiple: false, filters: [{ name: 'App', extensions: ['exe'] }] });
        if (typeof file === 'string') add(file.split(/[\\/]/).pop());
    };

    const q = query.trim().toLowerCase();
    const shown = (running ?? []).filter((r) => !q || r.exe.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));

    return (
        <>
            <Section title={a('title')}>
                <Row
                    label={a('mode')}
                    desc={allow ? a('mode_allow_desc') : a('mode_block_desc')}
                >
                    <Tabs
                        size='sm'
                        selectedKey={mode}
                        onSelectionChange={(k) => setMode(String(k))}
                    >
                        <Tab
                            key='block'
                            title={a('block')}
                        />
                        <Tab
                            key='allow'
                            title={a('allow')}
                        />
                    </Tabs>
                </Row>
                <div className='flex items-center justify-between pt-[10px] pb-[8px]'>
                    <h3 className='text-[14px]'>{a('list')}</h3>
                    <Button
                        size='sm'
                        variant='flat'
                        startContent={<LuPlus />}
                        onPress={openPicker}
                    >
                        {a('add')}
                    </Button>
                </div>
                {list.length === 0 ? (
                    <div className='border-2 border-dashed border-default-300 rounded-[12px] py-[26px] px-[20px] flex flex-col items-center gap-[8px] text-center mb-[4px]'>
                        <div className='w-[32px] h-[32px] rounded-[8px] bg-default-100 flex items-center justify-center'>
                            <LuLayoutGrid className='text-[16px]' />
                        </div>
                        <p className='text-[14px] font-medium'>{a('empty')}</p>
                        <p className='text-[13px] text-default-500 max-w-[380px]'>
                            {allow ? a('empty_allow') : a('empty_block')}
                        </p>
                    </div>
                ) : (
                    <div className='flex flex-col gap-[6px] mb-[4px]'>
                        {list.map((exe) => (
                            <div
                                key={exe}
                                className='flex items-center gap-[10px] px-[10px] py-[7px] rounded-[10px] bg-default-100'
                            >
                                <Avatar name={exe} />
                                <span className='flex-1 text-[13.5px] truncate'>{exe}</span>
                                <Button
                                    isIconOnly
                                    size='sm'
                                    variant='light'
                                    title={a('remove')}
                                    onPress={() => remove(exe)}
                                >
                                    <LuX />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Modal
                isOpen={picker}
                onOpenChange={setPicker}
                scrollBehavior='inside'
                size='lg'
            >
                <ModalContent className='max-h-[80vh]'>
                    <ModalHeader className='flex flex-col gap-[2px]'>
                        <span>{a('add')}</span>
                        <span className='text-[12.5px] font-normal text-default-500'>{a('picker_desc')}</span>
                    </ModalHeader>
                    <ModalBody className='pb-[18px]'>
                        <div className='flex gap-[8px]'>
                            <Input
                                size='sm'
                                variant='bordered'
                                startContent={<LuSearch className='text-default-400' />}
                                placeholder={a('search')}
                                value={query}
                                onValueChange={setQuery}
                            />
                            <Button
                                size='sm'
                                variant='flat'
                                className='h-[32px]'
                                startContent={<LuFolderOpen />}
                                onPress={browse}
                            >
                                {a('browse')}
                            </Button>
                        </div>
                        {running === null ? (
                            <div className='flex justify-center py-[30px]'>
                                <Spinner size='sm' />
                            </div>
                        ) : shown.length === 0 ? (
                            <p className='text-center text-[13px] text-default-500 py-[24px]'>{a('none_running')}</p>
                        ) : (
                            <div className='flex flex-col gap-[4px]'>
                                {shown.map((r) => {
                                    const added = list.some((x) => same(x, r.exe));
                                    return (
                                        <button
                                            key={r.exe}
                                            type='button'
                                            disabled={added}
                                            onClick={() => add(r.exe)}
                                            title={r.path}
                                            className={`flex items-center gap-[10px] px-[10px] py-[7px] rounded-[10px] text-left transition-colors ${
                                                added ? 'opacity-60 cursor-default' : 'hover:bg-default-100'
                                            }`}
                                        >
                                            <Avatar name={r.exe} />
                                            <div className='flex-1 min-w-0'>
                                                <p className='text-[13.5px] truncate'>{r.exe}</p>
                                                <p className='text-[12px] text-default-500 truncate'>{r.title}</p>
                                            </div>
                                            {added ? (
                                                <LuCheck className='text-success' />
                                            ) : (
                                                <LuPlus className='text-default-500' />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>
        </>
    );
}
