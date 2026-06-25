import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../index.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  const { email, username, password } = req.body
  if (!email || !username || !password)
    return res.status(400).json({ error: 'Wszystkie pola są wymagane' })
  if (password.length < 8)
    return res.status(400).json({ error: 'Hasło musi mieć co najmniej 8 znaków' })

  try {
    const hash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), username: username.trim(), password: hash },
      select: { id: true, email: true, username: true },
    })
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ user, token })
  } catch (e) {
    if (e.code === 'P2002')
      return res.status(409).json({ error: 'Email lub nazwa użytkownika jest już zajęta' })
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ error: 'Podaj email i hasło' })

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' })

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ user: { id: user.id, email: user.email, username: user.username }, token })
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, username: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika' })
    res.json(user)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

export default router
