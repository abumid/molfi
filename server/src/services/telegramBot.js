import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'
import { pool } from '../db/pool.js'
dotenv.config()

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://molfi.uz'

// In-memory language cache with a database fallback (survives a PM2 restart)
const userLang = {}

const t = {
  en: {
    instruction: '📋 Sign-up:\n\n1 Tap the button below and share your number\n2 Open the Molfi app\n3 Enter your phone number\n4 The confirmation code arrives here\n5 Enter the code and finish signing up',
    choosePhone: 'Share your phone number:',
    shareBtn: '📱 Share my number',
    saved: 'Number saved. Sign-in codes will come here from now on.',
    openApp: 'Open the Molfi app',
    error: 'Something went wrong. Try again later.',
    help: 'Molfi help:\n\n/start - choose a language and share your number\n/app - open the app\n\nIf codes do not arrive: tap /start and share your number again.',
    code: (code) => `Your Molfi sign-in code: <b>${code}</b>\n\nThe code is valid for 10 minutes.`,
    welcome_msg: (name) => name ? `Welcome to Molfi, ${name}!` : 'Welcome to Molfi!',
  },
  uz: {
    instruction: '📋 Royxatdan otish:\n\n1 Quyidagi tugmani bosib telefon raqamingizni ulashing\n2 Molfi ilovasini oching\n3 Raqamingizni kiriting\n4 Tasdiqlash kodi shu yerga keladi\n5 Kodni kiriting va royxatdan oting',
    choosePhone: 'Telefon raqamingizni ulashing:',
    shareBtn: '📱 Raqamni ulashish',
    saved: 'Raqam saqlandi! Endi kirish kodlari shu yerga keladi.',
    openApp: 'Molfi ilovasini ochish',
    error: 'Xatolik yuz berdi. Keyinroq urinib koring.',
    help: 'Molfi yordam:\n\n/start - tilni tanlash va raqamni ulash\n/app - ilovani ochish\n\nKodlar kelmasa: /start bosing va raqamingizni qayta ulashing.',
    code: (code) => `Molfi kirish kodingiz: <b>${code}</b>\n\nKod 10 daqiqa amal qiladi.`,
    welcome_msg: (name) => name ? `Molfi ga xush kelibsiz, ${name}!` : 'Molfi ga xush kelibsiz!',
  },
  ru: {
    instruction: '📋 Регистрация:\n\n1 Нажмите кнопку ниже и поделитесь номером\n2 Откройте приложение Molfi\n3 Введите свой номер телефона\n4 Код подтверждения придёт сюда\n5 Введите код и завершите регистрацию',
    choosePhone: 'Поделитесь номером телефона:',
    shareBtn: '📱 Поделиться номером',
    saved: 'Номер сохранён! Теперь коды входа будут приходить сюда.',
    openApp: 'Открыть приложение Molfi',
    error: 'Ошибка. Попробуйте позже.',
    help: 'Помощь Molfi:\n\n/start - выбрать язык и поделиться номером\n/app - открыть приложение\n\nЕсли коды не приходят: нажмите /start и поделитесь номером заново.',
    code: (code) => `Ваш код подтверждения Molfi: <b>${code}</b>\n\nКод действителен 10 минут.`,
    welcome_msg: (name) => name ? `Добро пожаловать в Molfi, ${name}!` : 'Добро пожаловать в Molfi!',
  }
}

export const BOT_LANGS = Object.keys(t)

const getLang = async (telegramId) => {
  if (userLang[telegramId]) return userLang[telegramId]
  try {
    const row = (await pool.query(`SELECT language FROM users WHERE telegram_id=$1`, [telegramId])).rows[0]
    if (row?.language && t[row.language]) {
      userLang[telegramId] = row.language
      return row.language
    }
  } catch (e) {
    console.error('[bot] getLang error:', e.message)
  }
  // English is the app default; the bot must not diverge from it
  return 'en'
}

const setLang = async (telegramId, lang) => {
  userLang[telegramId] = lang
  try {
    await pool.query(`UPDATE users SET language=$1 WHERE telegram_id=$2`, [lang, telegramId])
  } catch (e) {
    console.error('[bot] setLang error:', e.message)
  }
}

const appKeyboard = (lang) => ({
  reply_markup: { inline_keyboard: [[{ text: t[lang].openApp, web_app: { url: WEBAPP_URL } }]] }
})

bot.onText(/^\/start/, async (msg) => {
  const chatId = msg.chat.id
  await bot.sendMessage(chatId, 'Molfi\n\nChoose a language / Tilni tanlang / Выберите язык:', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🇬🇧 English', callback_data: 'lang_en' },
        { text: "🇺🇿 O'zbek", callback_data: 'lang_uz' },
        { text: '🇷🇺 Русский', callback_data: 'lang_ru' }
      ]]
    }
  })
})

bot.onText(/^\/app/, async (msg) => {
  const lang = await getLang(msg.from.id)
  await bot.sendMessage(msg.chat.id, t[lang].openApp, appKeyboard(lang))
})

bot.onText(/^\/help/, async (msg) => {
  const lang = await getLang(msg.from.id)
  await bot.sendMessage(msg.chat.id, t[lang].help)
})

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  const data = query.data
  // Languages come from the dictionary itself: add a translation and the
  // button works, with no need to edit the condition here
  if (data?.startsWith('lang_') && t[data.slice(5)]) {
    const lang = data.slice(5)
    await setLang(query.from.id, lang)
    await bot.answerCallbackQuery(query.id)
    await bot.sendMessage(chatId, t[lang].instruction)
    await bot.sendMessage(chatId, t[lang].choosePhone, {
      reply_markup: {
        keyboard: [[{ text: t[lang].shareBtn, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    })
  }
})

bot.on('contact', async (msg) => {
  const chatId = msg.chat.id
  const telegramId = msg.from.id
  const lang = await getLang(telegramId)
  const rawPhone = msg.contact.phone_number
  const username = msg.from.username || null
  const firstName = msg.from.first_name || null
  const lastName = msg.from.last_name || null
  const withPlus = rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone
  const withoutPlus = rawPhone.replace(/^\+/, '')

  try {
    const result = await pool.query(
      `UPDATE users SET telegram_id=$1, telegram_username=$2, first_name=$3, last_name=$4, language=COALESCE(language,$7)
       WHERE phone=$5 OR phone=$6`,
      [telegramId, username, firstName, lastName, withPlus, withoutPlus, lang]
    )
    if (result.rowCount === 0) {
      const ref = 'REF' + Math.random().toString(36).slice(2, 8).toUpperCase()
      const user = (await pool.query(
        `INSERT INTO users (phone, telegram_id, telegram_username, first_name, last_name, referral_code, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (phone) DO UPDATE SET telegram_id=EXCLUDED.telegram_id,
           telegram_username=EXCLUDED.telegram_username,
           first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name
         RETURNING id`,
        [withPlus, telegramId, username, firstName, lastName, ref, lang]
      )).rows[0]
      await pool.query(
        `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      )
    }
    console.log(`[bot] contact saved: ${withPlus} -> tg:${telegramId}`)
    await bot.sendMessage(chatId, t[lang].saved, { reply_markup: { remove_keyboard: true } })
    await bot.sendMessage(chatId, t[lang].openApp, appKeyboard(lang))
  } catch (e) {
    console.error('[bot] contact save error:', e.message)
    await bot.sendMessage(chatId, t[lang].error)
  }
})

bot.on('polling_error', (e) => console.error('[bot] polling error:', e.message))

const describeSendError = (e) => {
  const code = e?.response?.body?.error_code
  const desc = e?.response?.body?.description || e.message
  if (code === 403) return `403 — user never pressed /start, or blocked the bot (${desc})`
  if (code === 400) return `400 — invalid chat_id/telegram_id (${desc})`
  return desc
}

export const sendVerificationCode = async (telegramId, code) => {
  if (!telegramId) return false
  try {
    const lang = await getLang(telegramId)
    await bot.sendMessage(telegramId, t[lang].code(code), { parse_mode: 'HTML' })
    return true
  } catch (e) {
    console.error(`[bot] sendVerificationCode failed for tg:${telegramId}:`, describeSendError(e))
    return false
  }
}

export const sendWelcome = async (telegramId, name) => {
  if (!telegramId) return false
  try {
    const lang = await getLang(telegramId)
    await bot.sendMessage(telegramId, t[lang].welcome_msg(name), appKeyboard(lang))
    return true
  } catch (e) {
    console.error(`[bot] sendWelcome failed for tg:${telegramId}:`, describeSendError(e))
    return false
  }
}

export default bot
