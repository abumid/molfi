// Текст кода на трёх языках. Раньше здесь был зашит русский, и клиент
// с английским интерфейсом получал SMS по-русски.
const CODE_TEXT = {
  en: (code) => `Your Molfi sign-in code: ${code}`,
  ru: (code) => `Ваш код подтверждения Molfi: ${code}`,
  uz: (code) => `Molfi kirish kodingiz: ${code}`,
}

export const smsCodeText = (code, language = 'en') =>
  (CODE_TEXT[language] || CODE_TEXT.en)(code)

let eskizToken = null

const getEskizToken = async () => {
  if (eskizToken) return eskizToken
  const res = await fetch('https://notify.eskiz.uz/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ESKIZ_EMAIL, password: process.env.ESKIZ_PASSWORD })
  })
  const data = await res.json()
  eskizToken = data?.data?.token || null
  return eskizToken
}

export const sendSms = async (phone, message) => {
  try {
    const token = await getEskizToken()
    if (!token) return
    await fetch('https://notify.eskiz.uz/api/message/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mobile_phone: phone.replace('+', ''), message, from: '4546' })
    })
  } catch (e) {
    console.error('Eskiz SMS error:', e.message)
  }
}
