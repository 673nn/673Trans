// AI buttons of the translate window (English Chat, Polish, …): show / hide, order, edit the
// prompts, add your own. Stored under MODES_KEY (src/utils/translate_mode.js).
import {
    Button,
    Chip,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    Tab,
    Tabs,
    Textarea,
} from '@nextui-org/react';
import { unregister, isRegistered } from '@tauri-apps/api/globalShortcut';
import { invoke } from '@tauri-apps/api';
import toast, { Toaster } from 'react-hot-toast';
import { LuPlus, LuPencil, LuTrash2, LuRotateCcw, LuArrowUp, LuArrowDown, LuMousePointerClick, LuKeyboard } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../../hooks/useConfig';
import { MODES_KEY, defaultModes, builtinMode, newModeId, normalizeModes } from '../../../../utils/translate_mode';
import { HotkeyControl } from '../Hotkey';
import { useToastStyle } from '../../../../hooks';
import { MODE_ICONS, ModeIcon } from '../../../../utils/mode_icons';

export default function AiModes() {
    const { t } = useTranslation();
    const a = (k, o) => t(`config.aimodes.${k}`, o);
    const [saved, setModes] = useConfig(MODES_KEY, defaultModes());
    const modes = saved ? normalizeModes(saved) : null;
    const toastStyle = useToastStyle();
    const [editing, setEditing] = useState(null); // a copy of the mode being edited
    const [isNew, setIsNew] = useState(false);

    if (modes === null) return null;

    // global shortcut of a button: registered right away (Rust: register_ai_hotkey)
    const swapHotkey = async (oldKey, newKey, id) => {
        if (oldKey && oldKey !== newKey) await unregister(oldKey).catch(() => {});
        if (!newKey || newKey === oldKey) return true;
        if (await isRegistered(newKey).catch(() => false)) {
            toast.error(t('config.hotkey.is_register'), { style: toastStyle });
            return false;
        }
        try {
            await invoke('register_ai_hotkey', { shortcut: newKey, id });
            return true;
        } catch (e) {
            toast.error(String(e), { style: toastStyle });
            return false;
        }
    };
    const label = (m) => m.name || (m.builtin ? t(`translate.mode_${m.builtin}`) : a('untitled'));
    const changed = (m) => {
        if (!m.builtin) return false;
        const d = builtinMode(m.builtin);
        return (
            m.name !== '' ||
            m.icon !== d.icon ||
            m.system !== d.system ||
            m.user !== d.user ||
            m.action !== d.action ||
            m.list !== d.list
        );
    };
    const update = (id, patch) => setModes(modes.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= modes.length) return;
        const next = [...modes];
        [next[i], next[j]] = [next[j], next[i]];
        setModes(next);
    };
    const openNew = () => {
        setIsNew(true);
        setEditing({
            id: newModeId(),
            builtin: null,
            name: '',
            icon: 'wand',
            system: '',
            user: '$text',
            enabled: true,
            toolbar: false,
            hotkey: '',
            action: 'popup',
            list: false,
        });
    };
    const save = async () => {
        const m = { ...editing, name: editing.name.trim() };
        const old = modes.find((x) => x.id === m.id);
        const ok = await swapHotkey(old?.hotkey ?? '', m.hotkey ?? '', m.id);
        if (!ok) m.hotkey = '';
        if (isNew) setModes([...modes, m]);
        else update(m.id, m);
        setEditing(null);
    };
    const restoreDefaults = async () => {
        for (const m of modes.filter((x) => x.builtin && x.hotkey)) await unregister(m.hotkey).catch(() => {});
        const custom = modes.filter((m) => !m.builtin);
        setModes([...defaultModes(), ...custom]);
    };

    return (
        <>
            <Toaster />
            <p className='text-[13px] text-default-500 mb-[14px] leading-relaxed'>{a('desc')}</p>
            <h4 className='config-section-title'>{a('list')}</h4>
            <div className='flex flex-col gap-[8px] mb-[14px]'>
                {modes.map((m, i) => (
                    <div
                        key={m.id}
                        className='flex items-center gap-[10px] px-[14px] py-[10px] rounded-[12px] bg-content1'
                    >
                        <div className='w-[30px] h-[30px] rounded-[8px] bg-default-100 flex items-center justify-center text-[15px] flex-none'>
                            <ModeIcon name={m.icon} />
                        </div>
                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-[6px]'>
                                <span className='text-[14px] truncate'>{label(m)}</span>
                                {m.builtin && (
                                    <Chip
                                        size='sm'
                                        variant='flat'
                                        className='h-[18px] text-[11px]'
                                    >
                                        {changed(m) ? a('builtin_changed') : a('builtin')}
                                    </Chip>
                                )}
                            </div>
                            <p className='text-[12px] text-default-400 truncate'>{m.system || m.user}</p>
                            {(m.hotkey || m.toolbar) && (
                                <div className='flex items-center gap-[10px] mt-[3px] text-[11.5px] text-default-500'>
                                    {m.hotkey && (
                                        <span className='flex items-center gap-[4px]'>
                                            <LuKeyboard /> {m.hotkey.replaceAll('+', ' + ')}
                                        </span>
                                    )}
                                    {m.toolbar && (
                                        <span className='flex items-center gap-[4px]'>
                                            <LuMousePointerClick /> {a('on_toolbar')}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            title={a('up')}
                            isDisabled={i === 0}
                            onPress={() => move(i, -1)}
                        >
                            <LuArrowUp />
                        </Button>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            title={a('down')}
                            isDisabled={i === modes.length - 1}
                            onPress={() => move(i, 1)}
                        >
                            <LuArrowDown />
                        </Button>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            title={a('edit')}
                            onPress={() => {
                                setIsNew(false);
                                setEditing({ ...m });
                            }}
                        >
                            <LuPencil />
                        </Button>
                        {m.builtin ? (
                            <Button
                                isIconOnly
                                size='sm'
                                variant='light'
                                title={a('reset')}
                                isDisabled={!changed(m)}
                                onPress={() =>
                                    update(m.id, {
                                        ...builtinMode(m.builtin),
                                        enabled: m.enabled,
                                        toolbar: m.toolbar,
                                        hotkey: m.hotkey,
                                    })
                                }
                            >
                                <LuRotateCcw />
                            </Button>
                        ) : (
                            <Button
                                isIconOnly
                                size='sm'
                                variant='light'
                                color='danger'
                                title={a('delete')}
                                onPress={async () => {
                                    if (m.hotkey) await unregister(m.hotkey).catch(() => {});
                                    setModes(modes.filter((x) => x.id !== m.id));
                                }}
                            >
                                <LuTrash2 />
                            </Button>
                        )}
                        <Switch
                            size='sm'
                            isSelected={m.enabled !== false}
                            onValueChange={(v) => update(m.id, { enabled: v })}
                            aria-label={a('show')}
                        />
                    </div>
                ))}
            </div>
            <div className='flex gap-[8px] mb-[20px]'>
                <Button
                    size='sm'
                    color='primary'
                    startContent={<LuPlus />}
                    onPress={openNew}
                >
                    {a('add')}
                </Button>
                <Button
                    size='sm'
                    variant='flat'
                    startContent={<LuRotateCcw />}
                    onPress={restoreDefaults}
                >
                    {a('restore')}
                </Button>
            </div>

            <Modal
                isOpen={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
                size='2xl'
                scrollBehavior='inside'
            >
                <ModalContent>
                    {editing && (
                        <>
                            <ModalHeader>{isNew ? a('add') : a('edit_title', { name: label(editing) })}</ModalHeader>
                            <ModalBody className='gap-[14px]'>
                                <Input
                                    label={a('name')}
                                    labelPlacement='outside'
                                    variant='bordered'
                                    placeholder={editing.builtin ? t(`translate.mode_${editing.builtin}`) : a('name_placeholder')}
                                    value={editing.name}
                                    onValueChange={(v) => setEditing({ ...editing, name: v })}
                                />
                                <div>
                                    <p className='text-[14px] mb-[6px]'>{a('icon')}</p>
                                    <div className='flex flex-wrap gap-[6px]'>
                                        {Object.keys(MODE_ICONS).map((k) => (
                                            <Button
                                                key={k}
                                                isIconOnly
                                                size='sm'
                                                variant={editing.icon === k ? 'solid' : 'flat'}
                                                color={editing.icon === k ? 'primary' : 'default'}
                                                onPress={() => setEditing({ ...editing, icon: k })}
                                            >
                                                <ModeIcon name={k} />
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div className='flex flex-col gap-[10px] rounded-[12px] bg-default-50 p-[12px]'>
                                    <div className='flex items-center justify-between gap-[12px]'>
                                        <div>
                                            <p className='text-[14px]'>{a('hotkey')}</p>
                                            <p className='text-[12px] text-default-500'>{a('hotkey_desc')}</p>
                                        </div>
                                        <HotkeyControl
                                            value={editing.hotkey ?? ''}
                                            onSet={(v) => setEditing({ ...editing, hotkey: v })}
                                        />
                                    </div>
                                    <div className='flex items-center justify-between gap-[12px]'>
                                        <div>
                                            <p className='text-[14px]'>{a('toolbar')}</p>
                                            <p className='text-[12px] text-default-500'>{a('toolbar_desc')}</p>
                                        </div>
                                        <Switch
                                            isSelected={!!editing.toolbar}
                                            onValueChange={(v) => setEditing({ ...editing, toolbar: v })}
                                        />
                                    </div>
                                    <div className='flex items-center justify-between gap-[12px]'>
                                        <div>
                                            <p className='text-[14px]'>{a('action')}</p>
                                            <p className='text-[12px] text-default-500'>
                                                {editing.action === 'replace' ? a('action_replace_desc') : a('action_popup_desc')}
                                            </p>
                                        </div>
                                        <Tabs
                                            size='sm'
                                            selectedKey={editing.action ?? 'popup'}
                                            onSelectionChange={(k) => setEditing({ ...editing, action: String(k) })}
                                        >
                                            <Tab
                                                key='replace'
                                                title={a('action_replace')}
                                            />
                                            <Tab
                                                key='popup'
                                                title={a('action_popup')}
                                            />
                                        </Tabs>
                                    </div>
                                    <div className='flex items-center justify-between gap-[12px]'>
                                        <div>
                                            <p className='text-[14px]'>{a('list_result')}</p>
                                            <p className='text-[12px] text-default-500'>{a('list_result_desc')}</p>
                                        </div>
                                        <Switch
                                            isSelected={!!editing.list}
                                            onValueChange={(v) => setEditing({ ...editing, list: v })}
                                        />
                                    </div>
                                </div>
                                <Textarea
                                    label={a('system')}
                                    labelPlacement='outside'
                                    variant='bordered'
                                    minRows={6}
                                    maxRows={14}
                                    placeholder={a('system_placeholder')}
                                    value={editing.system}
                                    onValueChange={(v) => setEditing({ ...editing, system: v })}
                                />
                                <Textarea
                                    label={a('user')}
                                    labelPlacement='outside'
                                    variant='bordered'
                                    minRows={2}
                                    maxRows={6}
                                    value={editing.user}
                                    onValueChange={(v) => setEditing({ ...editing, user: v })}
                                />
                                <p className='text-[12.5px] text-default-500 leading-relaxed'>{a('vars')}</p>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant='light'
                                    onPress={() => setEditing(null)}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    color='primary'
                                    isDisabled={!editing.system.trim() || (!editing.builtin && !editing.name.trim())}
                                    onPress={save}
                                >
                                    {t('common.save')}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}
