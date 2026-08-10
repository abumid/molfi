import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { retrieveLaunchParams, retrieveRawInitData, requestContact } from '@telegram-apps/sdk'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'

// SDK v3: raw initData берётся через retrieveRawInitData(),
// а launch params возвращают tgWebAppData (НЕ initDataRaw / initData)
const getTelegramData = () => {
  try {
    const initData = retrieveRawInitData()
    if (!initData) return { initData: null, user: null }
    let user = null
    try {
      const lp = retrieveLaunchParams(true)
      user = lp?.tgWebAppData?.user || null
    } catch { /* ignore */ }
    return { initData, user }
  } catch {
    return { initData: null, user: null }
  }
}

const isInTelegram = () => !!getTelegramData().initData

const COLORS = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  border: 'var(--color-border)',
  accent: 'var(--color-green-light)',
  text: '#ffffff',
  textMuted: 'var(--color-text-muted)',
  red: 'var(--color-red)',
}

const formatPhone = (raw) => {
  let digits = raw.replace(/\D/g, '')
  if (!digits.startsWith('998')) digits = '998' + digits.replace(/^998/, '')
  digits = digits.slice(0, 12)
  const rest = digits.slice(3)
  let out = '+998'
  if (rest.length > 0) out += ' ' + rest.slice(0, 2)
  if (rest.length > 2) out += ' ' + rest.slice(2, 5)
  if (rest.length > 5) out += ' ' + rest.slice(5, 7)
  if (rest.length > 7) out += ' ' + rest.slice(7, 9)
  return out
}

const toApiPhone = (display) => '+' + display.replace(/\D/g, '')

const isPhoneComplete = (display) => display.replace(/\D/g, '').length === 12

function FieldLabel({ children }) {
  return <label style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 6, display: 'block' }}>{children}</label>
}

function TextField({ value, onChange, placeholder, type = 'text', rightSlot, inputMode }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        style={{
          width: '100%', padding: '14px 16px', paddingRight: rightSlot ? 48 : 16,
          borderRadius: 12, border: `1px solid ${COLORS.border}`,
          background: COLORS.surface, color: COLORS.text, fontSize: 16,
          fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {rightSlot && (
        <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
          {rightSlot}
        </div>
      )}
    </div>
  )
}

function PrimaryButton({ children, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
        fontSize: 15, fontWeight: 600, fontFamily: 'Unbounded, sans-serif',
        background: COLORS.accent, color: COLORS.bg,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
      }}
    >
      {loading ? '...' : children}
    </button>
  )
}

function LinkButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: COLORS.accent,
        fontSize: 14, fontFamily: 'Inter, sans-serif', cursor: 'pointer', padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function CodeInput({ value, onChange, length = 4 }) {
  const refs = useRef([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const setDigit = (index, digit) => {
    const chars = value.split('')
    chars[index] = digit
    const next = chars.join('').slice(0, length)
    onChange(next)
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          value={value[i] || ''}
          onChange={e => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1)
            setDigit(i, digit)
          }}
          onKeyDown={e => handleKeyDown(i, e)}
          inputMode="numeric"
          maxLength={1}
          style={{
            width: 56, height: 64, textAlign: 'center', fontSize: 24, fontWeight: 600,
            borderRadius: 12, border: `1px solid ${COLORS.border}`,
            background: COLORS.surface, color: COLORS.text,
            fontFamily: 'Inter, sans-serif', outline: 'none',
          }}
        />
      ))}
    </div>
  )
}

function CountdownResend({ seconds, onResend, t }) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    setLeft(seconds)
  }, [seconds])

  useEffect(() => {
    if (left <= 0) return
    const id = setInterval(() => setLeft(l => l - 1), 1000)
    return () => clearInterval(id)
  }, [left])

  if (left > 0) {
    return <p style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center' }}>{t.auth.resend_in} {left} {t.auth.sec}</p>
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <LinkButton onClick={() => { onResend(); setLeft(seconds) }}>{t.auth.resend_code}</LinkButton>
    </div>
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke={COLORS.textMuted} strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke={COLORS.textMuted} strokeWidth="1.7" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M7.4 7.5C4.7 9 3 12 3 12s4 7 11 7c1.6 0 3-.3 4.3-.9M14.1 5.3C13.4 5.1 12.7 5 12 5c-1 0-2 .15-2.9.4" stroke={COLORS.textMuted} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function PasswordField({ value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={visible ? 'text' : 'password'}
      rightSlot={
        <button onClick={() => setVisible(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
          <EyeIcon open={visible} />
        </button>
      }
    />
  )
}

const Title = ({ children }) => (
  <h1 style={{ fontSize: 24, fontWeight: 600, fontFamily: 'Unbounded, sans-serif', color: COLORS.text, margin: 0 }}>
    {children}
  </h1>
)

const Subtitle = ({ children }) => (
  <p style={{ fontSize: 14, color: COLORS.textMuted, margin: 0, fontFamily: 'Inter, sans-serif' }}>
    {children}
  </p>
)

const ErrorText = ({ children }) =>
  children ? <p style={{ color: COLORS.red, fontSize: 13, fontFamily: 'Inter, sans-serif', margin: 0 }}>{children}</p> : null

export default function Auth() {
  const [screen, setScreen] = useState('phone')
  const [phone, setPhone] = useState('+998 ')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sendVia, setSendVia] = useState('dev')
  const [telegramUser, setTelegramUser] = useState(null)
  const [tgChecking, setTgChecking] = useState(false)

  const login = useStore(s => s.login)
  const language = useStore(s => s.language)
  const setLanguage = useStore(s => s.setLanguage)
  const t = useT(language)
  const navigate = useNavigate()

  const apiPhone = toApiPhone(phone)

  const goCatalog = (token, user) => {
    login(token, user)
    navigate('/catalog')
  }

  useEffect(() => {
    if (!isInTelegram()) return
    const { initData, user } = getTelegramData()
    if (!initData) return
    setTgChecking(true)
    ;(async () => {
      try {
        const res = await api.post('/auth/telegram-login', { initData })
        if (res.exists) {
          goCatalog(res.token, res.user)
          return
        }
        setTelegramUser({
          telegram_id: res.telegram_id,
          telegram_username: res.telegram_username,
          first_name: res.first_name,
          last_name: res.last_name,
        })
        const fullName = [
          user?.first_name ?? user?.firstName,
          user?.last_name ?? user?.lastName,
        ].filter(Boolean).join(' ')
        if (fullName) setName(fullName)
      } catch {
      } finally {
        setTgChecking(false)
      }
    })()
  }, [])

  const handleUseTelegramPhone = async () => {
    setError(''); setLoading(true)
    try {
      const { contact } = await requestContact()
      if (contact?.phone_number) setPhone(formatPhone(contact.phone_number))
    } catch (e) {
      setError(t.auth.err_check_phone)
    }
    setLoading(false)
  }

  const handlePhoneSubmit = async () => {
    if (!isPhoneComplete(phone)) { setError(t.auth.err_fill_phone); return }
    setError(''); setLoading(true)
    try {
      const { exists } = await api.post('/auth/check-phone', { phone: apiPhone })
      if (exists) {
        setScreen('password')
      } else {
        const sms = await api.post('/auth/send-sms', { phone: apiPhone, telegram_id: telegramUser?.telegram_id })
        setSendVia(sms.sentVia || 'dev')
        setCode('')
        setScreen('register-code')
      }
    } catch (e) {
      setError(e.message || t.auth.err_check_phone)
    }
    setLoading(false)
  }

  const handleLogin = async () => {
    if (!password) { setError(t.auth.err_enter_password); return }
    setError(''); setLoading(true)
    try {
      const { token, user } = await api.post('/auth/login', { phone: apiPhone, password })
      goCatalog(token, user)
    } catch (e) {
      setError(t.auth.err_invalid_credentials)
    }
    setLoading(false)
  }

  const handleResendRegisterCode = async () => {
    try {
      const sms = await api.post('/auth/send-sms', { phone: apiPhone, telegram_id: telegramUser?.telegram_id })
      setSendVia(sms.sentVia || 'dev')
    } catch {}
  }

  const handleVerifyRegisterCode = async () => {
    if (code.length !== 4) { setError(t.auth.err_fill_code); return }
    setError(''); setLoading(true)
    try {
      const { valid } = await api.post('/auth/verify-sms', { phone: apiPhone, code })
      if (!valid) { setError(t.auth.err_invalid_code); setLoading(false); return }
      setScreen('register-profile')
    } catch (e) {
      setError(e.message || t.auth.err_verify_code)
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    if (newPassword.length < 6) { setError(t.auth.err_password_min); return }
    if (newPassword !== confirmPassword) { setError(t.auth.err_password_mismatch); return }
    setError(''); setLoading(true)
    try {
      const { token, user } = await api.post('/auth/register', {
        phone: apiPhone, code, password: newPassword, name,
        telegram_id: telegramUser?.telegram_id,
        telegram_username: telegramUser?.telegram_username,
        first_name: telegramUser?.first_name,
        last_name: telegramUser?.last_name,
      })
      goCatalog(token, user)
    } catch (e) {
      setError(e.message || t.auth.err_register)
    }
    setLoading(false)
  }

  const handleForgotPhoneSubmit = async () => {
    if (!isPhoneComplete(phone)) { setError(t.auth.err_fill_phone); return }
    setError(''); setLoading(true)
    try {
      await api.post('/auth/forgot-password', { phone: apiPhone })
      setCode('')
      setScreen('forgot-code')
    } catch (e) {
      setError(t.auth.err_user_not_found)
    }
    setLoading(false)
  }

  const handleResendForgotCode = async () => {
    try { await api.post('/auth/forgot-password', { phone: apiPhone }) } catch {}
  }

  const handleForgotCodeSubmit = () => {
    if (code.length !== 4) { setError(t.auth.err_fill_code); return }
    setError('')
    setScreen('forgot-new-password')
  }

  const handleResetPassword = async () => {
    if (newPassword.length < 6) { setError(t.auth.err_password_min); return }
    if (newPassword !== confirmPassword) { setError(t.auth.err_password_mismatch); return }
    setError(''); setLoading(true)
    try {
      await api.post('/auth/reset-password', { phone: apiPhone, code, newPassword })
      setPassword('')
      setScreen('password')
    } catch (e) {
      setError(e.message || t.auth.err_reset_password)
    }
    setLoading(false)
  }

  const goToForgot = () => {
    setError(''); setCode(''); setNewPassword(''); setConfirmPassword('')
    setScreen('forgot-phone')
  }

  const backToPhone = () => {
    setError(''); setPassword(''); setCode(''); setName('')
    setNewPassword(''); setConfirmPassword(''); setSendVia('dev')
    setScreen('phone')
  }

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, display: 'flex',
      flexDirection: 'column', justifyContent: 'center', padding: 24, gap: 24,
      boxSizing: 'border-box', position: 'relative',
    }}>
      <button
        onClick={() => setLanguage(language === 'ru' ? 'uz' : 'ru')}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 20,
          padding: '6px 14px', color: 'var(--color-text)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}
      >
        {language === 'ru' ? 'UZ' : 'RU'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <Title>Molfi</Title>
      </div>

      {screen === 'phone' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.phone_subtitle}</Subtitle>
          <div>
            <FieldLabel>{t.auth.phone_label}</FieldLabel>
            <TextField value={phone} onChange={v => setPhone(formatPhone(v))} placeholder={t.auth.phone_placeholder} type="tel" inputMode="numeric" />
          </div>
          {isInTelegram() && (
            <div style={{ textAlign: 'center' }}>
              <LinkButton onClick={handleUseTelegramPhone}>
                {language === 'uz' ? 'Telegramdagi raqamni ishlatish' : 'Использовать номер из Telegram'}
              </LinkButton>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handlePhoneSubmit} loading={loading || tgChecking}>{t.auth.continue}</PrimaryButton>
        </div>
      )}

      {screen === 'password' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{phone}</Subtitle>
          <div>
            <FieldLabel>{t.auth.create_password_label}</FieldLabel>
            <PasswordField value={password} onChange={setPassword} placeholder={t.auth.password_placeholder} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <LinkButton onClick={goToForgot}>{t.auth.forgot_password}</LinkButton>
          </div>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleLogin} loading={loading}>{t.auth.login}</PrimaryButton>
          <div style={{ textAlign: 'center' }}>
            <LinkButton onClick={backToPhone}>{t.auth.change_phone}</LinkButton>
          </div>
        </div>
      )}

      {screen === 'register-code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.code_sent_to} {phone}</Subtitle>
          {sendVia === 'telegram' && (
            <p style={{ fontSize: 13, color: COLORS.accent, textAlign: 'center', margin: 0 }}>
              {language === 'uz' ? 'Kod Telegram botiga yuborildi' : 'Код отправлен в Telegram-бот'}
            </p>
          )}
          {sendVia === 'dev' && (
            <p style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', margin: 0 }}>
              {language === 'uz' ? 'Test rejimi: kodni serverdan tekshiring' : 'Тестовый режим: проверьте код на сервере'}
            </p>
          )}
          {sendVia === 'none' && (
            <p style={{ fontSize: 13, color: COLORS.red, textAlign: 'center', margin: 0 }}>
              {language === 'uz'
                ? 'Kodni yuborib bolmadi. @molfi_bot ni oching, /start bosing va raqamingizni ulashing, keyin qayta urinib koring.'
                : 'Не удалось отправить код. Откройте @molfi_bot, нажмите /start, поделитесь номером — и попробуйте снова.'}
            </p>
          )}
          {sendVia === 'sms' && (
            <p style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', margin: 0 }}>
              {language === 'uz' ? 'Kod SMS orqali yuborildi' : 'Код отправлен по SMS'}
            </p>
          )}
          <CodeInput value={code} onChange={setCode} />
          <CountdownResend seconds={60} onResend={handleResendRegisterCode} t={t} />
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleVerifyRegisterCode} loading={loading}>{t.auth.confirm}</PrimaryButton>
          <div style={{ textAlign: 'center' }}>
            <LinkButton onClick={backToPhone}>{t.auth.change_phone}</LinkButton>
          </div>
        </div>
      )}

      {screen === 'register-profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.create_profile_title}</Subtitle>
          <div>
            <FieldLabel>{t.auth.name}</FieldLabel>
            <TextField value={name} onChange={setName} placeholder={t.auth.name_placeholder} />
          </div>
          <div>
            <FieldLabel>{t.auth.create_password_label}</FieldLabel>
            <PasswordField value={newPassword} onChange={setNewPassword} placeholder={t.auth.create_password_placeholder} />
          </div>
          <div>
            <FieldLabel>{t.auth.confirm_password_label}</FieldLabel>
            <PasswordField value={confirmPassword} onChange={setConfirmPassword} placeholder={t.auth.confirm_password_placeholder} />
          </div>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleRegister} loading={loading}>{t.auth.register}</PrimaryButton>
        </div>
      )}

      {screen === 'forgot-phone' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.forgot_phone_subtitle}</Subtitle>
          <div>
            <FieldLabel>{t.auth.phone_label}</FieldLabel>
            <TextField value={phone} onChange={v => setPhone(formatPhone(v))} placeholder={t.auth.phone_placeholder} type="tel" inputMode="numeric" />
          </div>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleForgotPhoneSubmit} loading={loading}>{t.auth.get_code}</PrimaryButton>
          <div style={{ textAlign: 'center' }}>
            <LinkButton onClick={() => setScreen('password')}>{t.auth.back}</LinkButton>
          </div>
        </div>
      )}

      {screen === 'forgot-code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.code_sent_to} {phone}</Subtitle>
          <CodeInput value={code} onChange={setCode} />
          <CountdownResend seconds={60} onResend={handleResendForgotCode} t={t} />
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleForgotCodeSubmit}>{t.auth.confirm}</PrimaryButton>
        </div>
      )}

      {screen === 'forgot-new-password' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Subtitle>{t.auth.new_password_title}</Subtitle>
          <div>
            <FieldLabel>{t.auth.new_password_label}</FieldLabel>
            <PasswordField value={newPassword} onChange={setNewPassword} placeholder={t.auth.create_password_placeholder} />
          </div>
          <div>
            <FieldLabel>{t.auth.confirm_password_label}</FieldLabel>
            <PasswordField value={confirmPassword} onChange={setConfirmPassword} placeholder={t.auth.confirm_password_placeholder} />
          </div>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton onClick={handleResetPassword} loading={loading}>{t.auth.save_password}</PrimaryButton>
        </div>
      )}
    </div>
  )
}
