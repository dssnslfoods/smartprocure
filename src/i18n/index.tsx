import { createContext, useContext, useState, type ReactNode } from 'react';
import en from './en';
import th from './th';

type Lang = 'en' | 'th';
const translations = { en, th };

type ContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<ContextType>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'th');

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let val: any = translations[lang];
    for (const k of keys) { val = val?.[k]; }
    if (typeof val !== 'string') {
      // fallback to english
      let fallback: any = translations['en'];
      for (const k of keys) { fallback = fallback?.[k]; }
      val = typeof fallback === 'string' ? fallback : key;
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        val = val.replace(`{{${k}}}`, String(v));
      });
    }
    return val;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const { t, lang, setLang } = useContext(I18nContext);
  return { t, i18n: { language: lang, changeLanguage: setLang } };
}

export const useT = () => useContext(I18nContext);
export default I18nContext;
