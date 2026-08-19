import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum } from '../utils/format'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Profile() {
  const { user, language, logout, balance, contracts, fetchContracts, updateProfile } = useStore()
  const t = useT(language)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { fetchContracts() }, [])

  // Statistics by contract, not by share — fractional ownership is gone
  const active = contracts.filter(c => c.status === 'active')
  const totalInvested = active.reduce((sum, c) => sum + (Number(c.principal_tiyin) || 0), 0)
  const activeShares = active.length
  // What a sale of everything today would yield. Investments only: ownership
  // exits as meat and does not count in money.
  const expectedNow = active
    .filter(c => c.model_type === 'investment')
    .reduce((sum, c) => sum + (Number(c.summary?.net) || 0), 0)

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

      {/* Header */}
      <h1 style={{
        fontFamily: 'Unbounded, sans-serif',
        fontSize: 22,
        marginBottom: 24
      }}>
        {t.profile.title}
      </h1>

      {/* Avatar + name */}
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
        {/* Avatar */}
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

        {/* Name and phone */}
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
t.profile.name_placeholder}
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
                  : t.profile.save}
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
                {user?.name || t.profile.no_name}
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
              ✓ {t.profile.saved}
            </div>
          )}
        </div>
      </div>

      {/* Statistics */}
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
          {t.profile.stats}
        </div>

        {/* Balance */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {t.wallet.balance}
          </span>
          <span style={{ color: 'var(--color-green-light)', fontWeight: 700, fontSize: 15 }}>
            {formatSum(balance, language)}
          </span>
        </div>

        {/* Invested */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {t.profile.invested}
          </span>
          <span style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: 15 }}>
            {formatSum(totalInvested, language)}
          </span>
        </div>

        {/* Active shares */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {t.contracts.title}
          </span>
          <span style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 15 }}>
            {activeShares}
          </span>
        </div>

        {/* Expected payout */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px'
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            {t.profile.expected_payout}
          </span>
          <span style={{ color: 'var(--color-green-light)', fontWeight: 700, fontSize: 15 }}>
            {formatSum(expectedNow, language)}
          </span>
        </div>
      </div>

      {/* Language */}
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
          {t.profile.language}
        </div>

        <div style={{ padding: '16px' }}>
          <LanguageSwitcher variant="full" />
        </div>
      </div>

      {/* Sign out */}
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
t.profile.logout_confirm)) logout()
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
          🚪 {t.profile.logout_action}
        </button>
      </div>

      {/* Version */}
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
