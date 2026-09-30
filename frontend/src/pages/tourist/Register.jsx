import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

const ROLES = [
  { value: 'tourist',      label: 'Tourist / Trekker',     icon: 'hiking' },
  { value: 'rescue_team',  label: 'Ranger / Rescue Team',  icon: 'shield_person' },
  { value: 'control_room', label: 'Control Room Operator', icon: 'monitoring' },
]

export default function Register() {
  const navigate = useNavigate()
  const { register: registerUser, login, loading } = useAuthStore()

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'tourist' })
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const handleNext = () => {
    if (!form.full_name.trim()) { setError('Full name is required.'); return }
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setStep(2)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    try {
      // Register — name is stored on the account and shown to Rangers / Control Room on SOS
      await registerUser({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role,
      })
      // Auto-login (password optional now, but we send it anyway)
      const data = await login(form.email.trim(), form.password)
      const role = data.role
      if (role === 'tourist')           navigate('/home')
      else if (role === 'rescue_team')  navigate('/ranger')
      else navigate('/control-room')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center forest-bg px-margin-mobile py-xl font-body-md">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-xl">
          <div className="flex items-center justify-center gap-sm mb-sm">
            <span className="material-symbols-outlined text-secondary text-4xl"
              style={{ fontVariationSettings: '"FILL" 1' }}>forest</span>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface">VANRAKSHA</h1>
          </div>
          <p className="font-data-mono text-data-mono text-tertiary text-sm">
            FOREST SAFETY PORTAL — ACCOUNT CREATION
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-sm mb-lg">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-sm">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-label-caps text-[10px] transition-colors ${
                step >= s ? 'bg-primary text-on-primary' : 'bg-surface-container hairline-border text-on-surface-variant'
              }`}>{s}</div>
              {s < 2 && <div className={`w-12 h-px ${step > 1 ? 'bg-primary' : 'bg-outline/30'}`} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-surface hairline-border rounded p-lg shadow-sm space-y-lg">
          <div className="hairline-border-b pb-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {step === 1 ? 'Create Account' : 'Select Role'}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-xs">
              {step === 1 ? 'Enter your details to register.' : 'Choose your role in the system.'}
            </p>
          </div>

          {step === 1 ? (
            <div className="space-y-md">
              <div>
                <label className="field-label" htmlFor="reg-name">FULL NAME</label>
                <input id="reg-name" name="full_name" type="text" required
                  value={form.full_name} onChange={handleChange}
                  placeholder="Your full name" className="field-input" />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-email">EMAIL ADDRESS</label>
                <input id="reg-email" name="email" type="email" required
                  value={form.email} onChange={handleChange}
                  placeholder="you@example.com" className="field-input" />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-phone">PHONE NUMBER (OPTIONAL)</label>
                <input id="reg-phone" name="phone" type="tel"
                  value={form.phone} onChange={handleChange}
                  placeholder="+91 XXXXX XXXXX" className="field-input" />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-password">PASSWORD</label>
                <input id="reg-password" name="password" type="password" required
                  value={form.password} onChange={handleChange}
                  placeholder="Min. 6 characters" className="field-input" />
              </div>

              {error && (
                <div className="bg-error-container/40 text-error font-data-mono text-data-mono text-sm px-md py-sm rounded hairline-border flex items-start gap-sm">
                  <span className="material-symbols-outlined text-sm mt-px">error</span>
                  {error}
                </div>
              )}

              <button onClick={handleNext} type="button"
                className="btn-primary w-full justify-center flex items-center gap-sm">
                NEXT: SELECT ROLE
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-md">
              <div className="space-y-sm">
                {ROLES.map(r => (
                  <button key={r.value} type="button"
                    onClick={() => setForm(p => ({ ...p, role: r.value }))}
                    className={`w-full flex items-center gap-md p-md rounded hairline-border transition-colors text-left ${
                      form.role === r.value
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-xl ${form.role === r.value ? 'text-primary' : 'text-outline'}`}
                      style={form.role === r.value ? { fontVariationSettings: '"FILL" 1' } : {}}>
                      {r.icon}
                    </span>
                    <div className="flex-1">
                      <div className="font-label-caps text-label-caps text-[11px] text-on-surface">
                        {r.label.toUpperCase()}
                      </div>
                    </div>
                    {form.role === r.value && (
                      <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                    )}
                  </button>
                ))}
              </div>

              {error && (
                <div className="bg-error-container/40 text-error font-data-mono text-data-mono text-sm px-md py-sm rounded hairline-border flex items-start gap-sm">
                  <span className="material-symbols-outlined text-sm mt-px">error</span>
                  {error}
                </div>
              )}

              <div className="flex gap-sm">
                <button type="button" onClick={() => setStep(1)} className="btn-ghost flex-1 justify-center">
                  <span className="material-symbols-outlined text-sm">arrow_back</span> BACK
                </button>
                <button type="submit" disabled={loading}
                  className="btn-primary flex-1 justify-center flex items-center gap-sm disabled:opacity-60">
                  {loading
                    ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> CREATING…</>
                    : <><span className="material-symbols-outlined text-sm">check</span> CREATE ACCOUNT</>}
                </button>
              </div>
            </form>
          )}

          <div className="hairline-border-t pt-md flex items-center justify-between">
            <p className="font-data-mono text-data-mono text-on-surface-variant text-xs">
              Already registered?
            </p>
            <Link to="/signin"
              className="font-label-caps text-label-caps text-secondary hover:underline flex items-center gap-xs">
              SIGN IN <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>

        <p className="text-center font-data-mono text-data-mono text-outline text-xs mt-lg">
          VANRAKSHA FOREST SAFETY PORTAL | OFFICIAL GOVT USE ONLY<br/>
          <span className="text-outline/60">SIH Hackathon Prototype – Not Official Govt Site</span>
        </p>
      </div>
    </div>
  )
}
