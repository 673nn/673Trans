// Backup: three places to keep a backup ZIP, each in its own card on one page.
import { Button, Card, CardBody, Chip, Input, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig, useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import * as webdav from './utils/webdav';
import WebDavModal from './WebDavModal';
import GDriveModal from './GDriveModal';
import * as local from './utils/local';
import * as gdrive from './utils/gdrive';

const backupName = () => {
    const d = new Date();
    return `${osType}-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}`;
};

function Place({ title, status, desc, hint, children, form }) {
    return (
        <Card className='mb-[12px]'>
            <CardBody className='px-[18px] py-[16px] gap-[10px]'>
                <div className='flex items-center justify-between'>
                    <h3 className='text-[16px] font-semibold'>{title}</h3>
                    {status}
                </div>
                <p className='text-[13.5px] text-default-500 leading-relaxed'>{desc}</p>
                {hint && <p className='text-[12.5px] text-default-400'>{hint}</p>}
                {form}
                <div className='flex items-center gap-[8px] flex-wrap'>{children}</div>
            </CardBody>
        </Card>
    );
}

export default function Backup() {
    const [davUserName, setDavUserName] = useConfig('webdav_username', '');
    const [davPassword, setDavPassword] = useConfig('webdav_password', '');
    const [davUrl, setDavUrl] = useConfig('webdav_url', '');
    const [gdriveClientId, setGdriveClientId] = useConfig('gdrive_client_id', '');
    const [gdriveClientSecret, setGdriveClientSecret] = useConfig('gdrive_client_secret', '');
    const [gdriveRefreshToken, setGdriveRefreshToken] = useConfig('gdrive_refresh_token', '');
    const [busy, setBusy] = useState(''); // 'local' | 'webdav' | 'gdrive' while exporting
    const [signingIn, setSigningIn] = useState(false);
    const [davForm, setDavForm] = useState(false);
    const [gForm, setGForm] = useState(false);
    const dav = useDisclosure();
    const gd = useDisclosure();
    const toastStyle = useToastStyle();
    const { t } = useTranslation();
    const b = (k) => t(`config.backup.${k}`);

    const loaded = [davUserName, davPassword, davUrl, gdriveClientId, gdriveClientSecret, gdriveRefreshToken].every(
        (v) => v !== null
    );
    if (!loaded) return null;

    const davReady = davUrl.trim() !== '';
    const gReady = gdriveRefreshToken !== '';

    const run = async (place, job, okText) => {
        setBusy(place);
        try {
            await job();
            toast.success(okText, { style: toastStyle });
        } catch (e) {
            if (String(e) !== 'Invalid File') toast.error(String(e), { style: toastStyle });
        }
        setBusy('');
    };

    const onGDriveLogin = async () => {
        setSigningIn(true);
        try {
            const token = await gdrive.login(gdriveClientId, gdriveClientSecret);
            setGdriveRefreshToken(token);
            toast.success(b('login_success'), { style: toastStyle });
            setGForm(false);
        } catch (e) {
            toast.error(String(e), { style: toastStyle });
        }
        setSigningIn(false);
    };

    const field = (label, value, setValue, type = 'text') => (
        <Input
            size='sm'
            variant='bordered'
            label={label}
            type={type}
            value={value}
            onValueChange={setValue}
        />
    );
    const statusChip = (ok, okText, offText) => (
        <Chip
            size='sm'
            variant='flat'
            color={ok ? 'success' : 'default'}
        >
            {ok ? okText : offText}
        </Chip>
    );

    return (
        <>
            <Toaster />
            <h4 className='config-section-title'>{b('places')}</h4>

            <Place
                title={b('local_title')}
                desc={b('local_desc')}
            >
                <div className='flex-1' />
                <Button
                    size='sm'
                    color='danger'
                    variant='flat'
                    onPress={() => run('', () => local.get(), b('load_success'))}
                >
                    {b('import_file')}
                </Button>
                <Button
                    size='sm'
                    color='primary'
                    isLoading={busy === 'local'}
                    onPress={() => run('local', () => local.backup(backupName()), b('backup_success'))}
                >
                    {b('export_file')}
                </Button>
            </Place>

            <Place
                title='WebDAV'
                status={statusChip(davReady, b('configured'), b('not_configured'))}
                desc={b('webdav_desc')}
                hint={!davReady && !davForm ? b('webdav_hint') : null}
                form={
                    davForm && (
                        <div className='grid grid-cols-1 gap-[8px] max-w-[460px]'>
                            {field(b('webdav_url'), davUrl, setDavUrl)}
                            {field(b('username'), davUserName, setDavUserName)}
                            {field(b('password'), davPassword, setDavPassword, 'password')}
                        </div>
                    )
                }
            >
                <Button
                    size='sm'
                    variant='flat'
                    onPress={() => setDavForm(!davForm)}
                >
                    {davForm ? b('done') : b('configure')}
                </Button>
                <div className='flex-1' />
                <Button
                    size='sm'
                    variant='flat'
                    isDisabled={!davReady}
                    onPress={dav.onOpen}
                >
                    {b('browse')}
                </Button>
                <Button
                    size='sm'
                    color='primary'
                    variant={davReady ? 'solid' : 'flat'}
                    isDisabled={!davReady}
                    isLoading={busy === 'webdav'}
                    onPress={() =>
                        run('webdav', () => webdav.backup(davUrl, davUserName, davPassword, backupName() + '.zip'), b('backup_success'))
                    }
                >
                    {b('export_now')}
                </Button>
            </Place>

            <Place
                title='Google Drive'
                status={statusChip(gReady, b('gdrive_logged_in'), b('gdrive_not_logged_in'))}
                desc={b('gdrive_desc')}
                hint={!gReady && !gForm ? b('gdrive_need_login') : null}
                form={
                    gForm && (
                        <div className='flex flex-col gap-[8px] max-w-[460px]'>
                            <p className='text-[12.5px] text-default-500'>{b('gdrive_hint')}</p>
                            {field('Client ID', gdriveClientId, setGdriveClientId)}
                            {field('Client Secret', gdriveClientSecret, setGdriveClientSecret, 'password')}
                            <div className='flex gap-[8px]'>
                                <Button
                                    size='sm'
                                    color='primary'
                                    variant='flat'
                                    isLoading={signingIn}
                                    isDisabled={!gdriveClientId.trim()}
                                    onPress={onGDriveLogin}
                                >
                                    {b('gdrive_login')}
                                </Button>
                                {gReady && (
                                    <Button
                                        size='sm'
                                        variant='light'
                                        onPress={() => setGdriveRefreshToken('')}
                                    >
                                        {b('logout')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )
                }
            >
                <Button
                    size='sm'
                    variant='flat'
                    onPress={() => setGForm(!gForm)}
                >
                    {gForm ? b('done') : b('configure')}
                </Button>
                <div className='flex-1' />
                <Button
                    size='sm'
                    variant='flat'
                    isDisabled={!gReady}
                    onPress={gd.onOpen}
                >
                    {b('browse')}
                </Button>
                <Button
                    size='sm'
                    color='primary'
                    variant={gReady ? 'solid' : 'flat'}
                    isDisabled={!gReady}
                    isLoading={busy === 'gdrive'}
                    onPress={() =>
                        run(
                            'gdrive',
                            () => gdrive.backup(gdriveClientId, gdriveClientSecret, gdriveRefreshToken, backupName() + '.zip'),
                            b('backup_success')
                        )
                    }
                >
                    {b('export_now')}
                </Button>
            </Place>

            <WebDavModal
                isOpen={dav.isOpen}
                onOpenChange={dav.onOpenChange}
                url={davUrl}
                username={davUserName}
                password={davPassword}
            />
            <GDriveModal
                isOpen={gd.isOpen}
                onOpenChange={gd.onOpenChange}
                clientId={gdriveClientId}
                clientSecret={gdriveClientSecret}
                refreshToken={gdriveRefreshToken}
            />
        </>
    );
}
