export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: 'EN' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: 'ES' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: 'FR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: 'DE' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: 'IT' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: 'PT' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: 'CH' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: 'JA' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: 'KO' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: 'HI' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: 'AR' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: 'TR' },
];

export function getLanguage(code: string): Language | undefined {
  return languages.find((l) => l.code === code);
}
