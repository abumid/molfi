import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { Button } from '../components/ui'
import { SheepIcon } from '../components/Logo'

const slides = [
  { emoji: '🐑', titleKey: 'slide1_title', descKey: 'slide1_desc' },
  { emoji: '📹', titleKey: 'slide2_title', descKey: 'slide2_desc' },
  { emoji: '💰', titleKey: 'slide3_title', descKey: 'slide3_desc' },
]

export default function Onboarding() {
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()
  const { language } = useStore()
  const t = useT(language)
  const slide = slides[idx]
  const isLast = idx === slides.length - 1

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        {idx === 0 ? <SheepIcon size={80} /> : <div style={{ fontSize: 80 }}>{slide.emoji}</div>}
        <h1 style={{ fontSize: 24, textAlign: 'center', color: 'var(--color-text)', lineHeight: 1.3 }}>
          {t.onboarding[slide.titleKey]}
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6 }}>
          {t.onboarding[slide.descKey]}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 24 : 8, height: 8, borderRadius: 4,
              background: i === idx ? 'var(--color-accent)' : 'var(--color-border)',
              transition: 'all 0.3s'
            }} />
          ))}
        </div>
      </div>
      <Button onClick={() => isLast ? navigate('/auth') : setIdx(i => i + 1)}>
        {isLast ? t.onboarding.start : t.onboarding.next}
      </Button>
    </div>
  )
}
