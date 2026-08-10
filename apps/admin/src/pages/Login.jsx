import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'

export default function Login() {
  const { login, language, setLanguage } = useStore()
  const t = useT(language)
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!phone || !password) { setError(t('login.fillAll')); return }
    setLoading(true)
    setError('')
    try {
      await login(phone, password)
      navigate('/', { replace: true })
    } catch (e) {
      setError(
        e.message === 'no_access'
          ? t('login.noAccess')
          : t('common.error') + ': ' + e.message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: '#1a1f2e',
        border: '1px solid #2d3448',
        borderRadius: 16,
        padding: 40,
        width: '100%',
        maxWidth: 400
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 32
        }}>
          <div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: '#6fcf4a'
            }}>
              Molfi
            </div>
            <div style={{
              fontSize: 12, color: '#8892a4',
              textTransform: 'uppercase', letterSpacing: 1, marginTop: 2
            }}>
              {t('login.title')}
            </div>
          </div>
          <div className="lang-toggle" style={{ width: 80 }}>
            {['uz', 'ru'].map(lang => (
              <button
                key={lang}
                className={`lang-btn ${language === lang ? 'active' : ''}`}
                onClick={() => setLanguage(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('login.phone')}</label>
          <input
            className="form-input"
            type="text"
            placeholder={t('login.phonePh')}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t('login.password')}</label>
          <input
            className="form-input"
            type="password"
            placeholder={t('login.passwordPh')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>

        {error && (
          <div style={{
            color: '#ef4444', fontSize: 13, marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)', borderRadius: 8
          }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleLogin}
          disabled={loading}
          style={{ width: '100%', padding: 12, fontSize: 15 }}
        >
          {loading ? t('login.entering') : t('login.enter')}
        </button>
      </div>
    </div>
  )
}
