import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/auth.js'
import documentRoutes from './routes/documents.js'
import feedRoutes from './routes/feed.js'
import betaRoutes from './routes/beta.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const prisma = new PrismaClient()

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/feed', feedRoutes)
app.use('/api/beta', betaRoutes)

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../../dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Serwer na porcie ${PORT}`))
