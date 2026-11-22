// Icons an AI button can use (Config > AI buttons, translate window)
import React from 'react';
import {
    LuMessageCircle,
    LuSparkles,
    LuSpellCheck,
    LuListChecks,
    LuBookOpen,
    LuLanguages,
    LuWand2,
    LuPenLine,
    LuSmile,
    LuBriefcase,
    LuMail,
    LuCode,
    LuLightbulb,
    LuQuote,
    LuHeart,
    LuZap,
    LuGlobe,
    LuGraduationCap,
    LuBot,
    LuMegaphone,
    LuFileText,
} from 'react-icons/lu';

export const MODE_ICONS = {
    message: LuMessageCircle,
    sparkles: LuSparkles,
    spellcheck: LuSpellCheck,
    list: LuListChecks,
    book: LuBookOpen,
    languages: LuLanguages,
    wand: LuWand2,
    pen: LuPenLine,
    smile: LuSmile,
    briefcase: LuBriefcase,
    mail: LuMail,
    code: LuCode,
    lightbulb: LuLightbulb,
    quote: LuQuote,
    heart: LuHeart,
    zap: LuZap,
    globe: LuGlobe,
    graduation: LuGraduationCap,
    bot: LuBot,
    megaphone: LuMegaphone,
    file: LuFileText,
};

export function ModeIcon({ name, className }) {
    const Icon = MODE_ICONS[name] ?? LuSparkles;
    return <Icon className={className} />;
}
