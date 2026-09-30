import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { useLanguage } from '../lib/languageContext'

const SPEECH_LANGUAGES = [
  { locale: 'en-IN', label: 'English' },
  { locale: 'hi-IN', label: 'हिन्दी' },
  { locale: 'ta-IN', label: 'தமிழ்' },
  { locale: 'te-IN', label: 'తెలుగు' },
  { locale: 'bn-IN', label: 'বাংলা' },
  { locale: 'mr-IN', label: 'मराठी' },
  { locale: 'ml-IN', label: 'മലയാളം' },
  { locale: 'kn-IN', label: 'ಕನ್ನಡ' },
  { locale: 'es-ES', label: 'Español' },
  { locale: 'fr-FR', label: 'Français' },
  { locale: 'ar-SA', label: 'العربية' },
]

const EMERGENCY_KEYWORDS = {
  'en-IN': ['help', 'emergency', 'save me', 'call for help'],
  'hi-IN': ['मदद', 'बचाओ', 'आपातकाल', 'खतरा', 'मुझे बचाओ'],
  'ta-IN': ['உதவி', 'உதவுங்கள்', 'உதவுங்க', 'காப்பாற்றுங்கள்', 'காப்பாற்றுங்க', 'காப்பாத்துங்க', 'காப்பாத்துங்க', 'அவசரம்', 'ஆபத்து', 'kapathunga', 'kaapathunga', 'kappathunga'],
  'te-IN': ['సహాయం', 'కాపాడండి', 'అత్యవసరం', 'ప్రమాదం'],
  'bn-IN': ['সাহায্য', 'বাঁচান', 'জরুরি', 'বিপদ'],
  'mr-IN': ['मदत', 'वाचवा', 'आपत्कालीन', 'धोका'],
  'ml-IN': ['സഹായം', 'രക്ഷിക്കൂ', 'അടിയന്തര', 'അപകടം'],
  'kn-IN': ['ಸಹಾಯ', 'ಉಳಿಸಿ', 'ತುರ್ತು', 'ಅಪಾಯ'],
  'es-ES': ['ayuda', 'emergencia', 'socorro', 'auxilio'],
  'fr-FR': ['aide', 'aidez-moi', 'urgence', 'au secours'],
  'ar-SA': ['مساعدة', 'النجدة', 'طوارئ', 'أنقذني'],
}

function findEmergencyKeyword(transcript, locale) {
  const normalized = transcript
    .normalize('NFC')
    .toLocaleLowerCase(locale)
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = new Set(normalized.split(' '))
  const keywords = [
    ...(EMERGENCY_KEYWORDS[locale] || []),
    ...(locale === 'en-IN' ? [] : EMERGENCY_KEYWORDS['en-IN']),
  ]
  return keywords
    .find(keyword => keyword.includes(' ')
      ? ` ${normalized} `.includes(` ${keyword.toLocaleLowerCase(locale)} `)
      : words.has(keyword.toLocaleLowerCase(locale)))
}

export default function VoiceEmergencyMonitor({ positionClass = 'bottom-4 right-4' }) {
  const { user } = useAuthStore()
  const { locale, t } = useLanguage()
  const navigate = useNavigate()
  const [voiceLocale, setVoiceLocale] = useState(() => {
    try {
      const saved = localStorage.getItem('vr_voice_locale')
      if (SPEECH_LANGUAGES.some(language => language.locale === saved)) return saved
    } catch {}
    return SPEECH_LANGUAGES.some(language => language.locale === locale) ? locale : 'en-IN'
  })
  const [monitoring, setMonitoring] = useState(false)
  const [status, setStatus] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [detectedPhrase, setDetectedPhrase] = useState('')
  const matchesRef = useRef([])
  const confirmationRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem('vr_voice_locale', voiceLocale)
    } catch {}
  }, [voiceLocale])

  useEffect(() => {
    if (!monitoring) return undefined

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return undefined

    const recognition = new SpeechRecognition()
    let active = true
    let restartTimer
    recognition.lang = voiceLocale
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result.isFinal || window.speechSynthesis?.speaking) continue
        const transcript = result[0]?.transcript || ''
        const keyword = findEmergencyKeyword(transcript, voiceLocale)
        if (!keyword) continue

        const now = Date.now()
        matchesRef.current = matchesRef.current.filter(timestamp => now - timestamp <= 15000)
        matchesRef.current.push(now)
        setDetectedPhrase(keyword)
        if (matchesRef.current.length >= 2 && !confirmationRef.current) {
          confirmationRef.current = true
          setStatus(t('voice.possibleEmergency'))
          setConfirmationOpen(true)
          setMonitoring(false)
        }
      }
    }

    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        active = false
        setMonitoring(false)
        setStatus(t('voice.permissionDenied'))
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setStatus(t('voice.unavailable'))
      }
    }

    recognition.onend = () => {
      if (!active || confirmationRef.current) return
      restartTimer = window.setTimeout(() => {
        try {
          recognition.start()
        } catch {}
      }, 300)
    }

    try {
      recognition.start()
    } catch {
      window.setTimeout(() => {
        if (!active) return
        active = false
        setMonitoring(false)
        setStatus(t('voice.unavailable'))
      }, 0)
    }

    return () => {
      active = false
      window.clearTimeout(restartTimer)
      recognition.onend = null
      try {
        recognition.stop()
      } catch {}
    }
  }, [monitoring, t, voiceLocale])

  if (user?.role !== 'tourist') return null

  const selectVoiceLanguage = event => {
    const nextLocale = event.target.value
    setVoiceLocale(nextLocale)
    try {
      localStorage.setItem('vr_voice_locale', nextLocale)
    } catch {}
  }

  const dismissConfirmation = () => {
    confirmationRef.current = false
    matchesRef.current = []
    setConfirmationOpen(false)
    setDetectedPhrase('')
    setStatus('')
  }

  return (
    <>
      <section className={`fixed ${positionClass} z-[1500] w-[min(22rem,calc(100vw-2rem))] bg-surface/95 backdrop-blur hairline-border rounded p-sm shadow-xl`} aria-label={t('voice.title')}>
        <div className="flex items-center gap-xs">
          <span className={`material-symbols-outlined text-sm ${monitoring ? 'text-error animate-pulse' : 'text-tertiary'}`}>mic</span>
          <span className="flex-1 font-label-caps text-[10px] text-tertiary">{t('voice.title')}</span>
          <button
            type="button"
            onClick={() => {
              matchesRef.current = []
              if (monitoring) {
                setMonitoring(false)
                setStatus('')
              } else {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
                if (!SpeechRecognition) {
                  setStatus(t('voice.unsupported'))
                  return
                }
                setStatus(t('voice.listening'))
                setMonitoring(true)
              }
            }}
            aria-pressed={monitoring}
            className={`px-2 py-1 rounded font-label-caps text-[10px] ${monitoring ? 'bg-error text-white' : 'bg-primary text-on-primary'}`}
          >
            {monitoring ? t('voice.stop') : t('voice.enable')}
          </button>
        </div>
        <div className="mt-xs flex items-center gap-xs">
          <label htmlFor="voice-language" className="font-data-mono text-[10px] text-outline">{t('voice.spokenLanguage')}</label>
          <select id="voice-language" value={voiceLocale} onChange={selectVoiceLanguage} className="field-input flex-1 min-w-0 py-1 px-2 text-xs">
            {SPEECH_LANGUAGES.map(language => <option key={language.locale} value={language.locale}>{language.label}</option>)}
          </select>
        </div>
        <p className="mt-xs font-data-mono text-[9px] text-outline" role="status" aria-live="polite">
          {status || t('voice.permissionHint')}
        </p>
      </section>

      {confirmationOpen && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
          <section className="bg-surface max-w-md w-full rounded-lg shadow-2xl hairline-border border-2 border-error p-lg space-y-md" role="alertdialog" aria-modal="true" aria-labelledby="voice-emergency-title">
            <div className="flex items-center gap-sm text-error">
              <span className="material-symbols-outlined text-3xl">emergency</span>
              <h2 id="voice-emergency-title" className="font-headline-sm text-lg font-bold">{t('voice.possibleEmergency')}</h2>
            </div>
            <p className="font-body-lg text-on-surface">{t('voice.areYouSafe')}</p>
            {detectedPhrase && <p className="font-data-mono text-xs text-outline">{t('voice.detectedPhrase')}: {detectedPhrase}</p>}
            <div className="grid grid-cols-2 gap-sm">
              <button type="button" onClick={dismissConfirmation} className="btn-ghost justify-center">{t('voice.imSafe')}</button>
              <button type="button" onClick={() => navigate('/sos?voiceConfirm=1')} className="btn-primary justify-center bg-error hover:bg-error/90">{t('voice.sendSos')}</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}