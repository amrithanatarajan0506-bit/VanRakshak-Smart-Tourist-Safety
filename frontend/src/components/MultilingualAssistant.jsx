import { useLanguage } from '../lib/languageContext'

function speak(text, locale) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text); u.lang = locale
  window.speechSynthesis.speak(u)
}

export default function MultilingualAssistant() {
  const { locale, t } = useLanguage()
  const tips = [t('assistant.tip1'), t('assistant.tip2'), t('assistant.tip3'), t('assistant.tip4')]
  const sosText = t('assistant.sos')
  return (
    <div className="bg-surface hairline-border rounded p-md shadow-sm">
      <div className="flex items-center justify-between hairline-border-b pb-sm mb-sm gap-sm flex-wrap">
        <h3 className="font-label-caps text-label-caps text-tertiary flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">translate</span>{t('assistant.title')}
        </h3>
      </div>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
            <span className="material-symbols-outlined text-secondary text-sm mt-0.5">shield</span>
            <span className="flex-1">{tip}</span>
            <button aria-label={t('assistant.readAloud')} onClick={() => speak(tip, locale)} className="text-outline hover:text-primary">
              <span className="material-symbols-outlined text-sm">volume_up</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-md p-sm rounded bg-error/10 border border-error/30">
        <div className="font-label-caps text-[10px] text-error mb-1">{t('assistant.emergencyPhrase')}</div>
        <div className="text-sm text-on-surface">{sosText}</div>
        <button onClick={() => speak(sosText, locale)} className="mt-2 text-xs font-label-caps text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">volume_up</span>{t('assistant.play')}
        </button>
      </div>
    </div>
  )
}
