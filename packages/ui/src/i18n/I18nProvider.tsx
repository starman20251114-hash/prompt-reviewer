import { type ReactNode, createContext, useContext } from "react";
import { enMessages } from "./messages/en";
import { jaMessages } from "./messages/ja";

type Locale = "ja" | "en";
type TranslateValues = Record<string, string | number>;
type MessageDictionary = {
  [key: string]: string | MessageDictionary;
};

type I18nContextValue = {
  locale: Locale;
  t: (key: string, values?: TranslateValues) => string;
};

const dictionaries: Record<Locale, MessageDictionary> = {
  ja: jaMessages,
  en: enMessages,
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getMessage(dictionary: MessageDictionary, key: string): string | null {
  const value = key.split(".").reduce<string | MessageDictionary | undefined>((current, part) => {
    if (!current || typeof current === "string") {
      return undefined;
    }

    return current[part];
  }, dictionary);

  return typeof value === "string" ? value : null;
}

function interpolate(message: string, values?: TranslateValues): string {
  if (!values) {
    return message;
  }

  return message.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? `{${token}}`));
}

export function I18nProvider({
  children,
  locale = "ja",
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  const dictionary = dictionaries[locale];

  const contextValue: I18nContextValue = {
    locale,
    t: (key, values) => {
      const message = getMessage(dictionary, key) ?? getMessage(dictionaries.ja, key) ?? key;
      return interpolate(message, values);
    },
  };

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
