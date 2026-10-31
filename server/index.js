
import 'dotenv/config'
import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'creatina-data.json')
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')
const PORT = Number(process.env.PORT || 3001)
const app = express()

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const initialProducts = [
  {
    name: 'Creatina Monohidratada',
    description: 'Creatina monohidratada. Consulta o rótulo do fabricante para composição, dose e instruções de utilização.',
    price: 12500,
    category: 'Creatina',
    image: '',
    tag: 'MAIS PROCURADO',
  },
  {
    name: 'Whey Protein',
    description: 'Proteína em pó. Confirma os ingredientes, alergénios e informação nutricional na embalagem.',
    price: 18500,
    category: 'Proteína',
    image: '',
    tag: 'PROTEÍNA',
  },
  {
    name: 'Pré-treino',
    description: 'Suplemento pré-treino. Verifica a composição e a quantidade de cafeína no rótulo antes de utilizar.',
    price: 16000,
    category: 'Pré-treino',
    image: '',
    tag: 'FOCO',
  },
  {
    name: 'Shaker desportivo',
    description: 'Garrafa misturadora reutilizável para preparar bebidas desportivas.',
    price: 3500,
    category: 'Acessórios',
    image: '',
    tag: '',
  },
]

// ============================================================
// ARMAZENAMENTO
// ============================================================

function loadStore() {
  if (!fs.existsSync(DATA_FILE)) {
    const newStore = {
      nextProductId: initialProducts.length + 1,
      nextOrderId: 1,

      whatsappNumbers: [
        {
          id: 1,
          name: 'Número principal',
          phone: '244940649001',
          active: true,
        },
      ],

      products: initialProducts.map((item, index) => ({
        id: index + 1,
        ...item,
        published: true,
        soldOut: false,
      })),

      orders: [],
    }

    writeStore(newStore)

    console.log('Catálogo de demonstração criado.')
    return newStore
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))

    if (
      !parsed ||
      !Array.isArray(parsed.products) ||
      !Array.isArray(parsed.orders)
    ) {
      throw new Error('Estrutura de dados inesperada.')
    }

    return {
      nextProductId:
        Number(parsed.nextProductId) ||
        Math.max(0, ...parsed.products.map((p) => Number(p.id) || 0)) + 1,

      nextOrderId:
        Number(parsed.nextOrderId) ||
        Math.max(0, ...parsed.orders.map((o) => Number(o.id) || 0)) + 1,

      products: parsed.products,
      orders: parsed.orders,

      whatsappNumbers: Array.isArray(parsed.whatsappNumbers)
        ? parsed.whatsappNumbers
        : [
            {
              id: 1,
              name: 'Número principal',
              phone: '244940649001',
              active: true,
            },
          ],
    }
  } catch (error) {
    console.error(
      `Não foi possível ler ${DATA_FILE}. Não foi substituído para evitar perda de dados.`,
      error
    )
    process.exit(1)
  }
}

function writeStore(nextStore = store) {
  const temporaryFile = `${DATA_FILE}.tmp`
  fs.writeFileSync(
    temporaryFile,
    `${JSON.stringify(nextStore, null, 2)}\n`,
    'utf8'
  )
  fs.renameSync(temporaryFile, DATA_FILE)
}

const store = loadStore()

// ============================================================
// CONFIGURAÇÃO E SEGURANÇA
// ============================================================

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

if (
  IS_PRODUCTION &&
  (
    !CONFIGURED_ADMIN_PASSWORD ||
    CONFIGURED_ADMIN_PASSWORD.length < 16 ||
    CONFIGURED_ADMIN_PASSWORD === 'CreatinaAdmin2026!'
  )
) {
  throw new Error('Define CREATINA_ADMIN_PASSWORD com pelo menos 16 caracteres fortes antes de publicar.')
}

let ADMIN_PASSWORD = CONFIGURED_ADMIN_PASSWORD || 'CreatinaAdmin2026!'

if (!CONFIGURED_ADMIN_PASSWORD) {
  console.warn('AVISO: estás a utilizar a palavra-passe temporária. Configura o ficheiro .env.')
}

const sessions = new Map()
const loginAttempts = new Map()

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000

const validStatuses = [
  'Recebida',
  'Em confirmação',
  'Confirmada',
  'Em preparação',
  'Enviada',
  'Concluída',
  'Cancelada',
]

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function publicProduct(row) {
  return {
    ...row,
    published: Boolean(row.published),
    soldOut: Boolean(row.soldOut),
  }
}

function requireAdmin(req, res, next) {
  const now = Date.now()

  for (const [sessionToken, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(sessionToken)
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const expiresAt = token ? sessions.get(token) : null

  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token)

    return res.status(401).json({
      error: 'Sessão inválida ou expirada. Inicia sessão novamente.',
    })
  }

  next()
}

function productInput(body, old = {}) {
  const name = String(body?.name ?? old.name ?? '').trim()
  const description = String(body?.description ?? old.description ?? '').trim()
  const price = Number(body?.price ?? old.price)
  const category = String(body?.category ?? old.category ?? '').trim()
  const image = String(body?.image ?? old.image ?? '').trim()
  const tag = String(body?.tag ?? old.tag ?? '').trim()

  const published =
    body?.published === undefined
      ? Boolean(old.published ?? true)
      : body.published === true

  const soldOut =
    body?.soldOut === undefined
      ? Boolean(old.soldOut ?? false)
      : body.soldOut === true

  if (!name) throw new Error('Preenche o nome do produto.')
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Indica um preço válido em Kz.')
  }
  if (!category) throw new Error('Escolhe uma categoria.')

  if (
    name.length > 120 ||
    description.length > 1200 ||
    category.length > 60 ||
    image.length > 500 ||
    tag.length > 50
  ) {
    throw new Error('Um dos campos excede o limite permitido.')
  }

  return { name, description, price, category, image, tag, published, soldOut }
}

// ============================================================
// UPLOAD DE IMAGENS
// ============================================================

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),

    filename: (_req, file, callback) => {
      const extByType = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/avif': '.avif',
      }

      callback(
        null,
        `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extByType[file.mimetype] || '.img'}`
      )
    },
  }),

  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    callback(null, allowedMimeTypes.has(file.mimetype))
  },
})

// ============================================================
// ROTAS PÚBLICAS
// ============================================================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    app: 'CREATINE LAB',
    database: 'json-file',
  })
})

app.get('/api/products', (_req, res) => {
  res.json(
    store.products
      .filter((product) => product.published)
      .sort((a, b) => b.id - a.id)
      .map(publicProduct)
  )
})

// Contactos WhatsApp ativos para a loja.
app.get('/api/whatsapp/active', (_req, res) => {
  const activeNumbers = (store.whatsappNumbers || [])
    .filter((item) => item.active === true)
    .map(({ name, phone }) => ({ name, phone }))

  res.json(activeNumbers)
})

// ============================================================
// AUTENTICAÇÃO ADMINISTRATIVA
// ============================================================

app.post('/api/admin/login', (req, res) => {
  const now = Date.now()
  const ip = req.ip || req.socket.remoteAddress || 'unknown'

  for (const [key, entry] of loginAttempts) {
    if (
      entry.blockedUntil < now &&
      now - entry.windowStartedAt > LOGIN_WINDOW_MS
    ) {
      loginAttempts.delete(key)
    }
  }

  let entry = loginAttempts.get(ip)

  if (entry?.blockedUntil > now) {
    res.setHeader(
      'Retry-After',
      String(Math.ceil((entry.blockedUntil - now) / 1000))
    )

    return res.status(429).json({
      error: 'Demasiadas tentativas. Aguarda antes de tentar novamente.',
    })
  }

  if (!entry || now - entry.windowStartedAt > LOGIN_WINDOW_MS) {
    entry = {
      count: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    }

    loginAttempts.set(ip, entry)
  }

  const password = String(req.body?.password ?? '')
  const supplied = Buffer.from(password)
  const expected = Buffer.from(ADMIN_PASSWORD)

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    entry.count += 1

    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      entry.blockedUntil = now + LOGIN_LOCKOUT_MS

      res.setHeader('Retry-After', String(LOGIN_LOCKOUT_MS / 1000))

      return res.status(429).json({
        error: 'Demasiadas tentativas. Acesso bloqueado temporariamente por 15 minutos.',
      })
    }

    return res.status(401).json({
      error: 'Credenciais inválidas.',
    })
  }

  loginAttempts.delete(ip)

  const token = crypto.randomBytes(32).toString('hex')

  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)

  res.json({
    token,
    expiresIn: 8 * 60 * 60,
  })
})

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')

  if (token) sessions.delete(token)

  res.status(204).end()
})

// As rotas administrativas seguintes exigem sessão válida.
app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next()
  return requireAdmin(req, res, next)
})

// ============================================================
// ALTERAR PALAVRA-PASSE DO ADMINISTRADOR
// ============================================================

app.post('/api/admin/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmation } = req.body || {}

    const current = Buffer.from(String(currentPassword ?? ''))
    const expected = Buffer.from(ADMIN_PASSWORD)

    if (
      current.length !== expected.length ||
      !crypto.timingSafeEqual(current, expected)
    ) {
      return res.status(400).json({ error: 'A palavra-passe actual está incorrecta.' })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 16) {
      return res.status(400).json({ error: 'A nova palavra-passe deve ter pelo menos 16 caracteres.' })
    }

    if (newPassword !== confirmation) {
      return res.status(400).json({ error: 'As palavras-passe não coincidem.' })
    }

    if (newPassword === ADMIN_PASSWORD) {
      return res.status(400).json({ error: 'Escolhe uma palavra-passe diferente da actual.' })
    }

    const envPath = path.join(ROOT, '.env')
    let envContent = await fs.promises.readFile(envPath, 'utf8')

    const escapedPassword = newPassword.replace(/\\/g, '\\\\').replace(/\r?\n/g, '')
    const envLine = `CREATINA_ADMIN_PASSWORD=${escapedPassword}`
    const pattern = /^CREATINA_ADMIN_PASSWORD=.*$/m

    if (pattern.test(envContent)) {
      envContent = envContent.replace(pattern, envLine)
    } else {
      envContent = `${envContent.trimEnd()}\n${envLine}\n`
    }

    const tempPath = `${envPath}.tmp`
    await fs.promises.writeFile(tempPath, envContent, { mode: 0o600 })
    await fs.promises.rename(tempPath, envPath)

    ADMIN_PASSWORD = newPassword
    process.env.CREATINA_ADMIN_PASSWORD = newPassword

    sessions.clear()

    const token = crypto.randomBytes(32).toString('hex')
    sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)

    return res.json({ token })
  } catch (error) {
    console.error('Erro ao alterar palavra-passe:', error.message)
    return res.status(500).json({ error: 'Não foi possível alterar a palavra-passe.' })
  }
})
// ============================================================
// PRODUTOS - ADMIN
// ============================================================

app.get('/api/admin/products', (_req, res) => {
  res.json(
    [...store.products]
      .sort((a, b) => b.id - a.id)
      .map(publicProduct)
  )
})

app.post('/api/admin/products', (req, res) => {
  try {
    const product = {
      id: store.nextProductId++,
      ...productInput(req.body),
      createdAt: new Date().toISOString(),
    }

    store.products.push(product)
    writeStore()

    res.status(201).json(publicProduct(product))
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error
        ? error.message
        : 'Dados do produto inválidos.',
    })
  }
})

app.put('/api/admin/products/:id', (req, res) => {
  const id = Number(req.params.id)

  const index = store.products.findIndex((product) => product.id === id)

  if (index < 0) {
    return res.status(404).json({ error: 'Produto não encontrado.' })
  }

  try {
    store.products[index] = {
      ...store.products[index],
      ...productInput(req.body, store.products[index]),
    }

    writeStore()

    res.json(publicProduct(store.products[index]))
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error
        ? error.message
        : 'Dados do produto inválidos.',
    })
  }
})

app.delete('/api/admin/products/:id', (req, res) => {
  const index = store.products.findIndex(
    (product) => product.id === Number(req.params.id)
  )

  if (index < 0) {
    return res.status(404).json({ error: 'Produto não encontrado.' })
  }

  store.products.splice(index, 1)
  writeStore()

  res.status(204).end()
})

// ============================================================
// UPLOAD - ADMIN
// ============================================================

app.post('/api/admin/upload', (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'A imagem não pode ultrapassar 8 MB.'
          : error.message || 'Não foi possível receber a imagem.'

      return res.status(400).json({ error: message })
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Escolhe uma imagem PNG, JPG, WEBP ou AVIF até 8 MB.',
      })
    }

    res.status(201).json({
      path: `/uploads/${req.file.filename}`,
    })
  })
})

// ============================================================
// WHATSAPP - ADMIN
// ============================================================

app.get('/api/admin/whatsapp', (_req, res) => {
  res.json(store.whatsappNumbers || [])
})

app.put('/api/admin/whatsapp', (req, res) => {
  const numbers = req.body?.numbers

  if (!Array.isArray(numbers) || numbers.length < 1 || numbers.length > 20) {
    return res.status(400).json({
      error: 'Adiciona entre 1 e 20 números WhatsApp.',
    })
  }

  const cleaned = []
  const usedPhones = new Set()

  for (let index = 0; index < numbers.length; index++) {
    const item = numbers[index]
    const name = String(item?.name ?? '').trim()
    const phone = String(item?.phone ?? '').replace(/\D/g, '')
    const active = item?.active === true

    if (!name || name.length > 80) {
      return res.status(400).json({
        error: 'Cada número precisa de um nome válido.',
      })
    }

    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({
        error: `O número ${name} não é válido.`,
      })
    }

    if (usedPhones.has(phone)) {
      return res.status(400).json({
        error: 'Não podes adicionar números repetidos.',
      })
    }

    usedPhones.add(phone)

    cleaned.push({
      id: Number(item?.id) || index + 1,
      name,
      phone,
      active,
    })
  }

  if (!cleaned.some((item) => item.active)) {
    return res.status(400).json({
      error: 'Mantém pelo menos um número WhatsApp ativo.',
    })
  }

  store.whatsappNumbers = cleaned
  writeStore()

  res.json(store.whatsappNumbers)
})

// ============================================================
// ENCOMENDAS
// ============================================================

app.post('/api/orders', (req, res) => {
  const customerName = String(req.body?.customerName ?? '').trim()
  const phone = String(req.body?.phone ?? '').trim()
  const address = String(req.body?.address ?? '').trim()
  const zone = String(req.body?.zone ?? '').trim()
  const payment = String(req.body?.payment ?? '').trim()
  const inputItems = req.body?.items

  if (!customerName || !phone || !address || !zone || !payment) {
    return res.status(400).json({
      error: 'Preenche o nome, telefone, endereço, zona e pagamento.',
    })
  }

  if (
    customerName.length > 120 ||
    phone.length > 60 ||
    address.length > 500
  ) {
    return res.status(400).json({
      error: 'Um dos dados de contacto é demasiado longo.',
    })
  }

  if (
    !Array.isArray(inputItems) ||
    inputItems.length < 1 ||
    inputItems.length > 50
  ) {
    return res.status(400).json({
      error: 'O carrinho está vazio ou contém demasiados artigos.',
    })
  }

  const items = []
  let total = 0

  for (const input of inputItems) {
    const productId = Number(input?.productId)
    const quantity = Number(input?.quantity)

    if (
      !Number.isInteger(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return res.status(400).json({
        error: 'Um dos artigos do carrinho é inválido.',
      })
    }

    const product = store.products.find((item) => item.id === productId)

    if (!product || !product.published) {
      return res.status(400).json({
        error: 'Um dos produtos já não está disponível. Atualiza a loja e tenta novamente.',
      })
    }

    if (product.soldOut) {
      return res.status(400).json({
        error: `${product.name} está esgotado.`,
      })
    }

    items.push({
      productId,
      name: product.name,
      price: Number(product.price),
      quantity,
    })

    total += Number(product.price) * quantity
  }

  const timestamp = new Date()

  const prefix =
    `CL-${String(timestamp.getFullYear()).slice(-2)}` +
    `${String(timestamp.getMonth() + 1).padStart(2, '0')}` +
    `${String(timestamp.getDate()).padStart(2, '0')}`

  const orderNumber =
    `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

  const order = {
    id: store.nextOrderId++,
    orderNumber,
    customerName,
    phone,
    address,
    zone,
    payment,
    items,
    total,
    status: 'Recebida',
    createdAt: timestamp.toISOString(),
  }

  store.orders.push(order)
  writeStore()

  res.status(201).json({
    id: order.id,
    orderNumber,
    total,
  })
})

// ============================================================
// ENCOMENDAS - ADMIN

app.get('/api/admin/orders', (_req, res) => {
  const orders = [...store.orders].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  res.json(orders)
})

app.patch('/api/admin/orders/:id', (req, res) => {
  const order = store.orders.find(item => item.id === Number(req.params.id))
  if (!order) return res.status(404).json({ error: 'Encomenda não encontrada.' })
  const status = String(req.body?.status ?? '').trim()
  const allowed = ['Recebida', 'Em preparação', 'Enviada', 'Entregue', 'Cancelada']
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido.' })
  order.status = status
  writeStore()
  res.json(order)
})

// ARRANQUE DO SERVIDOR
// ============================================================

app.listen(PORT, '127.0.0.1', () => {
  console.log(`CREATINE LAB API disponível em http://127.0.0.1:${PORT}`)
})
