import { useState } from 'react'
import { getTelephoneHref } from '../lib/telephone'

export default function CallTouristAction({ phone, compact = false }) {
  const [showFallback, setShowFallback] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const telephoneHref = getTelephoneHref(phone)

  if (!telephoneHref) {
    return (
      <span className="btn-ghost text-xs flex items-center gap-1 text-outline opacity-60" aria-disabled="true">
        <span className="material-symbols-outlined text-sm">call_end</span>
        PHONE UNAVAILABLE
      </span>
    )
  }

  const dialNumber = telephoneHref.slice('tel:'.length)

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(dialNumber)
      setCopyMessage('Number copied. Paste it into your phone app to call.')
    } catch {
      setCopyMessage('Copy is unavailable here. Select the number above and copy it manually.')
    }
  }

  return (
    <>
      <a
        href={telephoneHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setShowFallback(true)}
        aria-label={`Call tourist at ${phone}`}
        className={compact
          ? 'font-data-mono text-xs text-primary hover:underline inline-flex items-center gap-xs'
          : 'btn-ghost text-xs flex items-center gap-1 text-primary border-primary/40 hover:bg-primary/10'}
      >
        <span className="material-symbols-outlined text-sm">call</span>
        {compact ? `CALL · ${phone}` : 'CALL TOURIST'}
      </a>

      {showFallback && (
        <div
          className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowFallback(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-tourist-title"
            className="w-full max-w-sm bg-surface hairline-border rounded-lg shadow-xl p-lg space-y-md"
          >
            <div className="flex items-start justify-between gap-sm">
              <div>
                <h2 id="call-tourist-title" className="font-headline-sm text-on-surface">Call Tourist</h2>
                <p className="font-body-md text-sm text-on-surface-variant mt-xs">
                  Your device may ask you to choose or confirm a calling app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFallback(false)}
                aria-label="Close call options"
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <label className="field-label" htmlFor="tourist-call-number">TOURIST PHONE NUMBER</label>
            <input
              id="tourist-call-number"
              type="tel"
              readOnly
              value={phone}
              onFocus={event => event.target.select()}
              className="field-input font-data-mono"
            />

            <div className="flex flex-wrap gap-sm">
              <a href={telephoneHref} className="btn-primary inline-flex items-center gap-xs">
                <span className="material-symbols-outlined text-sm">call</span>
                OPEN PHONE APP
              </a>
              <button type="button" onClick={copyNumber} className="btn-ghost inline-flex items-center gap-xs">
                <span className="material-symbols-outlined text-sm">content_copy</span>
                COPY NUMBER
              </button>
            </div>
            {copyMessage && <p className="font-data-mono text-xs text-secondary" role="status">{copyMessage}</p>}
          </section>
        </div>
      )}
    </>
  )
}