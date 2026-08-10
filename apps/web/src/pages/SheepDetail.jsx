import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { api } from '../utils/api'
import { useT } from '../i18n'

const C = {
  bg: 'var(--color-bg)', surface: 'var(--color-surface)', surface2: 'var(--color-surface-2)', border: 'var(--color-border)',
  accent: 'var(--color-green-light)', gold: 'var(--color-accent)', text: 'var(--color-text)', textMuted: 'var(--color-text-muted)', red: 'var(--color-red)',
}

const formatSum = (tiyin) => {
  if (!tiyin && tiyin !== 0) return '0 сум'
  return new Intl.NumberFormat('ru-UZ').format(Math.floor((tiyin || 0) / 100)) + ' сум'
}

const tt = (lang, ru, uz) => (lang === 'uz' ? uz : ru)

const timeAgo = (date, lang) => {
  if (!date) return ''
  const days = Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24))
  if (lang === 'uz') {
    if (days === 0) return 'Bugun'
    if (days === 1) return 'Kecha'
    return `${days} kun oldin`
  }
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return `${days} дней назад`
}

const ACTIVITY_CONFIG = {
  feeding:  { icon: '🌿', iconBg: 'rgba(111,207,74,0.08)' },
  weighing: { icon: '⚖️', iconBg: 'rgba(111,207,74,0.08)' },
  vet:      { icon: '🩺', iconBg: 'rgba(91,156,240,0.10)' },
  video:    { icon: '🎥', iconBg: 'rgba(212,168,67,0.10)' },
}

function formatActivityTime(item, lang) {
  const dateVal = item?.created_at
  if (!dateVal) return ''
  const date = new Date(dateVal)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (lang === 'uz') {
    if (diffDays === 0) return `Bugun, ${timeStr}`
    if (diffDays === 1) return `Kecha, ${timeStr}`
    return `${diffDays} kun oldin`
  }
  if (diffDays === 0) return `Сегодня, ${timeStr}`
  if (diffDays === 1) return `Вчера, ${timeStr}`
  return `${diffDays} д. назад`
}

export default function SheepDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { language, myShares } = useStore()
  const t = useT(language)
  const [data, setData] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState(null)

  useEffect(() => {
    api.get(`/sheep/${id}`).then(setData).catch(console.error)
  }, [id])

  useEffect(() => {
    if (!id) return
    setActivityLoading(true)
    setActivityError(null)
    api.get(`/sheep/${id}/activity?limit=20`)
      .then(json => {
        setActivity(json.data?.items || [])
        setActivityLoading(false)
      })
      .catch(err => {
        console.error('Activity fetch error:', err)
        setActivityError(err.message)
        setActivityLoading(false)
      })
  }, [id])

  if (!data) {
    return (
      <div style={{ padding: '20px 16px', color: C.textMuted, textAlign: 'center' }}>
        {t.common.loading}
      </div>
    )
  }

  const { sheep } = data
  const userShare = myShares.find(s => s.sheep_id === sheep?.id)

  const soldPct = sheep.total_shares > 0
    ? Math.min(100, Math.round((sheep.sold_shares / sheep.total_shares) * 100))
    : 0
  const myPct = userShare ? Number(userShare.share_pct) : 0
  const freePct = Math.max(0, 100 - soldPct - myPct)
  const availablePct = sheep.total_shares - sheep.sold_shares

  const weightKg = (sheep.current_weight_g || 0) / 1000
  const pricePerKg = sheep.price_per_kg_tiyin || 4500000
  const grossRevenue = weightKg * pricePerKg
  const investorPool = grossRevenue * 0.90
  const projectedPayout = userShare ? Math.round(investorPool * (Number(userShare.share_pct) / 100)) : 0
  const invested = userShare ? Number(userShare.purchase_price_tiyin) : 0
  const profit = projectedPayout - invested
  const profitPercent = invested > 0 ? Math.round(profit / invested * 100) : 0

  const daysLeft = sheep.expected_sale_date
    ? Math.round((new Date(sheep.expected_sale_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const firstVideoIndex = activity.findIndex(a => a.type === 'video')
  const latestVideo = activity[firstVideoIndex] ?? null
  const videoDateStr = sheep.last_video_at
    ? timeAgo(sheep.last_video_at, language)
    : latestVideo
      ? formatActivityTime(latestVideo, language)
      : tt(language, 'Скоро', 'Tez orada')

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: 'Inter, sans-serif', color: C.text, paddingBottom: 110 }}>

      {/* [1] HEADER */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: C.surface2, border: 'none', borderRadius: '50%',
          width: 34, height: 34, cursor: 'pointer', color: C.text, fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 15, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sheep.name}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{sheep.breed}</div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 999, fontSize: 11,
          background: sheep.status === 'active' ? '#3a9a3a22' : 'var(--color-red)22',
          color: sheep.status === 'active' ? C.accent : C.red,
          border: `1px solid ${sheep.status === 'active' ? '#3a9a3a44' : 'var(--color-red)44'}`,
        }}>
          {sheep.status === 'active' ? tt(language, 'Активен', 'Faol') : tt(language, 'Продан', 'Sotildi')}
        </span>
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* [2] VIDEO BLOCK */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
          overflow: 'hidden', marginBottom: 12,
        }}>
          <div style={{
            height: 140, background: C.surface2,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(111,207,74,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: C.accent, cursor: 'pointer',
            }}>▶</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              {tt(language, 'Последнее видео', 'Oxirgi video')} · {videoDateStr}
            </div>
          </div>
        </div>

        {/* [3] SHARES PROGRESS */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {t.sheepDetail.sharesProgress}
            </span>
            <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
              {soldPct}% {t.sheepDetail.sold}
            </span>
          </div>
          <div style={{ background: C.surface2, borderRadius: 999, height: 7, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${soldPct}%`, height: '100%', background: C.accent, borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { label: t.sheepDetail.sold, pct: soldPct, color: C.accent },
              { label: t.sheepDetail.free, pct: freePct, color: C.border },
              ...(myPct > 0 ? [{ label: t.sheepDetail.yours, pct: myPct, color: C.gold }] : []),
            ].map(({ label, pct, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.textMuted }}>{label} {pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* [4] METRIC CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {tt(language, 'Вес', 'Vazn')}
            </div>
            <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 3 }}>
              {weightKg.toFixed(1)} {tt(language, 'кг', 'kg')}
            </div>
            <div style={{ fontSize: 9, color: C.textMuted }}>+2.3 {tt(language, 'кг / нед', 'kg / haf')}</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {tt(language, 'Здоровье', "Sog'liq")}
            </div>
            <div style={{ fontSize: 18, marginBottom: 3 }}>✅</div>
            <div style={{ fontSize: 9, color: C.accent }}>{tt(language, 'Хорошее', 'Yaxshi')}</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {tt(language, 'Продажа', 'Sotish')}
            </div>
            <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 3 }}>
              {daysLeft !== null
                ? (daysLeft > 0 ? `~${daysLeft}д` : tt(language, 'Скоро!', 'Tez!'))
                : tt(language, '~3 мес', '~3 oy')}
            </div>
            <div style={{ fontSize: 9, color: C.textMuted }}>
              {sheep.expected_sale_date
                ? new Date(sheep.expected_sale_date).toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU')
                : ''}
            </div>
          </div>
        </div>

        {/* [5] YOUR SHARE or BUY INVITE */}
        {userShare ? (
          <div style={{
            background: C.surface, border: '1px solid rgba(212,168,67,0.35)',
            borderRadius: 16, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 10, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                {t.sheepDetail.yourShare}
              </span>
              {profitPercent > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(111,207,74,0.12)', color: C.accent }}>
                  +{profitPercent}%
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{tt(language, 'Доля', 'Ulush')}</div>
                <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 22, fontWeight: 700, color: C.gold }}>{userShare.share_pct}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{t.sheepDetail.invested}</div>
                <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 700 }}>{formatSum(invested)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{t.sheepDetail.expectedPayout}</div>
                <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 700, color: C.accent }}>{formatSum(projectedPayout)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{t.sheepDetail.netProfit}</div>
                <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 700, color: profit >= 0 ? C.accent : C.red }}>
                  {(profit >= 0 ? '+' : '') + formatSum(profit)}
                </div>
              </div>
            </div>
            {availablePct > 0 && (
              <button onClick={() => navigate(`/sheep/${sheep.id}/buy`)} style={{
                width: '100%', height: 42, borderRadius: 10,
                background: 'transparent', border: `1.5px solid ${C.accent}`,
                color: C.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
                + {t.sheepDetail.buyMore}
              </button>
            )}
          </div>
        ) : (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: 16, marginBottom: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🐑</div>
            <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {tt(language, 'Инвестируйте в этого барана', "Bu qo'yga invest qiling")}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: availablePct > 0 ? 14 : 0 }}>
              {tt(language, 'Доходность до +57% за 4 месяца', '4 oyda +57% gacha daromadlilik')}
            </div>
            {availablePct > 0 && (
              <button onClick={() => navigate(`/sheep/${sheep.id}/buy`)} style={{
                width: '100%', height: 44, borderRadius: 10,
                background: C.accent, border: 'none',
                color: C.bg, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                🐑 {t.sheepDetail.buyFirst}
              </button>
            )}
          </div>
        )}

        {/* [6] RFID COMPACT */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(212,168,67,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: C.gold,
          }}>📡</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              RFID · {sheep.rfid_tag || '—'}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>
              {tt(language, 'Последнее сканирование', "So'nggi skanerlash")}: {timeAgo(sheep.last_scan_at || sheep.created_at, language)}
            </div>
          </div>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
        </div>

        {/* [7] ACTIVITY TIMELINE */}
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 14 }}>
          {t.sheep.activity}
        </div>

        {activityLoading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ color: C.textMuted, fontSize: 13 }}>
              {tt(language, 'Загрузка активности...', 'Faoliyat yuklanmoqda...')}
            </div>
          </div>
        ) : activityError ? (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ color: C.red, fontSize: 13 }}>
              {tt(language, 'Не удалось загрузить активность', "Faoliyatni yuklab bo'lmadi")}
            </div>
          </div>
        ) : activity.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ color: C.textMuted, fontSize: 13 }}>
              {tt(language, 'Активность пока не добавлена', "Faoliyat hali qo'shilmagan")}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 13, top: 0, bottom: 0, width: 1, background: C.border }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {activity.slice(0, 8).map((item, i, arr) => {
                const cfg = ACTIVITY_CONFIG[item.type] || ACTIVITY_CONFIG.feeding
                const isFirstVideo = item.type === 'video' && i === firstVideoIndex
                const title = language === 'uz' ? item.title_uz : item.title_ru
                const description = language === 'uz' ? item.description_uz : item.description_ru
                return (
                  <div key={item.id ?? i} style={{ display: 'flex', gap: 12, paddingBottom: i < arr.length - 1 ? 20 : 0, position: 'relative' }}>
                    <div style={{
                      width: 27, height: 27, borderRadius: '50%', flexShrink: 0,
                      background: cfg.iconBg, border: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, position: 'relative', zIndex: 1, marginTop: 1,
                    }}>
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{title}</span>
                        <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, paddingTop: 1 }}>
                          {formatActivityTime(item, language)}
                        </span>
                      </div>
                      {description && (
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: item.meta ? 8 : 0 }}>
                          {description}
                        </div>
                      )}
                      {item.type === 'weighing' && item.meta && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(111,207,74,0.1)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: C.accent }}>
                          ↑ {item.meta.weight_kg} кг · +{item.meta.delta_kg} кг / нед
                        </div>
                      )}
                      {item.type === 'vet' && item.meta && (
                        <span style={{
                          display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                          background: item.meta.result_ru === 'Здоров' ? 'rgba(111,207,74,0.12)' : 'rgba(212,168,67,0.12)',
                          color: item.meta.result_ru === 'Здоров' ? C.accent : C.gold,
                        }}>
                          {language === 'uz' ? item.meta?.result_uz : item.meta?.result_ru}
                        </span>
                      )}
                      {item.type === 'video' && (
                        <div style={{
                          background: C.surface2, border: `1px solid ${C.border}`,
                          borderRadius: 10, padding: '8px 10px',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <div style={{
                            width: 44, height: 32, borderRadius: 6, flexShrink: 0,
                            background: 'rgba(212,168,67,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: C.gold,
                          }}>▶</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {description}
                            </div>
                            {item.meta && (
                              <div style={{ fontSize: 11, color: C.textMuted }}>
                                {item.meta.duration} · {language === 'uz' ? item.meta?.location_uz : item.meta?.location_ru}
                              </div>
                            )}
                          </div>
                          {isFirstVideo && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'rgba(212,168,67,0.15)', color: C.gold, flexShrink: 0 }}>
                              {t.sheepDetail.newVideo}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* Fixed buy button — логика не тронута */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: C.bg, borderTop: `1px solid ${C.border}`,
        padding: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}>
        {availablePct > 0 ? (
          <button
            onClick={() => navigate(`/sheep/${sheep.id}/buy`)}
            style={{
              width: '100%', height: 52, borderRadius: 16,
              background: C.accent, color: C.bg,
              fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
            }}
          >
            {language === 'uz'
              ? `Ulush sotib olish · ${availablePct}% mavjud`
              : `Купить долю · ${availablePct}% доступно`}
          </button>
        ) : (
          <div style={{
            width: '100%', height: 52, borderRadius: 16,
            background: C.surface2, color: C.textMuted,
            fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {language === 'uz' ? 'Barcha ulushlar sotildi' : 'Все доли проданы'}
          </div>
        )}
      </div>

    </div>
  )
}
