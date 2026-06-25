import { Router } from 'express'
import { prisma } from '../index.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

const router = Router()

function getExcerpt(tree) {
  if (!Array.isArray(tree)) return ''
  for (const node of tree) {
    if (node.content?.trim()) return node.content.trim().slice(0, 220)
    if (node.children) {
      const child = getExcerpt(node.children)
      if (child) return child
    }
  }
  return ''
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: { published: true, phase: 'PUBLISHED' },
      include: {
        author: { select: { id: true, username: true } },
        ratings: true,
        _count: {
          select: {
            reviews: true,
            betaReaders: { where: { status: 'ACCEPTED' } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const result = docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      author: doc.author,
      updatedAt: doc.updatedAt,
      hasBetaReaders: doc._count.betaReaders > 0,
      betaReaderCount: doc._count.betaReaders,
      reviewCount: doc._count.reviews,
      avgRating: doc.ratings.length
        ? Math.round((doc.ratings.reduce((s, r) => s + r.value, 0) / doc.ratings.length) * 10) / 10
        : null,
      userRating: req.user ? (doc.ratings.find(r => r.userId === req.user.id)?.value ?? null) : null,
      excerpt: getExcerpt(doc.tree),
    }))

    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, username: true } },
        reviews: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: { createdAt: 'desc' },
        },
        ratings: true,
        betaReaders: {
          where: { status: 'ACCEPTED' },
          include: { user: { select: { id: true, username: true } } },
        },
      },
    })

    if (!doc || doc.phase !== 'PUBLISHED') return res.status(404).json({ error: 'Nie znaleziono' })

    res.json({
      ...doc,
      avgRating: doc.ratings.length
        ? Math.round((doc.ratings.reduce((s, r) => s + r.value, 0) / doc.ratings.length) * 10) / 10
        : null,
      userRating: req.user ? (doc.ratings.find(r => r.userId === req.user.id)?.value ?? null) : null,
    })
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

router.post('/:id/rate', requireAuth, async (req, res) => {
  const { value } = req.body
  if (!value || value < 1 || value > 5)
    return res.status(400).json({ error: 'Ocena musi być od 1 do 5' })

  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc || doc.phase !== 'PUBLISHED') return res.status(404).json({ error: 'Nie znaleziono' })
    if (doc.authorId === req.user.id)
      return res.status(400).json({ error: 'Nie możesz oceniać własnego dokumentu' })

    await prisma.rating.upsert({
      where: { documentId_userId: { documentId: req.params.id, userId: req.user.id } },
      update: { value },
      create: { documentId: req.params.id, userId: req.user.id, value },
    })

    const allRatings = await prisma.rating.findMany({ where: { documentId: req.params.id } })
    const avg = Math.round((allRatings.reduce((s, r) => s + r.value, 0) / allRatings.length) * 10) / 10

    res.json({ avg, userRating: value })
  } catch {
    res.status(500).json({ error: 'Błąd serwera' })
  }
})

export default router
