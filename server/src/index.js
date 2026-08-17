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

bot.setMyCommands([
  { command: 'start', description: 'Запустить Molfi' },
  { command: 'app', description: 'Открыть приложение' },
  { command: 'help', description: 'Помощь' },
]).then(() => console.log('🤖 Telegram bot initialized'))
  .catch(e => console.error('Telegram bot setup error:', e.message))

// Строки с "*" пакет cors не раскрывает как маску — нужны регулярки
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
// products/contracts/payments монтируются на /api целиком: внутри лежат
// и публичные пути, и админские (/admin/products и т.д.)
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
