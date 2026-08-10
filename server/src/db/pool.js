import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()
const { Pool } = pg
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ferma_invest',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
})
