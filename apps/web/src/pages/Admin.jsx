import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Button, Card, Input } from '../components/ui'
import { api } from '../utils/api'

export default function Admin() {
  const { user } = useStore()
  const navigate = useNavigate()
  const [sheep, setSheep] = useState([])
  const [form, setForm] = useState({ name: '', breed: '', current_weight_g: '', price_tiyin: '', rfid_tag: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!user || user.role !== 'admin') navigate('/catalog')
    api.get('/sheep').then(d => setSheep(d.sheep || [])).catch(console.error)
  }, [])

  const handleAdd = async () => {
    setLoading(true); setMsg('')
    try {
      await api.post('/admin/sheep', {
        ...form,
        current_weight_g: parseInt(form.current_weight_g),
        price_tiyin: parseInt(form.price_tiyin) * 100
      })
      setMsg('✅ Баран добавлен')
      setForm({ name: '', breed: '', current_weight_g: '', price_tiyin: '', rfid_tag: '' })
      const d = await api.get('/sheep')
      setSheep(d.sheep || [])
    } catch(e) { setMsg('❌ ' + e.message) }
    setLoading(false)
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 16, marginBottom: 16 }}>← Назад</button>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>⚙️ Админ панель</h1>
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Добавить барана</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="Имя" />
          <Input value={form.breed} onChange={v => setForm(f => ({...f, breed: v}))} placeholder="Порода" />
          <Input value={form.current_weight_g} onChange={v => setForm(f => ({...f, current_weight_g: v}))} placeholder="Вес (граммы)" type="number" />
          <Input value={form.price_tiyin} onChange={v => setForm(f => ({...f, price_tiyin: v}))} placeholder="Цена (сум)" type="number" />
          <Input value={form.rfid_tag} onChange={v => setForm(f => ({...f, rfid_tag: v}))} placeholder="RFID метка" />
          {msg && <p style={{ color: msg.startsWith('✅') ? 'var(--color-accent)' : 'var(--color-red)' }}>{msg}</p>}
          <Button onClick={handleAdd} loading={loading}>Добавить</Button>
        </div>
      </Card>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Все бараны ({sheep.length})</h2>
      {sheep.map(s => (
        <Card key={s.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{s.name}</strong>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{s.breed} · {(s.current_weight_g/1000).toFixed(1)} кг</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-gold)' }}>{s.sold_shares}/{s.total_shares}%</div>
          </div>
        </Card>
      ))}
    </div>
  )
}
