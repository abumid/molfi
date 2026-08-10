export const ok = (res, data) => res.json({ success: true, ...data })
export const fail = (res, msg, code = 400) => res.status(code).json({ success: false, error: msg })
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
