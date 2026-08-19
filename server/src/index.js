import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import animalsRoutes from './routes/animals.js'
import productsRoutes from './routes/products.js'
import contractsRoutes from './routes/contracts.js'
import paymentsRoutes from './routes/payments.js'
import settingsRoutes from './routes/settings.js'
import { startJobs } from './jobs/index.js'
import walletRoutes from './routes/wallet.js'
import adminRoutes from './routes/admin.js'
import profileRoutes from './routes/profile.js'
import activityRouter from './routes/activity.js'
import bot from './services/telegramBot.js'

const app = express()

// The Telegram command menu is set separately for each language: the client
// shows whichever matches its account language. This used to be Russian only,
// so an English-speaking user saw Russian captions.
const BOT_COMMANDS = {
  en: [
    { command: 'start', description: 'Start Molfi' },
    { command: 'app', description: 'Open the app' },
    { command: 'help', description: 'Help' },
  ],
  ru: [
    { command: 'start', description: 'Запустить Molfi' },
    { command: 'app', description: 'Открыть приложение' },
    { command: 'help', description: 'Помощь' },
  ],
  uz: [
    { command: 'start', description: 'Molfi ni ishga tushirish' },
    { command: 'app', description: 'Ilovani ochish' },
    { command: 'help', description: 'Yordam' },
  ],
}

Promise.all([
  // No language_code — this is what every other locale will see
  bot.setMyCommands(BOT_COMMANDS.en),
  ...Object.entries(BOT_COMMANDS).map(([lang, cmds]) =>
    bot.setMyCommands(cmds, { language_code: lang })),
]).then(() => console.log('🤖 Telegram bot initialized'))
  .catch(e => console.error('Telegram bot setup error:', e.message))

// The cors package does not treat "*" inside a string as a wildcard — regexes
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://molfi.uz',
    'https://www.molfi.uz',
    'https://admin.molfi.uz',
    /^https:\/\/[a-z0-9-]+\.ngrok(-free)?\.(io|app)$/,
    /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
  ],
}))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api', activityRouter)
app.use('/api', animalsRoutes)
// products/contracts/payments are mounted on /api as a whole: they hold both
// public and admin paths (/admin/products and so on)
app.use('/api', productsRoutes)
app.use('/api', contractsRoutes)
app.use('/api', paymentsRoutes)
app.use('/api', settingsRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/profile', profileRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Server error' })
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`)
  startJobs()
})
