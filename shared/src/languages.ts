export interface LanguageInfo {
  code: string;
  name: string;
  /** BCP-47 tag used by the browser speech recognizer. */
  speechLocale: string;
  /** Languages written without spaces between words; fluency metrics count characters instead. */
  unspaced?: boolean;
}

/** Languages users can practice. Each needs speech-recognition support in mainstream browsers. */
export const TARGET_LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", speechLocale: "en-US" },
  { code: "es", name: "Spanish", speechLocale: "es-ES" },
  { code: "fr", name: "French", speechLocale: "fr-FR" },
  { code: "de", name: "German", speechLocale: "de-DE" },
  { code: "it", name: "Italian", speechLocale: "it-IT" },
  { code: "pt", name: "Portuguese", speechLocale: "pt-BR" },
  { code: "ja", name: "Japanese", speechLocale: "ja-JP", unspaced: true },
  { code: "ko", name: "Korean", speechLocale: "ko-KR" },
  { code: "zh", name: "Chinese (Mandarin)", speechLocale: "zh-CN", unspaced: true },
  { code: "ru", name: "Russian", speechLocale: "ru-RU" },
];

/** Native languages are informational only and never used to infer proficiency. */
export const NATIVE_LANGUAGES: { code: string; name: string }[] = [
  ...TARGET_LANGUAGES.map(({ code, name }) => ({ code, name })),
  { code: "mn", name: "Mongolian" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "nl", name: "Dutch" },
  { code: "fa", name: "Persian" },
  { code: "kk", name: "Kazakh" },
  { code: "other", name: "Other" },
];

export function getTargetLanguage(code: string): LanguageInfo | undefined {
  return TARGET_LANGUAGES.find((l) => l.code === code);
}

export function languageName(code: string): string {
  return NATIVE_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

export function isTargetLanguage(code: unknown): code is string {
  return typeof code === "string" && TARGET_LANGUAGES.some((l) => l.code === code);
}

export function isNativeLanguage(code: unknown): code is string {
  return typeof code === "string" && NATIVE_LANGUAGES.some((l) => l.code === code);
}
