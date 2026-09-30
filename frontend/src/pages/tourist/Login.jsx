import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useLanguage } from '../../lib/languageContext'

const CONSOLES = [
  { value: 'rescue_team',  label: 'Ranger',  icon: 'shield_person' },
  { value: 'control_room', label: 'Admin',   icon: 'monitoring' },
]

const TOURIST_TYPES = [
  { value: 'indian',  label: 'Indian Tourist',  icon: 'badge' },
  { value: 'foreign', label: 'Foreign Tourist', icon: 'flight_takeoff' },
]

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function isValidAadhaar(value) {
  if (!/^\d{12}$/.test(value) || value[0] === '0' || value[0] === '1') return false
  let checksum = 0
  for (const [index, digit] of [...value].reverse().entries()) {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][Number(digit)]]
  }
  return checksum === 0
}

function fieldValidation(value, kind) {
  if (!value.trim()) return null
  if (kind === 'name') return /^\p{L}[\p{L}\p{M} .'-]{1,99}$/u.test(value.trim())
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  if (kind === 'phone') {
    const normalized = value.replace(/[\s()-]/g, '')
    return /^\+?\d{7,15}$/.test(normalized)
  }
  if (kind === 'aadhaar') return isValidAadhaar(value.replace(/\D/g, ''))
  if (kind === 'passport') return /^(?=.*[A-Z])(?=.*\d)[A-Z\d]{6,9}$/i.test(value.trim())
  return true
}

function FieldFeedback({ value, kind, validMessage, invalidMessage }) {
  const valid = fieldValidation(value, kind)
  if (valid === null) return null
  return (
    <p className={`mt-xs flex items-center gap-xs font-data-mono text-[11px] ${valid ? 'text-secondary' : 'text-error'}`} aria-live="polite">
      <span className="material-symbols-outlined text-sm">{valid ? 'check_circle' : 'error'}</span>
      {valid ? validMessage : invalidMessage}
    </p>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { staffLogin, touristEnter, loading } = useAuthStore()
  const { t } = useLanguage()

  const [mode, setMode] = useState('tourist')            // tourist | staff
  const [error, setError] = useState('')
  const [touristEntryResult, setTouristEntryResult] = useState(null)

  // Tourist — Indian Aadhaar or foreign passport number
  const [touristType, setTouristType] = useState('indian')  // indian | foreign
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [aadhaarNo, setAadhaarNo] = useState('')
  const [passportNo, setPassportNo] = useState('')

  // Ranger / Admin — one shared username + password
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [consoleRole, setConsoleRole] = useState('rescue_team')

  const handleTourist = async e => {
    e.preventDefault()
    setError('')
    const identityNumber = touristType === 'indian' ? aadhaarNo : passportNo
    const identityKind = touristType === 'indian' ? 'aadhaar' : 'passport'
    const requiredFields = [
      [name, 'name'], [email, 'email'], [phone, 'phone'], [identityNumber, identityKind],
    ]
    if (requiredFields.some(([value, kind]) => fieldValidation(value, kind) !== true)) {
      setError('Please correct each field marked in red before continuing.')
      return
    }
    try {
      const result = await touristEnter({
        tourist_type: touristType,
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        aadhaar_number: touristType === 'indian' ? aadhaarNo : undefined,
        passport_number: touristType === 'foreign' ? passportNo.trim().toUpperCase() : undefined,
      })
      if (result.verification_status !== 'format_validated') {
        setError('Identity number could not be validated. Check it and try again.')
        return
      }
      setTouristEntryResult({
        fullName: name.trim(),
        dtidCode: result.dtid_code,
        verificationStatus: result.verification_status,
        touristType,
      })
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not continue. Please try again.')
    }
  }

  const switchTouristType = t => { setTouristType(t); setAadhaarNo(''); setPassportNo(''); setError('') }

  const handleStaff = async e => {
    e.preventDefault()
    setError('')
    try {
      const data = await staffLogin(username.trim(), password, consoleRole)
      navigate(data.role === 'control_room' ? '/control-room' : '/ranger')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Login failed.')
    }
  }

  const switchMode = m => { setMode(m); setError('') }

  return (
    <div className="min-h-screen flex items-center justify-center forest-bg px-margin-mobile font-body-md">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-xl">
          <div className="flex items-center justify-center gap-sm mb-sm">
            <span className="material-symbols-outlined text-secondary text-4xl"
              style={{ fontVariationSettings: '"FILL" 1' }}>forest</span>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface">VANRAKSHA</h1>
          </div>
          <p className="font-data-mono text-data-mono text-tertiary text-sm">
            {t('login.portal')}
          </p>
          <div className="flex justify-center mt-sm"><LanguageSwitcher /></div>
        </div>

        {/* Card */}
        <div className="bg-surface hairline-border rounded p-lg shadow-sm space-y-lg">

          {/* Mode tabs */}
          <div className="flex hairline-border-b">
            {[
              { key: 'tourist', label: t('login.tourist'), icon: 'hiking' },
              { key: 'staff',   label: t('login.staff'), icon: 'lock' },
            ].map(tab => (
              <button key={tab.key} type="button" onClick={() => switchMode(tab.key)}
                className={`flex-1 flex items-center justify-center gap-xs px-md py-sm font-label-caps text-label-caps transition-colors border-b-2 ${
                  mode === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}>
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'tourist' ? touristEntryResult ? (
            <section className="space-y-md" aria-label="Tourist login successful" role="status">
              <div className="flex items-center gap-sm text-secondary">
                <span className="material-symbols-outlined text-2xl">check_circle</span>
                <h2 className="font-headline-sm text-on-surface">{t('login.entryComplete')}</h2>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant">
                {t('login.welcome')}, {touristEntryResult.fullName}.
              </p>
              <div className="bg-surface-container-low hairline-border rounded p-md">
                <div className="field-label">YOUR DIGITAL TOURIST ID</div>
                <p className="font-data-mono text-lg font-bold text-primary select-all">
                  {touristEntryResult.dtidCode || 'ID could not be issued'}
                </p>
                <p className="font-data-mono text-[10px] text-outline mt-xs">
                  {t('login.keepId')}
                </p>
              </div>
              <p className="font-data-mono text-[10px] text-outline">
                Identity number {touristEntryResult.touristType === 'indian' ? 'checksum' : 'format'} accepted; government records were not queried.
              </p>
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="btn-primary w-full justify-center flex items-center gap-sm"
              >
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                CONTINUE TO SAFETY HOME
              </button>
            </section>
          ) : (
            <form onSubmit={handleTourist} className="space-y-md">
              <div>
                <label className="field-label">{t('login.iAm')}</label>
                <div className="grid grid-cols-2 gap-sm">
                  {TOURIST_TYPES.map(touristTypeOption => (
                    <button key={touristTypeOption.value} type="button" onClick={() => switchTouristType(touristTypeOption.value)}
                      className={`flex items-center justify-center gap-xs p-sm rounded hairline-border font-label-caps text-label-caps text-[11px] transition-colors ${
                        touristType === touristTypeOption.value ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-surface hover:bg-surface-container text-on-surface-variant'
                      }`}>
                      <span className="material-symbols-outlined text-sm">{touristTypeOption.icon}</span>
                      {t(touristTypeOption.value === 'indian' ? 'login.indian' : 'login.foreign').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="t-name">{t('login.fullName')}</label>
                <input id="t-name" type="text" required autoComplete="name"
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your full name" className="field-input" />
                <FieldFeedback value={name} kind="name" validMessage="Name looks valid." invalidMessage="Enter your name using letters, spaces, apostrophes, periods, or hyphens." />
              </div>
              <div>
                <label className="field-label" htmlFor="t-email">{t('login.email')}</label>
                <input id="t-email" type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" className="field-input" />
                <FieldFeedback value={email} kind="email" validMessage="Email format looks valid." invalidMessage="Enter a valid email address." />
              </div>
              <div>
                <label className="field-label" htmlFor="t-phone">{t('login.phone')}</label>
                <input id="t-phone" type="tel" required autoComplete="tel"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder={touristType === 'indian' ? '+91 XXXXX XXXXX' : '+CC XXXXXXXXXX'} className="field-input" />
                <FieldFeedback value={phone} kind="phone" validMessage="Phone number length looks valid." invalidMessage="Enter 7 to 15 digits." />
              </div>

              {touristType === 'indian' ? (
                <>
                  <div>
                    <label className="field-label" htmlFor="t-aadhaar">{t('login.aadhaar')}</label>
                    <input id="t-aadhaar" type="text" inputMode="numeric" autoComplete="off" maxLength={12} required
                      value={aadhaarNo} onChange={e => setAadhaarNo(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="12-digit Aadhaar number" className="field-input" />
                    <FieldFeedback value={aadhaarNo} kind="aadhaar" validMessage="Aadhaar number checksum is valid." invalidMessage="Aadhaar number is incomplete or has an invalid checksum." />
                  </div>
                  <p className="font-data-mono text-[10px] text-outline">
                    {t('login.aadhaarNote')}
                  </p>
                </>
              ) : (
                <div>
                  <label className="field-label" htmlFor="t-passport">{t('login.passport')}</label>
                  <input id="t-passport" type="text" required autoComplete="off" maxLength={9}
                    value={passportNo} onChange={e => setPassportNo(e.target.value.replace(/[^a-z\d]/gi, '').toUpperCase())}
                    placeholder="Passport number" className="field-input" />
                  <FieldFeedback value={passportNo} kind="passport" validMessage="Passport number format looks valid." invalidMessage="Enter 6 to 9 letters/digits, including at least one letter and one digit." />
                  <p className="font-data-mono text-[10px] text-outline mt-xs">
                    {t('login.passportNote')}
                  </p>
                </div>
              )}

              {error && <ErrorBox msg={error} />}

              <button type="submit" disabled={loading}
                className="btn-primary w-full justify-center flex items-center gap-sm disabled:opacity-60">
                {loading
                  ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> VALIDATING DETAILS…</>
                  : <><span className="material-symbols-outlined text-sm">arrow_forward</span> {t('login.continue')}</>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStaff} className="space-y-md">
              <div className="font-data-mono text-[10px] text-outline hairline-border inline-block px-sm py-unit rounded">
                {t('login.authorizedOnly')}
              </div>
              {import.meta.env.DEV && (
                <p className="font-data-mono text-xs text-on-surface-variant bg-surface-container-low hairline-border rounded p-sm">
                  Local development access: <strong>vanrakshak</strong> / <strong>Vanrakshak@123</strong>
                </p>
              )}
              <div>
                <label className="field-label" htmlFor="s-user">{t('login.username')}</label>
                <input id="s-user" type="text" required autoComplete="username"
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder={t('login.usernamePlaceholder')} className="field-input" />
              </div>
              <div>
                <label className="field-label" htmlFor="s-pass">{t('login.password')}</label>
                <input id="s-pass" type="password" required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')} className="field-input" />
              </div>
              <div>
                <label className="field-label">{t('login.openConsole')}</label>
                <div className="grid grid-cols-2 gap-sm">
                  {CONSOLES.map(c => (
                    <button key={c.value} type="button" onClick={() => setConsoleRole(c.value)}
                      className={`flex items-center justify-center gap-xs p-sm rounded hairline-border font-label-caps text-label-caps text-[11px] transition-colors ${
                        consoleRole === c.value ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-surface hover:bg-surface-container text-on-surface-variant'
                      }`}>
                      <span className="material-symbols-outlined text-sm">{c.icon}</span>
                      {c.label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {error && <ErrorBox msg={error} />}

              <button type="submit" disabled={loading}
                className="btn-primary w-full justify-center flex items-center gap-sm disabled:opacity-60">
                {loading
                  ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> SIGNING IN…</>
                  : <><span className="material-symbols-outlined text-sm">login</span> {t('login.signin')}</>}
              </button>
            </form>
          )}
          {mode === 'tourist' && !touristEntryResult && (
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="btn-ghost w-full justify-center flex items-center gap-sm"
            >
              <span className="material-symbols-outlined text-sm">explore</span>
              {t('login.exploreVisitor')}
            </button>
          )}
        </div>

        <p className="text-center font-data-mono text-data-mono text-outline text-xs mt-lg">
          VANRAKSHA FOREST SAFETY PORTAL | OFFICIAL GOVT USE ONLY<br/>
          <span className="text-outline/60">SIH Hackathon Prototype – Not Official Govt Site</span>
        </p>
      </div>
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <div className="bg-error-container/40 text-error font-data-mono text-data-mono text-sm px-md py-sm rounded hairline-border flex items-start gap-sm">
      <span className="material-symbols-outlined text-sm mt-px">error</span>
      {msg}
    </div>
  )
}
