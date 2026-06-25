import { Router } from 'express'
import { prisma } from '../index.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    const invitations = await prisma.betaReader.findMany({
      where: { userId: req.user.id },
      include: {
        document: { include: { author: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(invitations)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.put('/:id/accept', async (req, res) => {
  try {
    const inv = await prisma.betaReader.findUnique({ where: { id: req.params.id } })
    if (!inv || inv.userId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })
    const updated = await prisma.betaReader.update({
      where: { id: req.params.id },
      data: { status: 'ACCEPTED' },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.put('/:id/decline', async (req, res) => {
  try {
    const inv = await prisma.betaReader.findUnique({ where: { id: req.params.id } })
    if (!inv || inv.userId !== req.user.id) return res.status(403).json({ error: 'Brak dostępu' })
    const updated = await prisma.betaReader.update({
      where: { id: req.params.id },
      data: { status: 'DECLINED' },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/:documentId/review', async (req, res) => {
  const { rating, text } = req.body
  if (!rating || !text) return res.status(400).json({ error: 'Ocena i treść recenzji są wymagane' })
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Ocena musi być od 1 do 5' })

  try {
    const betaRecord = await prisma.betaReader.findUnique({
      where: { documentId_userId: { documentId: req.params.documentId, userId: req.user.id } },
    })
    if (!betaRecord || betaRecord.status !== 'ACCEPTED')
      return res.status(403).json({ error: 'Nie jesteś zaakceptowanym beta-czytelnikiem tego dokumentu' })

    const review = await prisma.review.upsert({
      where: { documentId_userId: { documentId: req.params.documentId, userId: req.user.id } },
      update: { rating, text },
      create: { documentId: req.params.documentId, userId: req.user.id, rating, text },
      include: { user: { select: { id: true, username: true } } },
    })
    res.json(review)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/:documentId/reviews', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.documentId } })
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono' })

    const isAuthor = doc.authorId === req.user.id
    const isBeta = await prisma.betaReader.findUnique({
      where: { documentId_userId: { documentId: req.params.documentId, userId: req.user.id } },
    })

    if (!isAuthor && !isBeta && doc.phase !== 'PUBLISHED')
      return res.status(403).json({ error: 'Brak dostępu' })

    const reviews = await prisma.review.findMany({
      where: { documentId: req.params.documentId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(reviews)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/:documentId/my-review', async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: { documentId_userId: { documentId: req.params.documentId, userId: req.user.id } },
    })
    res.json(review || null)
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

export default router
