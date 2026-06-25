import { Router } from 'express'
import { prisma } from '../index.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const PHASES = ['DRAFT_1', 'DRAFT_2', 'DRAFT_3', 'BETA', 'PUBLISHED']

router.get('/', async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: { authorId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, tree: true, phase: true, published: true, createdAt: true, updatedAt: true },
    })
    res.json(docs)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/', async (req, res) => {
  const { title, tree } = req.body
  try {
    const doc = await prisma.document.create({
      data: { title: title || 'Nowy dokument', tree: tree || [], authorId: req.user.id },
    })
    res.json(doc)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { author: { select: { id: true, username: true } } },
    })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })

    const isBetaReader = doc.phase === 'BETA' && await prisma.betaReader.findUnique({
      where: { documentId_userId: { documentId: doc.id, userId: req.user.id } },
    })

    if (doc.authorId !== req.user.id && !isBetaReader && doc.phase !== 'PUBLISHED')
      return res.status(403).json({ error: 'Brak dostępu' })

    res.json(doc)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.put('/:id', async (req, res) => {
  const { title, tree } = req.body
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(tree !== undefined && { tree }),
      },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })
    await prisma.document.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/:id/advance', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })

    const idx = PHASES.indexOf(doc.phase)
    if (idx >= PHASES.length - 1)
      return res.status(400).json({ error: 'Dokument jest już opublikowany' })

    const nextPhase = PHASES[idx + 1]
    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { phase: nextPhase, ...(nextPhase === 'PUBLISHED' && { published: true }) },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/:id/retreat', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })

    const idx = PHASES.indexOf(doc.phase)
    if (idx <= 0) return res.status(400).json({ error: 'To jest już pierwsza faza' })

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { phase: PHASES[idx - 1], published: false },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/:id/invite', async (req, res) => {
  const { email } = req.body
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })
    if (doc.phase !== 'BETA') return res.status(400).json({ error: 'Dokument nie jest w fazie beta' })

    const invitee = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!invitee) return res.status(404).json({ error: 'Nie znaleziono użytkownika o tym emailu' })
    if (invitee.id === req.user.id) return res.status(400).json({ error: 'Nie możesz zaprosić siebie' })

    const reader = await prisma.betaReader.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: invitee.id } },
      update: { status: 'PENDING' },
      create: { documentId: doc.id, userId: invitee.id },
      include: { user: { select: { id: true, username: true } } },
    })
    res.json(reader)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/:id/beta', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc || doc.authorId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })

    const readers = await prisma.betaReader.findMany({
      where: { documentId: req.params.id },
      include: { user: { select: { id: true, username: true, email: true } } },
    })
    res.json(readers)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

export default router
