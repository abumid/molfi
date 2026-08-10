import { useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'

const formatSum = (tiyin) => {
  const num = Number(tiyin) || 0
  return new Intl.NumberFormat('ru-UZ').format(
    Math.floor(num / 100)
  ) + ' сум'
}

export default function Profile() {
  const { user, language, setLanguage, logout, balance, myShares, updateProfile } = useStore()
  const t = useT(language)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Статистика
  const totalInvested = myShares.reduce(
    (sum, s) => sum + (Number(s.purchase_price_tiyin) || 0), 0
  )
  const activeShares = myShares.filter(s => s.status === 'active').length

  const handleSaveName = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.put('/profile/update', { name: name.trim() })
      updateProfile({ name: name.trim() })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      padding: '20px 16px 90px',
      fontFamily: 'Inter, sans-serif',
      color: 'var(--color-text)',
      background: 'var(--color-bg)',
      minHeight: '100vh'
    }}>

      {/* Заголовок */}
      <h1 style={{
        fontFamily: 'Unbounded, sans-serif',
        fontSize: 22,
        marginBottom: 24
      }}>
        {language === 'uz' ? 'Profil' : 'Профиль'}
      </h1>

      {/* Аватар + имя */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16
      }}>
        {/* Аватар */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-green-light), var(--color-green))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          flexShrink: 0
        }}>
          {user?.name
            ? user.name.charAt(0).toUpperCase()
            : user?.phone?.slice(-2) || '?'}
        </div>

        {/* Имя и телефон */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                autoFocus
                style={{
                  flex: 1,
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-green-light)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  color: 'var(--color-text)',
                  fontSize: 15,
                  fontFamily: 'Inter, sans-serif',
                  outline: 'none'
                }}
                placeholder={
                  language === 'uz' ? 'Ismingiz' : 'Ваше имя'
                }
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                style={{
                  background: 'var(--color-green-light)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 14px',
                  color: 'var(--color-bg)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                {saving
                  ? '...'
                  : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
              </button>
              <button
                onClick={() => { setEditing(false); setName(user?.name || '') }}
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setEditing(true)}
            >
              <span style={{ fontSize: 17, fontWeight: 600 }}>
                {user?.name || (language === 'uz' ? 'Ism kiritilmagan' : 'Имя не указано')}
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-green-light)' }}>✏️</span>
            </div>
          )}

          <div style={{
            color: 'var(--color-text-muted)',
            fontSize: 13,
            marginTop: editing ? 0 : 4
          }}>
            {user?.phone}
          </div>

          {saved && (
            <div style={{
              color: 'var(--color-green-light)',
              fontSize: 12,
              marginTop: 4
            }}>
              ✓ {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
            </div>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 12,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600
        }}>
          {language === 'uz' ? 'Statistika' : 'Статистика'}
        </div>

        {/* Баланс */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {language === 'uz' ? 'Balans' : 'Баланс'}
          </span>
          <span style={{ color: 'var(--color-green-light)', fontWeight: 700, fontSize: 15 }}>
            {formatSum(balance)}
          </span>
        </div>

        {/* Вложено */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {language === 'uz' ? 'Investitsiya qilingan' : 'Вложено в активы'}
          </span>
          <span style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: 15 }}>
            {formatSum(totalInvested)}
          </span>
        </div>

        {/* Активных долей */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {language === 'uz' ? 'Faol ulushlar' : 'Активных долей'}
          </span>
          <span style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 15 }}>
            {activeShares}
          </span>
        </div>

        {/* Ожидаемая выплата */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {language === 'uz' ? 'Kutilayotgan to\'lov' : 'Ожидаемая выплата'}
          </span>
          <span style={{ color: 'var(--color-green-light)', fontWeight: 700, fontSize: 15 }}>
            ~{formatSum(totalInvested * 0.15)}
          </span>
        </div>
      </div>

      {/* Язык */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 12,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600
        }}>
          {language === 'uz' ? 'Til' : 'Язык'}
        </div>

        <div style={{
          padding: '16px',
          display: 'flex',
          gap: 8
        }}>
          {[
            { code: 'ru', label: 'Русский', flag: '🇷🇺' },
            { code: 'uz', label: "O'zbek", flag: '🇺🇿' }
          ].map(lang => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              style={{
                flex: 1,
                padding: '12px 8px',
                borderRadius: 12,
                border: language === lang.code
                  ? 'none'
                  : '1px solid var(--color-border)',
                background: language === lang.code
                  ? 'var(--color-green-light)'
                  : 'var(--color-surface-2)',
                color: language === lang.code ? 'var(--color-bg)' : 'var(--color-text-muted)',
                fontWeight: language === lang.code ? 700 : 400,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              {lang.flag} {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Выход */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16
      }}>
        <button
          onClick={() => {
            if (confirm(
              language === 'uz'
                ? 'Chiqishni tasdiqlaysizmi?'
                : 'Выйти из аккаунта?'
            )) logout()
          }}
          style={{
            width: '100%',
            padding: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--color-red)',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'Inter, sans-serif'
          }}
        >
          🚪 {language === 'uz' ? 'Chiqish' : 'Выйти из аккаунта'}
        </button>
      </div>

      {/* Версия */}
      <div style={{
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 12,
        marginTop: 8
      }}>
        Molfi v1.0 MVP
      </div>
    </div>
  )
}
