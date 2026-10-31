
import 'dotenv/config'
import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import pg from 'pg'
import { v2 as cloudinary } from 'cloudinary'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const ADMIN_PASSWORD_FILE = path.join(DATA_DIR, 'admin-password.json')
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')
const PORT = Number(process.env.PORT || 3002)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const CLOUDINARY_CONFIGURED = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não está configurada no ficheiro .env.')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  max: 10,
})

const app = express()
fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use('/api/admin', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const CONFIGURED_ADMIN_PASSWORD = process.env.CREATINA_ADMIN_PASSWORD

if (IS_PRODUCTION && (
  !CONFIGURED_ADMIN_PASSWORD ||
  CONFIGURED_ADMIN_PASSWORD.length < 16 ||
  CONFIGURED_ADMIN_PASSWORD === 'CreatinaAdmin2026!'
)) {
  throw new Error('Define CREATINA_ADMIN_PASSWORD com pelo menos 16 caracteres fortes antes de publicar.')
}

const ADMIN_PASSWORD = CONFIGURED_ADMIN_PASSWORD || 'CreatinaAdmin2026!'

function readPasswordRecord() {
  try {
    const record = JSON.parse(fs.readFileSync(ADMIN_PASSWORD_FILE, 'utf8'))
    if (typeof record.salt === 'string' && typeof record.hash === 'string') return record
  } catch {}
  return null
}

function passwordMatches(password, record) {
  if (!record) {
    const supplied = Buffer.from(password)
    const expected = Buffer.from(ADMIN_PASSWORD)
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
  }
  const actual = crypto.scryptSync(password, record.salt, 64)
  const expected = Buffer.from(record.hash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function savePasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  const temporary = `${ADMIN_PASSWORD_FILE}.tmp`
  fs.writeFileSync(temporary, JSON.stringify({ salt, hash }), { mode: 0o600 })
  fs.renameSync(temporary, ADMIN_PASSWORD_FILE)
}

if (!CONFIGURED_ADMIN_PASSWORD) {
  console.warn('AVISO: palavra-passe temporária activa. Configura CREATINA_ADMIN_PASSWORD no .env.')
}

const sessions = new Map()
const loginAttempts = new Map()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000
const validStatuses = [
  'Recebida', 'Em confirmação', 'Confirmada',
  'Em preparação', 'Enviada', 'Concluída', 'Cancelada',
]

function requireAdmin(req, res, next) {
  const now = Date.now()
  for (const [key, expiry] of sessions) {
    if (expiry <= now) sessions.delete(key)
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const expiry = token ? sessions.get(token) : null

  if (!token || !expiry || expiry <= now) {
    if (token) sessions.delete(token)
    return res.status(401).json({
      error: 'Sessão inválida ou expirada. Inicia sessão novamente.',
    })
  }
  next()
}

function publicProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description || '',
    price: Number(row.price),
    category: row.category || '',
    image: row.image || '',
    tag: row.tag || '',
    published: Boolean(row.published),
    soldOut: Boolean(row.sold_out),
    createdAt: row.created_at,
  }
}

function productInput(body, old = {}) {
  const name = String(body?.name ?? old.name ?? '').trim()
  const description = String(body?.description ?? old.description ?? '').trim()
  const price = Number(body?.price ?? old.price)
  const category = String(body?.category ?? old.category ?? '').trim()
  const image = String(body?.image ?? old.image ?? '').trim()
  const tag = String(body?.tag ?? old.tag ?? '').trim()
  const published = body?.published === undefined
    ? Boolean(old.published ?? true)
    : body.published === true
  const soldOut = body?.soldOut === undefined
    ? Boolean(old.soldOut ?? false)
    : body.soldOut === true

  if (!name) throw new Error('Preenche o nome do produto.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Indica um preço válido em Kz.')
  if (!category) throw new Error('Escolhe uma categoria.')
  if (
    name.length > 120 || description.length > 1200 ||
    category.length > 60 || image.length > 500 || tag.length > 50
  ) {
    throw new Error('Um dos campos excede o limite permitido.')
  }

  return { name, description, price, category, image, tag, published, soldOut }
}

async function nextId(client, counterName) {
  const result = await client.query(
    'SELECT next_value FROM app_counters WHERE name = $1 FOR UPDATE',
    [counterName],
  )
  if (!result.rows.length) {
    throw new Error(`Contador "${counterName}" não encontrado na base de dados.`)
  }

  const id = Number(result.rows[0].next_value)
  await client.query(
    'UPDATE app_counters SET next_value = $1 WHERE name = $2',
    [id + 1, counterName],
  )
  return id
}

async function getOrder(id) {
  const result = await pool.query(
    `SELECT id, order_number, customer_name, phone, address, zone,
            payment, total, status, created_at
       FROM orders WHERE id = $1`,
    [id],
  )
  if (!result.rows.length) return null

  const row = result.rows[0]
  const itemsResult = await pool.query(
    `SELECT product_id, name, price, quantity
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [id],
  )

  return {
    id: Number(row.id),
    orderNumber: row.order_number,
    customerName: row.customer_name,
    phone: row.phone,
    address: row.address,
    zone: row.zone,
    payment: row.payment,
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
    items: itemsResult.rows.map(item => ({
      productId: item.product_id == null ? null : Number(item.product_id),
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
    })),
  }
}

const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extensions = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/avif': '.avif',
      }
      callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extensions[file.mimetype] || '.img'}`)
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Escolhe uma imagem PNG, JPG, WEBP ou AVIF até 8 MB.'))
    }
    callback(null, true)
  },
})

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'online', app: 'CREATINE LAB', database: 'neon-postgresql' })
  } catch (error) {
    console.error('Erro de ligação ao Neon:', error.message)
    res.status(503).json({ status: 'offline', app: 'CREATINE LAB', database: 'neon-postgresql' })
  }
})

app.post('/api/admin/login', (req, res) => {
  const now = Date.now()
  const ip = req.ip || req.socket.remoteAddress || 'unknown'

  for (const [key, entry] of loginAttempts) {
    if (entry.blockedUntil < now && now - entry.windowStartedAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key)
    }
  }

  let entry = loginAttempts.get(ip)
  if (entry?.blockedUntil > now) {
    res.setHeader('Retry-After', String(Math.ceil((entry.blockedUntil - now) / 1000)))
    return res.status(429).json({ error: 'Demasiadas tentativas. Aguarda antes de tentar novamente.' })
  }

  if (!entry || now - entry.windowStartedAt > LOGIN_WINDOW_MS) {
    entry = { count: 0, windowStartedAt: now, blockedUntil: 0 }
    loginAttempts.set(ip, entry)
  }

  const password = String(req.body?.password ?? '')
  if (!passwordMatches(password, readPasswordRecord())) {
    entry.count++
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      entry.blockedUntil = now + LOGIN_LOCKOUT_MS
      res.setHeader('Retry-After', String(LOGIN_LOCKOUT_MS / 1000))
      return res.status(429).json({
        error: 'Demasiadas tentativas. Acesso bloqueado temporariamente por 15 minutos.',
      })
    }
    return res.status(401).json({ error: 'Credenciais inválidas.' })
  }

  loginAttempts.delete(ip)
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)
  res.json({ token, expiresIn: 8 * 60 * 60 })
})

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (token) sessions.delete(token)
  res.status(204).end()
})

app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next()
  return requireAdmin(req, res, next)
})

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '')
  const newPassword = String(req.body?.newPassword ?? '')
  const confirmation = String(req.body?.confirmation ?? '')

  if (!passwordMatches(currentPassword, readPasswordRecord())) {
    return res.status(400).json({ error: 'A palavra-passe actual está incorrecta.' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova palavra-passe deve ter pelo menos 6 caracteres.' })
  }
  if (newPassword.length > 256) {
    return res.status(400).json({ error: 'A nova palavra-passe é demasiado longa.' })
  }
  if (newPassword !== confirmation) {
    return res.status(400).json({ error: 'A confirmação não corresponde à nova palavra-passe.' })
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Escolhe uma palavra-passe diferente da actual.' })
  }

  try {
    savePasswordRecord(newPassword)
    sessions.clear()
    const token = crypto.randomBytes(32).toString('hex')
    sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)
    res.json({ token, expiresIn: 8 * 60 * 60 })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Não foi possível guardar a nova palavra-passe.' })
  }
})

app.get('/api/products', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE published = TRUE ORDER BY id DESC',
    )
    res.json(result.rows.map(publicProduct))
  } catch (error) { next(error) }
})

app.get('/api/admin/products', requireAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC')
    res.json(result.rows.map(publicProduct))
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const product = productInput(req.body)
    await client.query('BEGIN')
    const id = await nextId(client, 'products')
    const result = await client.query(
      `INSERT INTO products
       (id, name, description, price, category, image, tag, published, sold_out, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [id, product.name, product.description, product.price, product.category,
        product.image, product.tag, product.published, product.soldOut],
    )
    await client.query('COMMIT')
    res.status(201).json(publicProduct(result.rows[0]))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof Error && error.message.startsWith('Preenche') ||
        error instanceof Error && (
          error.message.startsWith('Indica') ||
          error.message.startsWith('Escolhe') ||
          error.message.startsWith('Um dos campos')
        )) {
      return res.status(400).json({ error: error.message })
    }
    console.error(error)
    res.status(500).json({ error: 'Não foi possível criar o produto.' })
  } finally { client.release() }
})

app.put('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' })
    const found = await pool.query('SELECT * FROM products WHERE id = $1', [id])
    if (!found.rows.length) return res.status(404).json({ error: 'Produto não encontrado.' })

    const old = publicProduct(found.rows[0])
    const product = productInput(req.body, old)
    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, category=$4,
       image=$5, tag=$6, published=$7, sold_out=$8 WHERE id=$9 RETURNING *`,
      [product.name, product.description, product.price, product.category,
        product.image, product.tag, product.published, product.soldOut, id],
    )
    res.json(publicProduct(result.rows[0]))
  } catch (error) {
    if (error instanceof Error && /Preenche|Indica|Escolhe|excede/.test(error.message)) {
      return res.status(400).json({ error: error.message })
    }
    next(error)
  }
})

app.delete('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [Number(req.params.id)])
    if (!result.rowCount) return res.status(404).json({ error: 'Produto não encontrado.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, async error => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'A imagem não pode ultrapassar 8 MB.'
        : error.message || 'Não foi possível receber a imagem.'

      return res.status(400).json({ error: message })
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Escolhe uma imagem PNG, JPG, WEBP ou AVIF até 8 MB.',
      })
    }

    if (!CLOUDINARY_CONFIGURED) {
      return res.status(503).json({
        error: 'O armazenamento de imagens não está configurado.',
      })
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'creatine-lab/products',
            resource_type: 'image',
          },
          (uploadError, uploadedImage) => {
            if (uploadError) return reject(uploadError)
            resolve(uploadedImage)
          },
        )

        stream.end(req.file.buffer)
      })

      if (!result?.secure_url) {
        throw new Error('O Cloudinary não devolveu o endereço da imagem.')
      }

      return res.status(201).json({ path: result.secure_url })
    } catch (uploadError) {
      console.error(
        'Erro ao enviar imagem para o Cloudinary:',
        uploadError.message,
      )

      return res.status(502).json({
        error: 'Não foi possível guardar a imagem. Tenta novamente.',
      })
    }
  })
})
app.post('/api/orders', async (req, res) => {
  const customerName = String(req.body?.customerName ?? '').trim()
  const phone = String(req.body?.phone ?? '').trim()
  const address = String(req.body?.address ?? '').trim()
  const zone = String(req.body?.zone ?? '').trim()
  const payment = String(req.body?.payment ?? '').trim()
  const inputItems = req.body?.items

  if (!customerName || !phone || !address || !zone || !payment) {
    return res.status(400).json({ error: 'Preenche o nome, telefone, endereço, zona e pagamento.' })
  }
  if (customerName.length > 120 || phone.length > 60 || address.length > 500) {
    return res.status(400).json({ error: 'Um dos dados de contacto é demasiado longo.' })
  }
  if (!Array.isArray(inputItems) || inputItems.length < 1 || inputItems.length > 50) {
    return res.status(400).json({ error: 'O carrinho está vazio ou contém demasiados artigos.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const items = []
    let total = 0

    for (const input of inputItems) {
      const productId = Number(input?.productId)
      const quantity = Number(input?.quantity)
      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Um dos artigos do carrinho é inválido.' })
      }

      const result = await client.query(
        'SELECT * FROM products WHERE id=$1 AND published=TRUE FOR SHARE',
        [productId],
      )
      const row = result.rows[0]
      if (!row) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: 'Um dos produtos já não está disponível. Atualiza a loja e tenta novamente.',
        })
      }
      if (row.sold_out) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `${row.name} está esgotado.` })
      }

      const price = Number(row.price)
      items.push({ productId, name: row.name, price, quantity })
      total += price * quantity
    }

    const id = await nextId(client, 'orders')
    const timestamp = new Date()
    const prefix = `CL-${String(timestamp.getFullYear()).slice(-2)}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}`
    const orderNumber = `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

    await client.query(
      `INSERT INTO orders
       (id, order_number, customer_name, phone, address, zone, payment, total, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, orderNumber, customerName, phone, address, zone, payment, total, 'Recebida', timestamp],
    )

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, price, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, item.productId, item.name, item.price, item.quantity],
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ id, orderNumber, total })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Erro ao criar encomenda:', error)
    res.status(500).json({ error: 'Não foi possível guardar a encomenda.' })
  } finally { client.release() }
})

app.get('/api/admin/whatsapp', requireAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM whatsapp_numbers ORDER BY id')
    res.json(result.rows.map(row => ({
      id: Number(row.id),
      name: row.name || '',
      phone: row.phone,
      active: Boolean(row.active),
    })))
  } catch (error) { next(error) }
})

app.put('/api/admin/whatsapp', requireAdmin, async (req, res) => {
  const input = req.body?.whatsappNumbers
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
    return res.status(400).json({ error: 'A lista deve conter entre 1 e 20 números de WhatsApp.' })
  }

  const numbers = []
  const seenPhones = new Set()
  const seenIds = new Set()
  const current = await pool.query('SELECT id FROM whatsapp_numbers')
  let next = Math.max(0, ...current.rows.map(row => Number(row.id) || 0)) + 1

  for (const item of input) {
    const name = String(item?.name ?? '').trim()
    const phone = String(item?.phone ?? '').replace(/\D/g, '')
    const active = item?.active === true
    let id = Number(item?.id)

    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Cada número precisa de um nome até 80 caracteres.' })
    }
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: 'Cada número deve conter entre 8 e 15 algarismos.' })
    }
    if (seenPhones.has(phone)) {
      return res.status(400).json({ error: 'Não podes adicionar o mesmo número duas vezes.' })
    }
    if (!Number.isInteger(id) || id < 1 || seenIds.has(id)) {
      while (seenIds.has(next)) next++
      id = next++
    }

    seenPhones.add(phone)
    seenIds.add(id)
    numbers.push({ id, name, phone, active })
  }

  if (!numbers.some(item => item.active)) {
    return res.status(400).json({ error: 'Mantém pelo menos um número activo.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM whatsapp_numbers')
    for (const item of numbers) {
      await client.query(
        'INSERT INTO whatsapp_numbers (id, name, phone, active) VALUES ($1,$2,$3,$4)',
        [item.id, item.name, item.phone, item.active],
      )
    }
    await client.query('COMMIT')
    res.json(numbers)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(error)
    res.status(500).json({ error: 'Não foi possível guardar os números WhatsApp.' })
  } finally { client.release() }
})

app.get('/api/admin/orders', requireAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id FROM orders ORDER BY id DESC')
    const orders = []
    for (const row of result.rows) {
      orders.push(await getOrder(Number(row.id)))
    }
    res.json(orders.filter(Boolean))
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status ?? '')
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado de encomenda inválido.' })
    }
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING id',
      [status, Number(req.params.id)],
    )
    if (!result.rowCount) return res.status(404).json({ error: 'Encomenda não encontrada.' })
    res.json({ ok: true, status })
  } catch (error) { next(error) }
})
// Servir o site React em produção
app.use(express.static(path.join(ROOT, 'dist')))

// Redireccionar páginas do site para o React
app.use((req, res, next) => {
  if (
    req.method !== 'GET' ||
    req.path === '/api' ||
    req.path.startsWith('/api/') ||
    req.path === '/uploads' ||
    req.path.startsWith('/uploads/')
  ) {
    return next()
  }

  res.sendFile(path.join(ROOT, 'dist', 'index.html'), error => {
    if (error) next(error)
  })
})
app.use((error, _req, res, _next) => {
  console.error(error)
  if (res.headersSent) return
  res.status(500).json({ error: 'Ocorreu um erro interno. Verifica o terminal da API.' })
})

let server

async function shutdown() {
  if (server) {
    await new Promise(resolve => server.close(resolve))
  }
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
  await pool.query('SELECT 1')
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CREATINE LAB API Neon activa em http://127.0.0.1:${PORT}`)
    console.log('Base de dados: Neon PostgreSQL')
    console.log(`Imagens locais: ${UPLOAD_DIR}`)
    console.log(`Loja: http://127.0.0.1:5173 | Administração: http://127.0.0.1:5173/admin`)
  })
} catch (error) {
  console.error('Não foi possível ligar ao Neon:', error.message)
  await pool.end()
  process.exit(1)
}
