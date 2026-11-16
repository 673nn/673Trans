// Network settings: how 673Trans reaches the internet (direct / system proxy / custom proxy).
// The choice is applied right away by src-tauri/src/cmd.rs (apply_network).
import { Tabs, Tab, Input, Select, SelectItem, Switch, Button } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api';

import { Section, Row } from '../../components/Setting';
import { useConfig } from '../../../../hooks/useConfig';

export default function Network() {
    const { t } = useTranslation();
    const [mode, setMode] = useConfig('proxy_mode', 'system');
    const [type, setType] = useConfig('proxy_type', 'http');
    const [host, setHost] = useConfig('proxy_host', '');
    const [port, setPort] = useConfig('proxy_port', '');
    const [auth, setAuth] = useConfig('proxy_auth', false);
    const [username, setUsername] = useConfig('proxy_username', '');
    const [password, setPassword] = useConfig('proxy_password', '');
    const [noProxy, setNoProxy] = useConfig('no_proxy', 'localhost,127.0.0.1');
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState(null);
    const timer = useRef(null);

    const loaded = [mode, type, host, port, auth, username, password, noProxy].every((v) => v !== null);

    // apply shortly after the last change
    useEffect(() => {
        if (!loaded) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            invoke('apply_network').catch(() => {});
        }, 600);
        return () => clearTimeout(timer.current);
    }, [loaded, mode, type, host, port, auth, username, password, noProxy]);

    const test = async () => {
        setTesting(true);
        setResult(null);
        try {
            // make sure the latest values are in force before testing
            await new Promise((r) => setTimeout(r, 700));
            await invoke('apply_network');
            const ms = await invoke('test_network');
            setResult({ ok: true, text: t('config.network.test_ok', { ms }) });
        } catch (e) {
            setResult({ ok: false, text: String(e) });
        }
        setTesting(false);
    };

    if (!loaded) return null;
    const custom = mode === 'custom';

    return (
        <>
            <Section title={t('config.network.proxy_server')}>
                <Row
                    label={t('config.network.mode')}
                    desc={t('config.network.mode_desc')}
                >
                    <Tabs
                        selectedKey={mode}
                        onSelectionChange={(k) => setMode(String(k))}
                        size='sm'
                    >
                        <Tab
                            key='direct'
                            title={t('config.network.direct')}
                        />
                        <Tab
                            key='system'
                            title={t('config.network.system')}
                        />
                        <Tab
                            key='custom'
                            title={t('config.network.custom')}
                        />
                    </Tabs>
                </Row>
                <Row label={t('config.network.type')}>
                    <Select
                        aria-label={t('config.network.type')}
                        variant='bordered'
                        isDisabled={!custom}
                        disallowEmptySelection
                        selectedKeys={[type]}
                        onSelectionChange={(keys) => setType(Array.from(keys)[0])}
                        className='max-w-[180px]'
                    >
                        <SelectItem key='http'>HTTP</SelectItem>
                        <SelectItem key='socks5'>SOCKS5</SelectItem>
                    </Select>
                </Row>
                <Row label={t('config.network.host')}>
                    <Input
                        variant='bordered'
                        isDisabled={!custom}
                        placeholder='127.0.0.1'
                        value={host}
                        onValueChange={setHost}
                        className='max-w-[260px]'
                    />
                </Row>
                <Row label={t('config.network.port')}>
                    <Input
                        type='number'
                        variant='bordered'
                        isDisabled={!custom}
                        placeholder='8080'
                        value={String(port)}
                        onValueChange={(v) => {
                            const n = parseInt(v);
                            if (Number.isNaN(n) || n < 0) setPort('');
                            else setPort(Math.min(n, 65535));
                        }}
                        className='max-w-[180px]'
                    />
                </Row>
                <Row
                    label={t('config.network.no_proxy')}
                    desc={t('config.network.no_proxy_desc')}
                >
                    <Input
                        variant='bordered'
                        isDisabled={!custom}
                        value={noProxy}
                        onValueChange={setNoProxy}
                        className='max-w-[260px]'
                    />
                </Row>
            </Section>

            <Section title={t('config.network.auth')}>
                <Row label={t('config.network.auth_enable')}>
                    <Switch
                        isDisabled={!custom}
                        isSelected={auth}
                        onValueChange={setAuth}
                    />
                </Row>
                <Row label={t('config.network.username')}>
                    <Input
                        variant='bordered'
                        isDisabled={!custom || !auth}
                        value={username}
                        onValueChange={setUsername}
                        className='max-w-[260px]'
                    />
                </Row>
                <Row label={t('config.network.password')}>
                    <Input
                        type='password'
                        variant='bordered'
                        isDisabled={!custom || !auth}
                        value={password}
                        onValueChange={setPassword}
                        className='max-w-[260px]'
                    />
                </Row>
            </Section>

            <Section>
                <Row
                    label={t('config.network.test')}
                    desc={result ? result.text : t('config.network.test_desc')}
                >
                    <Button
                        color='primary'
                        variant='flat'
                        isLoading={testing}
                        onPress={test}
                    >
                        {t('config.network.test_button')}
                    </Button>
                </Row>
            </Section>
        </>
    );
}
