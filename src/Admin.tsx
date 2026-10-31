import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Dumbbell, Eye, EyeOff, ImagePlus, KeyRound, LockKeyhole, LogOut, MessageCircle, PackagePlus, Plus, RefreshCw, Save, Settings, ShieldCheck, ShoppingBag, Trash2, Upload, X } from 'lucide-react'

type Product = {
  id: number; name: string; description: string; price: number; category: string; image: string; tag: string; published: boolean; soldOut: boolean
}
type Order = {
  id: number; orderNumber: string; customerName: string; phone: string; address: string; zone: string; payment: string; items: { name: string; price: number; quantity: number }[]; total: number; status: string; createdAt: string
}
type WhatsAppNumber = { id: number; name: string; phone: string; active: boolean }

const emptyProduct: Omit<Product, 'id'> = { name: '', description: '', price: 0, category: 'Creatina', image: '', tag: '', published: true, soldOut: false }
const money = (value: number) => `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(value)} Kz`

async function request<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `O pedido falhou (HTTP ${response.status}).`)
  }
  return response.status === 204 ? null as T : response.json() as Promise<T>
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('creatinalab-admin-token') || '')
  const [password, setPassword] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [form, setForm] = useState<Omit<Product, 'id'>>(emptyProduct)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [tab, setTab] = useState<'products' | 'orders' | 'whatsapp' | 'settings'>('products')
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
const [showCurrentPassword, setShowCurrentPassword] = useState(false)
const [showNewPassword, setShowNewPassword] = useState(false)
const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  async function changeAdminPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setMessage('')
    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova palavra-passe.')
      return
    }
    setBusy(true)
    try {
      const result = await request<{ token: string }>('/api/admin/change-password', token, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmation: confirmPassword }),
      })
      setToken(result.token)
      sessionStorage.setItem('creatinalab-admin-token', result.token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Palavra-passe alterada com sucesso.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Não foi possível alterar a palavra-passe.')
    } finally {
      setBusy(false)
    }
  }
  async function loadProducts(currentToken = token) {
    try { setProducts(await request<Product[]>('/api/admin/products', currentToken)) }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível carregar os produtos.') }
  }
  async function loadOrders(currentToken = token) {
    try { setOrders(await request<Order[]>('/api/admin/orders', currentToken)) }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível carregar as encomendas.') }
  }
  async function loadWhatsApp(currentToken = token) {
    try {
      setWhatsappNumbers(await request<WhatsAppNumber[]>('/api/admin/whatsapp', currentToken))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Não foi possível carregar os números de WhatsApp.')
    }
  }

  async function saveWhatsApp() {
    setBusy(true); setError(''); setMessage('')
    try {
      await request<unknown>('/api/admin/whatsapp', token, {
        method: 'PUT',
        body: JSON.stringify({ whatsappNumbers }),
      })
      await loadWhatsApp()
      setMessage('Números de WhatsApp guardados com sucesso.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Não foi possível guardar os números de WhatsApp.')
    } finally {
      setBusy(false)
    }
  }

  async function refreshAll() {
    setLoading(true); setError('')
    await Promise.all([loadProducts(), loadOrders(), loadWhatsApp()])
    setLoading(false)
  }

  useEffect(() => { if (token) void refreshAll() }, [token])

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const body = await response.json() as { token?: string; error?: string }
      if (!response.ok || !body.token) throw new Error(body.error || 'Não foi possível iniciar sessão.')
      sessionStorage.setItem('creatinalab-admin-token', body.token)
      setToken(body.token); setPassword(''); setMessage('Sessão iniciada.')
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Falha no login.') }
    finally { setBusy(false) }
  }

  async function logout() {
    const currentToken = token

    try {
      if (currentToken) {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` }
        })
      }
    } catch {
      // Limpar a sessão local mesmo se o servidor estiver desligado.
    }

    sessionStorage.removeItem('creatinalab-admin-token')
    setToken('')
    setProducts([])
    setOrders([])
    setWhatsappNumbers([])
    setMessage('')
    setError('')
  }
  function startNew() { setEditingId(null); setForm({ ...emptyProduct }); setMessage(''); setError('') }
  function startEdit(product: Product) {
    setEditingId(product.id)
    setForm({ name: product.name, description: product.description, price: product.price, category: product.category, image: product.image, tag: product.tag, published: product.published, soldOut: product.soldOut })
    setMessage(''); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const saved = await request<Product>(editingId ? `/api/admin/products/${editingId}` : '/api/admin/products', token, {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(form),
      })
      setMessage(editingId ? 'Produto atualizado com sucesso.' : `Produto ${saved.name} adicionado com sucesso.`)
      startNew(); await loadProducts()
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível guardar o produto.') }
    finally { setBusy(false) }
  }

  async function uploadImage(file?: File) {
    if (!file) return
    setUploadBusy(true); setError(''); setMessage('')
    try {
      const data = new FormData(); data.append('image', file)
      const result = await request<{ path: string }>('/api/admin/upload', token, { method: 'POST', body: data })
      setForm((current) => ({ ...current, image: result.path }))
      setMessage('Fotografia enviada. Guarda o produto para confirmar.')
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível enviar a fotografia.') }
    finally { setUploadBusy(false) }
  }

  async function toggleProduct(product: Product, changes: Partial<Product>) {
    setError(''); setMessage('')
    try { await request(`/api/admin/products/${product.id}`, token, { method: 'PUT', body: JSON.stringify({ ...product, ...changes }) }); await loadProducts(); setMessage('Estado do produto atualizado.') }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível atualizar o produto.') }
  }
  async function deleteProduct(product: Product) {
    if (!window.confirm(`Queres eliminar permanentemente o produto “${product.name}”?`)) return
    setError(''); setMessage('')
    try { await request(`/api/admin/products/${product.id}`, token, { method: 'DELETE' }); setProducts((current) => current.filter((item) => item.id !== product.id)); setMessage(`Produto “${product.name}” eliminado.`); if (editingId === product.id) startNew() }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível eliminar o produto.') }
  }
  async function changeOrderStatus(order: Order, status: string) {
    setError(''); setMessage('')
    try { await request(`/api/admin/orders/${order.id}`, token, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadOrders(); setMessage(`Encomenda ${order.orderNumber} atualizada.`) }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível atualizar a encomenda.') }
  }

  if (!token) return <main className="admin-page admin-login-page"><form className="admin-login-card" onSubmit={login}><div className="admin-brand-mark"><ShieldCheck size={26} /></div><span className="admin-eyebrow">CREATINE LAB / GESTÃO PRIVADA</span><h1>PAINEL DE<br /><em>ADMINISTRAÇÃO.</em></h1><p>Acede ao painel para gerir os produtos e acompanhar as encomendas.</p><label>Palavra-passe de administrador<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="admin-alert admin-alert-error">{error}</p>}{message && <p className="admin-alert">{message}</p>}<button className="admin-primary" type="submit" disabled={busy}><LockKeyhole size={17} />{busy ? 'A verificar…' : 'ENTRAR NO PAINEL'}</button><a className="admin-back" href="/">← VOLTAR À LOJA</a></form></main>

  return <main className="admin-page"><header className="admin-topbar"><a href="/" className="admin-brand"><span className="admin-brand-mark"><Dumbbell size={20} /></span><span>CREATINE<span>LAB</span><small>PAINEL DE GESTÃO</small></span></a><div className="admin-top-actions"><a href="/" target="_blank" rel="noreferrer" className="admin-quiet-link">VER LOJA <ArrowLeft size={14} /></a><button className="admin-secondary" onClick={logout}><LogOut size={15} /> SAIR</button></div></header>
    <div className="admin-main"><div className="admin-page-heading"><div><span className="admin-eyebrow">ÁREA PRIVADA / CL-01</span><h1>GESTÃO <em>DA LOJA.</em></h1><p>Produtos, disponibilidade e encomendas num só lugar.</p></div><button className="admin-secondary" onClick={() => void refreshAll()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> ATUALIZAR</button></div>
      {(error || message) && <div className={`admin-alert ${error ? 'admin-alert-error' : ''}`}><span>{error || message}</span><button onClick={() => { setError(''); setMessage('') }} aria-label="Fechar mensagem"><X size={16} /></button></div>}
      <div className="admin-tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><ShoppingBag size={16} /> PRODUTOS <b>{products.length}</b></button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><PackagePlus size={16} /> ENCOMENDAS <b>{orders.length}</b></button><button className={tab === 'whatsapp' ? 'active' : ''} onClick={() => setTab('whatsapp')}><MessageCircle size={16} /> WHATSAPP <b>{whatsappNumbers.length}</b></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={16} /> DEFINIÇÕES</button></div>
      {tab === 'products' ? <div className="admin-columns"><section className="admin-panel"><div className="admin-panel-heading"><span className="admin-eyebrow">CATÁLOGO / {editingId ? 'EDIÇÃO' : 'NOVO ARTIGO'}</span><h2>{editingId ? 'EDITAR PRODUTO' : 'ADICIONAR PRODUTO'}</h2><p>Preenche os dados do artigo. Os campos com * são obrigatórios.</p></div><form className="admin-product-form" onSubmit={saveProduct}>
        <label className="admin-wide">Nome do produto *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} placeholder="Ex.: Creatina Monohidratada 300 g" /></label>
        <label>Preço (Kz) *<input type="number" min="0" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} required /></label>
        <label>Categoria *<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required>{['Creatina', 'Proteína', 'Pré-treino', 'Acessórios', 'Outros'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Etiqueta<input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Ex.: Novo produto" maxLength={50} /></label>
        <label className="admin-wide">Descrição<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1200} placeholder="Informação objetiva do produto, ingredientes e quantidade..." /></label>
        <div className="admin-wide admin-image-field"><label>Caminho da imagem<input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="Será preenchido ao enviar uma fotografia" /></label><label className="admin-upload-button"><input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = '' }} /><Upload size={16} /> {uploadBusy ? 'A ENVIAR…' : 'ENVIAR FOTOGRAFIA'}</label></div>
        {form.image && <div className="admin-image-preview admin-wide"><img src={form.image} alt="Pré-visualização do produto" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span>PRÉ-VISUALIZAÇÃO</span></div>}
        <label className="admin-check"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> PUBLICADO NA LOJA</label><label className="admin-check"><input type="checkbox" checked={form.soldOut} onChange={(event) => setForm({ ...form, soldOut: event.target.checked })} /> ESGOTADO</label>
        <div className="admin-form-actions admin-wide"><button className="admin-primary" type="submit" disabled={busy || uploadBusy}><Save size={16} /> {busy ? 'A GUARDAR…' : editingId ? 'GUARDAR ALTERAÇÕES' : 'ADICIONAR PRODUTO'}</button><button className="admin-secondary" type="button" onClick={startNew}><X size={15} /> LIMPAR</button></div>
      </form></section>
      <section className="admin-panel admin-products-panel"><div className="admin-panel-heading"><span className="admin-eyebrow">CATÁLOGO ATUAL</span><h2>PRODUTOS REGISTADOS <b>{products.length}</b></h2></div>{products.length === 0 ? <div className="admin-empty">Ainda não existem produtos. Adiciona o primeiro no formulário.</div> : <div className="admin-products-list">{products.map((product) => <article className="admin-product-row" key={product.id}><div className="admin-product-thumb">{product.image ? <img src={product.image} alt="" /> : <Dumbbell size={23} />}</div><div className="admin-product-info"><b>{product.name}</b><span>{money(product.price)} · {product.category}</span><small>{product.published ? 'Publicado' : 'Oculto'}{product.soldOut ? ' · Esgotado' : ''}</small></div><div className="admin-product-actions"><button title="Editar produto" onClick={() => startEdit(product)}><Save size={15} /></button><button title={product.published ? 'Ocultar produto' : 'Publicar produto'} onClick={() => void toggleProduct(product, { published: !product.published })}>{product.published ? <EyeOff size={15} /> : <Eye size={15} />}</button><button title={product.soldOut ? 'Marcar disponível' : 'Marcar esgotado'} onClick={() => void toggleProduct(product, { soldOut: !product.soldOut })}>{product.soldOut ? <Check size={15} /> : <X size={15} />}</button><button title="Eliminar produto" className="danger" onClick={() => void deleteProduct(product)}><Trash2 size={15} /></button></div></article>)}</div>}</section></div>
      : tab === 'orders' ? <section className="admin-panel admin-orders-panel"><div className="admin-panel-heading"><span className="admin-eyebrow">OPERAÇÕES / PEDIDOS</span><h2>ENCOMENDAS <b>{orders.length}</b></h2><p>Confirma os dados com o cliente antes de validar pagamento e entrega.</p></div>{orders.length === 0 ? <div className="admin-empty">Ainda não existem encomendas registadas.</div> : <div className="admin-orders-list">{orders.map((order) => <article className="admin-order-card" key={order.id}><div className="admin-order-head"><div><span className="admin-eyebrow">{order.orderNumber}</span><h3>{order.customerName}</h3><small>{new Date(order.createdAt).toLocaleString('pt-PT')}</small></div><strong>{money(order.total)}</strong></div><div className="admin-order-details"><span><b>Telefone:</b> {order.phone}</span><span><b>Endereço:</b> {order.address}</span><span><b>Zona:</b> {order.zone}</span><span><b>Pagamento:</b> {order.payment}</span></div><div className="admin-order-items">{order.items.map((item, index) => <span key={`${item.name}-${index}`}>{item.quantity} × {item.name} — {money(item.price * item.quantity)}</span>)}</div><div className="admin-order-status"><label>Estado<select value={order.status} onChange={(event) => void changeOrderStatus(order, event.target.value)}>{['Recebida', 'Em confirmação', 'Confirmada', 'Em preparação', 'Enviada', 'Concluída', 'Cancelada'].map((status) => <option key={status}>{status}</option>)}</select></label><span className={`status-pill status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></div></article>)}</div>}</section> : tab === 'whatsapp' ? <section className="admin-panel admin-whatsapp-panel">
        <div className="admin-panel-heading">
          <span className="admin-eyebrow">CONTACTOS / WHATSAPP</span>
          <h2>NÚMEROS DE WHATSAPP <b>{whatsappNumbers.length}</b></h2>
          <p>Gere os contactos utilizados pela loja. Mantém pelo menos um número activo.</p>
        </div>
        {whatsappNumbers.length === 0 ? <div className="admin-empty">Ainda não existem números. Adiciona o primeiro contacto.</div> : <div className="admin-whatsapp-list">{whatsappNumbers.map((number) => <article className="admin-whatsapp-row" key={number.id}>
          <label>Nome do contacto<input value={number.name} maxLength={80} onChange={(event) => setWhatsappNumbers((current) => current.map((item) => item.id === number.id ? { ...item, name: event.target.value } : item))} placeholder="Ex.: WhatsApp principal" /></label>
          <label>Número com indicativo<input value={number.phone} inputMode="tel" maxLength={20} onChange={(event) => setWhatsappNumbers((current) => current.map((item) => item.id === number.id ? { ...item, phone: event.target.value } : item))} placeholder="Ex.: 244923000000" /></label>
          <label className="admin-check"><input type="checkbox" checked={number.active} onChange={(event) => setWhatsappNumbers((current) => current.map((item) => item.id === number.id ? { ...item, active: event.target.checked } : item))} /> ACTIVO</label>
          <button type="button" className="admin-secondary" onClick={() => setWhatsappNumbers((current) => current.filter((item) => item.id !== number.id))}><Trash2 size={15} /> REMOVER</button>
        </article>)}</div>}
        <div className="admin-form-actions">
          <button type="button" className="admin-secondary" onClick={() => setWhatsappNumbers((current) => [...current, { id: Math.max(0, ...current.map((item) => item.id)) + 1, name: '', phone: '', active: true }])} disabled={whatsappNumbers.length >= 20}><Plus size={16} /> ADICIONAR NÚMERO</button>
          <button type="button" className="admin-primary" onClick={() => void saveWhatsApp()} disabled={busy || whatsappNumbers.length === 0 || !whatsappNumbers.some((item) => item.active)}><Save size={16} /> {busy ? 'A GUARDAR…' : 'GUARDAR NÚMEROS'}</button>
        </div>
      </section> : null}
      {tab === 'settings' && <section className="admin-panel admin-settings-panel">
        <div className="admin-panel-heading">
          <span className="admin-eyebrow">SEGURANÇA / CONTA</span>
          <h2><KeyRound size={22} /> ALTERAR PALAVRA-PASSE</h2>
          <p>Utiliza uma palavra-passe exclusiva, com pelo menos 6 caracteres. A alteração será guardada de forma protegida.</p>
        </div>
<form className="admin-password-form" onSubmit={changeAdminPassword}>
  <label>Palavra-passe actual
    <div className="admin-password-input-wrap">
      <input
        type={showCurrentPassword ? 'text' : 'password'}
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <button
        type="button"
        className="admin-password-toggle"
        onClick={() => setShowCurrentPassword((value) => !value)}
        aria-label="Mostrar ou esconder palavra-passe"
      >
        {showCurrentPassword ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  </label>

  <label>Nova palavra-passe
    <div className="admin-password-input-wrap">
      <input
        type={showNewPassword ? 'text' : 'password'}
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        minLength={16}
        maxLength={256}
        required
      />
      <button
        type="button"
        className="admin-password-toggle"
        onClick={() => setShowNewPassword((value) => !value)}
        aria-label="Mostrar ou esconder palavra-passe"
      >
        {showNewPassword ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  </label>

  <label>Confirmar nova palavra-passe
    <div className="admin-password-input-wrap">
      <input
        type={showConfirmPassword ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        minLength={16}
        maxLength={256}
        required
      />
      <button
        type="button"
        className="admin-password-toggle"
        onClick={() => setShowConfirmPassword((value) => !value)}
        aria-label="Mostrar ou esconder palavra-passe"
      >
        {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  </label>

  <div className="admin-password-note">
    <ShieldCheck size={17} /> A palavra-passe não é guardada em texto simples.
  </div>

  <div className="admin-form-actions">
    <button className="admin-primary" type="submit" disabled={busy}>
      <LockKeyhole size={16} /> {busy ? 'A ALTERAR…' : 'ALTERAR PALAVRA-PASSE'}
    </button>
  </div>
</form>
</section>}      <footer className="admin-footer"><span>CREATINE LAB / PAINEL PRIVADO</span><span>Os pagamentos e entregas devem ser confirmados manualmente antes da conclusão.</span></footer>
    </div>
  </main>
}
