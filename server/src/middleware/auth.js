import jwt from 'jsonwebtoken'
import { fail } from '../utils/response.js'

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return fail(res, 'Unauthorized', 401)
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    next()
  } catch {
    fail(res, 'Invalid token', 401)
  }
}

export const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return fail(res, 'Forbidden', 403)
    next()
  })
}
