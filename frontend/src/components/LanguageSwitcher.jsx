import { LANGUAGES, useLanguage } from '../lib/languageContext'

export default function LanguageSwitcher({ className = '' }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <label className={`flex items-center gap-xs ${className}`}>
      <span className="material-symbols-outlined text-sm text-tertiary" aria-hidden="true">translate</span>
      <span className="sr-only">{t('language')}</span>
      <select
        aria-label={t('language')}
        value={language}
        onChange={event => setLanguage(event.target.value)}
        className="field-input w-auto min-w-28 py-1 px-2 text-xs"
      >
        {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </label>
  )
}