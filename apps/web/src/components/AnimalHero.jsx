import { useState } from 'react'

const EMOJI = { sheep: '🐑', goat: '🐐', cattle: '🐄' }

/**
 * Header of the animal card.
 *
 * The title sits under the picture, not on top of it: white text on a bright
 * frame or on a silhouette cannot be read, and darkening the whole frame for
 * the sake of a caption ruins the only photo there is.
 *
 * The play button has three states, and that is not decoration. A "watch"
 * button that opens nothing is worse than no button: the person taps, nothing
 * happens, and they decide the app is broken.
 *
 *   1. stream_url present        → live feed, red "on air" dot
 *   2. no stream but video exists → the latest recording from the farm
 *   3. neither                   → caption "camera coming later"
 */
export default function AnimalHero({
  photo, title, subtitle, species, badge, badgeColor,
  streamUrl, videos = [], onBack, t,
}) {
  const [playing, setPlaying] = useState(null)

  const lastVideo = videos.find(v => v.url)
  const live = Boolean(streamUrl)
  const canPlay = live || Boolean(lastVideo)
  const src = live ? streamUrl : lastVideo?.url
  const emoji = EMOJI[species] || EMOJI.sheep

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--color-accent)',
          fontSize: 15, cursor: 'pointer', padding: '4px 0', marginBottom: 10,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        ← {t.auth.back}
      </button>

      <div style={{
        position: 'relative', height: 170, borderRadius: 18, overflow: 'hidden',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {photo ? (
          <img src={photo} alt={title}
               style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 76, opacity: .9, lineHeight: 1 }} aria-hidden="true">{emoji}</span>
        )}

        {canPlay ? (
          <button
            onClick={() => setPlaying(src)}
            aria-label={live ? t.product.watchLive : t.product.video}
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 56, height: 56, borderRadius: '50%', cursor: 'pointer',
              background: 'rgba(0,0,0,.5)', border: '2px solid rgba(255,255,255,.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              width: 0, height: 0, marginLeft: 4,
              borderTop: '10px solid transparent', borderBottom: '10px solid transparent',
              borderLeft: '16px solid #fff',
            }} />
          </button>
        ) : (
          <div style={{
            position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.45)', borderRadius: 20, padding: '5px 12px',
            fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
          }}>
            {t.product.cameraSoon}
          </div>
        )}

        {live && (
          <span style={{
            position: 'absolute', top: 12, left: 12,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,0,0,.55)', borderRadius: 20, padding: '4px 10px',
            fontSize: 11, color: '#fff',
          }}>
            <span className="pulse" style={{
              width: 7, height: 7, borderRadius: '50%', background: 'var(--color-red)',
            }} />
            {t.product.live}
          </span>
        )}
      </div>

      <div style={{
        marginTop: 12, background: 'var(--color-surface)',
        border: '1px solid var(--color-border)', borderRadius: 18, padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{emoji}</span>
          <h1 style={{
            flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, margin: 0,
            fontFamily: 'Unbounded, sans-serif', lineHeight: 1.25,
          }}>
            {title}
          </h1>
          {badge && (
            <span style={{
              flexShrink: 0, fontSize: 12, padding: '5px 12px', borderRadius: 20,
              color: badgeColor || 'var(--color-accent)',
              border: `1px solid ${badgeColor || 'var(--color-accent)'}`,
            }}>
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>
            {subtitle}
          </div>
        )}
      </div>

      {playing && (
        <div
          onClick={() => setPlaying(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <video
            src={playing} controls autoPlay playsInline
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxHeight: '80vh', borderRadius: 12, background: '#000' }}
          />
          <button
            onClick={() => setPlaying(null)}
            aria-label={t.common.cancel}
            style={{
              position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff',
              fontSize: 18, cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}
    </div>
  )
}
