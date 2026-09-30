import { createContext, useContext } from 'react'

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'ta', label: 'தமிழ்', locale: 'ta-IN' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
]

export const LanguageContext = createContext(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}