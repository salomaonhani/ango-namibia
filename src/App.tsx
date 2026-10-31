import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Dumbbell,
  Flame,
  Menu,
  Minus,
  Plus,
  ShoppingBag,
  X,
  Zap,
} from 'lucide-react'

type Product = {
  id: number
  name: string
  description: string
  price: number
  category: string
  image: string
  tag: string
  published: boolean
  soldOut: boolean
}
type CartLine = { product: Product; quantity: number }
type WhatsAppNumber = {
  name: string
  phone: string
}


const categories = ['Todos', 'Creatina', 'Proteína', 'Pré-treino', 'Acessórios']
const money = (value: number) => `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(value)} Kz`

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `O pedido falhou (HTTP ${response.status}).`)
  }
  return response.status === 204 ? (null as T) : response.json() as Promise<T>
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [bannerImages, setBannerImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [zone, setZone] = useState('Luanda — a confirmar')
  const [payment, setPayment] = useState('Transferência / referência a combinar')
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderMessage, setOrderMessage] = useState('')
  const [faqOpen, setFaqOpen] = useState<number | null>(0)

  useEffect(() => {
    let active = true
    api<Product[]>('/api/products')
      .then((items) => { if (active) setProducts(items) })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os produtos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
useEffect(() => {
  let active = true

  api<WhatsAppNumber[]>('/api/whatsapp/active')
    .then((numbers) => {
      if (active) setWhatsappNumbers(numbers)
    })
    .catch((error) => {
      console.error('Não foi possível carregar os contactos WhatsApp:', error)
    })

  return () => {
    active = false
  }
}, [])



  useEffect(() => {
    let active = true;

    fetch('/products/manifest.json')
      .then((response) => response.ok
        ? response.json() as Promise<string[]>
        : [])
      .then((items) => {
        if (active && Array.isArray(items)) setBannerImages(items);
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'Todos' || product.category.toLowerCase() === category.toLowerCase()
    const needle = search.trim().toLowerCase()
    const matchesSearch = !needle || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(needle)
    return matchesCategory && matchesSearch
  }), [products, category, search])

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0)

  function normalizeImageName(value: string): string {
    return value.normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function bannerImageFor(product: Product, index: number): string {
    if (product.image?.trim()) return product.image;
    if (!bannerImages.length) return '';

    const terms = normalizeImageName(
      product.name + ' ' + product.category
    ).split(' ').filter((term) => term.length > 3);

    const categoryName = normalizeImageName(product.category);

    const match = bannerImages.find((url) => {
      const filename = normalizeImageName(
        (url.split('/').pop() || '').replace(/\\.[^.]+$/, '')
      );

      return (categoryName.length > 3 && filename.includes(categoryName))
        || terms.some((term) => filename.includes(term));
    });

    return match || bannerImages[index % bannerImages.length];
  }


  function addToCart(product: Product) {
    if (product.soldOut) return
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id)
      return existing
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }]
    })
    setCartOpen(true)
  }

  function updateQuantity(id: number, change: number) {
    setCart((current) => current
      .map((line) => line.product.id === id ? { ...line, quantity: line.quantity + change } : line)
      .filter((line) => line.quantity > 0))
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cart.length) return
    setOrderBusy(true)
    setOrderMessage('')
    try {
      const result = await api<{ id: number; orderNumber: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName, phone, address, zone, payment,
          items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        }),
      })
      setOrderMessage(`Encomenda ${result.orderNumber} registada. A equipa confirmará a disponibilidade, entrega e pagamento através do contacto indicado.`)
      setCart([])
      setCheckoutOpen(false)
      setCartOpen(false)
      setCustomerName('')
      setPhone('')
      setAddress('')
    } catch (error) {
      setOrderMessage(error instanceof Error ? error.message : 'Não foi possível registar a encomenda.')
    } finally {
      setOrderBusy(false)
    }
  }


  async function submitWhatsAppOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length || orderBusy) return;

    const whatsappPhone = '244940649001';

    const orderLines = cart.map((line) =>
      String(line.quantity) + ' x ' + line.product.name +
      ' — ' + money(line.product.price) + ' cada' +
      ' — Subtotal: ' + money(line.product.price * line.quantity)
    );

    const message = [
      'NOVA ENCOMENDA — ANGO NAMÍBIA',
      '',
      'Cliente: ' + customerName.trim(),
      'Telefone/WhatsApp do cliente: ' + phone.trim(),
      'Morada: ' + address.trim(),
      'Zona de entrega: ' + zone,
      'Pagamento pretendido: ' + payment,
      '',
      'PRODUTOS:',
      ...orderLines,
      '',
      'TOTAL DOS PRODUTOS: ' + money(subtotal),
      '',
      'Por favor, confirma a disponibilidade, a entrega e o pagamento.'
    ].join('\n');

    const whatsappUrl =
      'https://wa.me/' + whatsappPhone + '?text=' + encodeURIComponent(message);

    // Abre o WhatsApp durante a ação do cliente, para reduzir bloqueios de pop-ups.
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    setOrderBusy(true);
    setOrderMessage('');

    try {
      const result = await api<{ id: number; orderNumber: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          zone,
          payment,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity
          }))
        })
      });

      setOrderMessage(
        'Encomenda ' + result.orderNumber +
        ' registada na loja. No WhatsApp, confirma a mensagem e toca em Enviar.'
      );

      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      setCustomerName('');
      setPhone('');
      setAddress('');
    } catch (error) {
      setOrderMessage(
        'O WhatsApp foi aberto com a mensagem preparada, mas não foi possível ' +
        'confirmar o registo automático da encomenda. Verifica o pedido e envia a mensagem.'
      );
    } finally {
      setOrderBusy(false);
    }
  }

  return (
    <div className="site-shell">

      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Ango Namíbia — início">
          <span className="brand-mark"><Dumbbell size={22} strokeWidth={2.5} /></span>
          <span className="brand-name">ANGO <span>NAMÍBIA</span><small>SUPLEMENTAÇÃO DESPORTIVA</small></span>
        </a>
        <nav className={`main-nav ${mobileOpen ? 'is-open' : ''}`}>
          <a href="#loja" onClick={() => setMobileOpen(false)}>Loja</a>
          <a href="#qualidade" onClick={() => setMobileOpen(false)}>A nossa abordagem</a>
          <a href="#faq" onClick={() => setMobileOpen(false)}>Perguntas</a>
        </nav>
        <div className="header-actions">
          <a href="#loja" className="header-shop-link">Explorar produtos <ArrowDownRight size={16} /></a>
          <button className="cart-trigger" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho, ${cartCount} artigos`}><ShoppingBag size={19} /><span>CARRINHO</span><b>{cartCount}</b></button>
          <button className="mobile-menu-button" onClick={() => setMobileOpen((open) => !open)} aria-label="Abrir menu">{mobileOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <main>
        <section className="hero hero-video-section" id="inicio">
  <video className="hero-video-background" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
    <source src="/videos/hero-background.mp4" type="video/mp4" />
    <source src="/videos/hero-background.webm" type="video/webm" />
  </video>
  <div className="hero-video-overlay" aria-hidden="true" />
  <div className="hero-copy hero-video-copy">
    <div className="eyebrow"><span /> PERFORMANCE COM INTENÇÃO</div>
    <h1>ANGO<br /><em>NAMÍBIA</em></h1>
    <p className="hero-description">Suplementação desportiva com informação clara, escolhas simples e foco na consistência — treino após treino.</p>
    <div className="hero-actions-row">
      <a className="button button-lime" href="#loja">EXPLORAR PRODUTOS <ArrowRight size={18} /></a>
      <a className="text-link" href="#qualidade">Conhecer a abordagem <ArrowDownRight size={17} /></a>
    </div>
    <div className="hero-metrics"><div><b>01</b><span>ESCOLHE</span></div><i /><div><b>02</b><span>CONSULTA</span></div><i /><div><b>03</b><span>CONSISTÊNCIA</span></div></div>
  </div>
</section>

        <section className='ango-values-band' aria-label='Valores ANGO NAMÍBIA'><article className='ango-value'><span className='ango-value-number'>01</span><div><h3>ESCOLHAS INFORMADAS</h3><p>Conhece o produto antes de escolher.</p></div></article><article className='ango-value'><span className='ango-value-number'>02</span><div><h3>QUALIDADE E CLAREZA</h3><p>Consulta as características dos produtos.</p></div></article><article className='ango-value'><span className='ango-value-number'>03</span><div><h3>FOCO NA CONSISTÊNCIA</h3><p>Constrói uma rotina consciente.</p></div></article></section>

        <section className="shop-section section-wrap" id="loja">
          <div className="section-topline"><span className="eyebrow"><span /> CATÁLOGO</span><span className="section-index">01 / PRODUTOS</span></div>
          <div className="section-heading"><div><h2>ESCOLHE O TEU<br /><em>PRÓXIMO PASSO.</em></h2></div><p>Explora os produtos disponíveis. Consulta a descrição, a quantidade e o preço antes de adicionares ao carrinho.</p></div>
          <div className="shop-controls"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar produtos..." aria-label="Pesquisar produtos" /><kbd>⌘ K</kbd></label></div>
          {loading ? <div className="notice-panel"><span className="loader-dot" /> A carregar produtos...</div> : loadError ? <div className="notice-panel error-panel"><CircleHelp size={21} /><div><b>Não foi possível carregar os produtos.</b><p>{loadError} Confirma que a API está ativa no terminal.</p></div></div> : filteredProducts.length === 0 ? <div className="notice-panel">Ainda não existem produtos nesta categoria. Adiciona produtos no <a href="/admin">painel de administração</a>.</div>
: <div className="product-banners-grid">
  {filteredProducts.map((product, index) => {
    const image = bannerImageFor(product, index);
    const isExpanded = expandedProductId === product.id;

    return (
      <article
        className={isExpanded ? 'product-banner is-expanded' : 'product-banner'}
        key={product.id}
      >
        <button
          type="button"
          className="product-banner-trigger"
          onClick={() => setExpandedProductId(
            (current) => current === product.id ? null : product.id
          )}
          aria-expanded={isExpanded}
        >
          <span className="product-banner-media">
            {image
              ? <img src={image} alt={product.name} loading="lazy" />
              : <span className="product-banner-placeholder">
                  <Dumbbell size={35} />
                  <b>{product.category.toUpperCase()}</b>
                  <small>ANGO NAMÍBIA</small>
                </span>
            }
            <span className="product-banner-shade" />
          </span>

          <span className="product-banner-top">
            <span className="product-banner-category">{product.category}</span>
            {product.tag && (
              <span className="product-banner-tag">{product.tag}</span>
            )}
          </span>

          <span className="product-banner-copy">
            <span className="product-banner-index">
              {String(index + 1).padStart(2, '0')} / ANGO NAMÍBIA
            </span>
            <strong>{product.name}</strong>
            <span className="product-banner-discover">
              {isExpanded ? 'OCULTAR DETALHES' : 'VER DESCRIÇÃO E PREÇO'}
              <ChevronDown
                size={17}
                className={isExpanded ? 'rotated' : ''}
              />
            </span>
          </span>

          {product.soldOut && (
            <span className="product-banner-soldout">ESGOTADO</span>
          )}
        </button>

        {isExpanded && (
          <div className="product-banner-details">
            <p>{product.description}</p>

            <div className="product-banner-purchase">
              <div className="product-banner-price">
                <small>PREÇO</small>
                <strong>{money(product.price)}</strong>
              </div>

              <button
                type="button"
                className="product-add-cta"
                onClick={() => addToCart(product)}
                disabled={product.soldOut}
              >
                {product.soldOut
                  ? 'ESGOTADO'
                  : <>ADICIONAR AO CARRINHO <Plus size={17} /></>
                }
              </button>
            </div>
          </div>
        )}
      </article>
    );
  })}
</div>}
          <div className="shop-bottom-note"><span>{filteredProducts.length} PRODUTO(S)</span><span>PREÇOS EM KWANZAS (KZ)</span><a href="/admin">GERIR CATÁLOGO <ArrowRight size={14} /></a></div>
        </section>

        <section className="manifesto" id="qualidade"><div className="manifesto-pattern" /><div className="manifesto-number">CL<span> / 02</span></div><div className="manifesto-content"><span className="eyebrow"><span /> A NOSSA ABORDAGEM</span><h2>MENOS RUÍDO.<br /><em>MAIS INTENÇÃO.</em></h2><p>A suplementação deve fazer parte de uma rotina bem pensada — não substituir uma alimentação equilibrada, treino adequado, hidratação e descanso. Consulta sempre o rótulo e escolhe informação em que confias.</p><a className="button button-outline" href="#faq">LER PERGUNTAS FREQUENTES <ArrowRight size={17} /></a></div><div className="manifesto-graphic"><div className="graphic-circle circle-a" /><div className="graphic-circle circle-b" />
<div className="manifesto-emblem" aria-label="Símbolo ANGO NAMÍBIA">
  <span className="emblem-ring emblem-ring-one" />
  <span className="emblem-ring emblem-ring-two" />
  <span className="emblem-ring emblem-ring-three" />
  <span className="emblem-core">AN</span>
  <span className="emblem-caption">EQUILÍBRIO · ROTINA · PROGRESSO</span>
</div><div className="graphic-word">CONSISTÊNCIA</div></div></section>

        <section className="process-section section-wrap"><div className="section-topline"><span className="eyebrow"><span /> SIMPLES POR DESIGN</span><span className="section-index">02 / COMO COMPRAR</span></div><div className="process-grid"><article><b>01</b><Zap size={23} /><h3>DESCOBRE</h3><p>Explora o catálogo e compara as informações disponíveis em cada produto.</p></article><article><b>02</b><ShoppingBag size={23} /><h3>ADICIONA</h3><p>Escolhe os artigos e revê as quantidades e o subtotal no carrinho.</p></article><article><b>03</b><Check size={23} /><h3>CONFIRMA</h3><p>Envia os teus dados. A equipa confirma disponibilidade, entrega e forma de pagamento.</p></article></div></section>

        <section className="faq-section section-wrap" id="faq"><div className="section-topline"><span className="eyebrow"><span /> PERGUNTAS FREQUENTES</span><span className="section-index">03 / INFORMAÇÃO</span></div><div className="faq-layout"><h2>ANTES DE<br /><em>ESCOLHER.</em></h2><div className="faq-list">{[
          ['Como escolho um suplemento?', 'Consulta o rótulo, os ingredientes, a dose indicada e as informações do fabricante. Se tiveres dúvidas sobre a tua saúde ou medicação, fala com um profissional de saúde.'],
          ['A creatina substitui a alimentação ou o treino?', 'Não. Suplementos não substituem uma alimentação variada, hidratação, descanso e um plano de treino adequado.'],
          ['Como funcionam a entrega e o pagamento?', 'Depois de enviares a encomenda, a equipa confirma a disponibilidade, a zona de entrega e a forma de pagamento antes de concluir o pedido.'],
          ['Onde consulto os ingredientes e a quantidade?', 'Cada produto deve apresentar a sua descrição e informação disponível. Consulta sempre o rótulo original do fabricante para obter os dados completos.'],
        ].map(([question, answer], index) => <div className={`faq-item ${faqOpen === index ? 'open' : ''}`} key={question}><button onClick={() => setFaqOpen(faqOpen === index ? null : index)} aria-expanded={faqOpen === index}><span>{question}</span><Plus size={18} /></button>{faqOpen === index && <p>{answer}</p>}</div>)}</div></div></section>
      </main>

      <footer className="site-footer"><a className="brand footer-brand" href="#inicio"><span className="brand-mark"><Dumbbell size={21} /></span><span className="brand-name">ANGO <span>NAMÍBIA</span><small>SUPLEMENTAÇÃO DESPORTIVA</small></span></a><span className="footer-disclaimer">Informação geral. Consulta os rótulos e procura orientação profissional quando necessário.</span><span className="footer-copy">© {new Date().getFullYear()} ANGO NAMÍBIA · SUPLEMENTAÇÃO DESPORTIVA</span></footer>

      {cartOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false) }}><aside className="cart-drawer" aria-label="Carrinho"><div className="drawer-head"><div><span className="eyebrow">A TUA SELEÇÃO</span><h2>CARRINHO <em>({cartCount})</em></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho"><X /></button></div>{cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={35} /><h3>AINDA VAZIO.</h3><p>Explora os produtos e adiciona os artigos que procuras.</p><button className="button button-lime" onClick={() => setCartOpen(false)}>VOLTAR À LOJA <ArrowRight size={16} /></button></div> : <><div className="cart-lines">{cart.map((line) => <article className="cart-line" key={line.product.id}><div className="cart-line-image">{line.product.image ? <img src={line.product.image} alt="" /> : <Dumbbell size={28} />}</div><div className="cart-line-info"><b>{line.product.name}</b><span>{money(line.product.price)}</span><div className="quantity-control"><button onClick={() => updateQuantity(line.product.id, -1)} aria-label="Diminuir"><Minus size={13} /></button><span>{line.quantity}</span><button onClick={() => updateQuantity(line.product.id, 1)} aria-label="Aumentar"><Plus size={13} /></button></div></div><strong>{money(line.product.price * line.quantity)}</strong></article>)}</div><div className="cart-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><p>Entrega e pagamento serão confirmados pela equipa antes de finalizar a encomenda.</p><button className="button button-lime checkout-button" onClick={() => { setCheckoutOpen(true); setCartOpen(false) }}>CONTINUAR PARA ENCOMENDA <ArrowRight size={17} /></button></div></>}</aside></div>}

      {checkoutOpen && <div className="overlay checkout-overlay"><section className="checkout-modal"><div className="drawer-head"><div><span className="eyebrow">ÚLTIMO PASSO</span><h2>FAZER <em>ENCOMENDA.</em></h2></div><button className="icon-button" onClick={() => setCheckoutOpen(false)} aria-label="Fechar"><X /></button></div><p className="checkout-intro">Preenche os dados para registar o pedido. A equipa confirmará contigo os detalhes antes do pagamento.</p><form className="checkout-form" onSubmit={submitWhatsAppOrder}><label>Nome completo<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" /></label><label>Telefone / WhatsApp<input required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="Ex.: 9xx xxx xxx" /></label><label className="checkout-wide">Endereço ou ponto de referência<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua, bairro ou referência" /></label><label>Zona de entrega<select value={zone} onChange={(event) => setZone(event.target.value)}><option>Luanda — a confirmar</option><option>Outra província — a confirmar</option><option>Levantamento — a combinar</option></select></label><label>Pagamento<select value={payment} onChange={(event) => setPayment(event.target.value)}><option>Transferência / referência a combinar</option><option>Pagamento na entrega — sujeito a confirmação</option></select></label><div className="checkout-total checkout-wide"><span>Subtotal dos produtos</span><strong>{money(subtotal)}</strong></div>{orderMessage && <p className="form-message checkout-wide">{orderMessage}</p>}<div className="checkout-actions checkout-wide"><button type="button" className="button button-outline" onClick={() => { setCheckoutOpen(false); setCartOpen(true) }}>VOLTAR AO CARRINHO</button><button type="submit" className="button button-lime" disabled={orderBusy}>{orderBusy ? 'A PREPARAR…' : 'ENVIAR PELO WHATSAPP'} <ArrowRight size={17} /></button></div></form></section></div>}
      {orderMessage && !checkoutOpen && <div className="toast-message"><Check size={18} /><span>{orderMessage}</span><button onClick={() => setOrderMessage('')} aria-label="Fechar mensagem"><X size={16} /></button></div>}
    </div>
  )
}
