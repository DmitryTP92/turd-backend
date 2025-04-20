import * as RNLocalize from 'react-native-localize';
import { I18n } from 'i18n-js';

import en from './locales/en.json';
import ja from './locales/ja.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import ko from './locales/ko.json';

const i18n = new I18n({
  en,
  ja,
  fr,
  es,
  ko
});

const locales = RNLocalize.getLocales();
i18n.locale = Array.isArray(locales) && locales.length > 0 ? locales[0].languageTag : 'en';
i18n.enableFallback = true;

export default i18n;
