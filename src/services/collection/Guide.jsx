// Setup steps shown at the top of a collection service's settings (Anki, Eudic)
import { open } from '@tauri-apps/api/shell';
import React from 'react';

// steps: strings; a part written as [label](https://...) becomes a link
export default function Guide({ title, steps }) {
    const render = (s) =>
        s.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
            const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
            return (
                <span
                    key={i}
                    className='text-primary underline cursor-pointer'
                    onClick={() => open(m[2])}
                >
                    {m[1]}
                </span>
            );
        });
    return (
        <div className='rounded-[12px] bg-default-100 px-[14px] py-[12px] mb-[14px]'>
            <p className='text-[13.5px] font-semibold mb-[6px]'>{title}</p>
            <ol className='list-decimal pl-[18px] flex flex-col gap-[4px] text-[13px] text-default-600 leading-relaxed'>
                {steps.map((s, i) => (
                    <li key={i}>{render(s)}</li>
                ))}
            </ol>
        </div>
    );
}
