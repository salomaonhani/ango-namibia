# CREATINA LAB — Loja de suplementos

Aplicação React, TypeScript e Vite, com API Express, base de dados Neon PostgreSQL e armazenamento de imagens Cloudinary.

## Arquitectura

- Frontend: React + Vite, preparado para Vercel.
- API: `server/index-neon.js`, preparada para Render.
- Base de dados: Neon PostgreSQL.
- Imagens carregadas: Cloudinary.
- Administração: `/admin`.
- API local: porta `3002`.

## Requisitos

- Node.js compatível com a versão definida no projecto.
- npm.
- Variáveis de ambiente configuradas para a API.

## Desenvolvimento local

Na pasta do projecto, instala as dependências:

```powershell
npm.cmd install
```

Configura um ficheiro `.env` com as variáveis necessárias. Usa `.env.example` como referência e nunca publiques credenciais.

Para iniciar a API Neon:

```powershell
npm.cmd run start:neon
```

A API local fica disponível em `http://127.0.0.1:3002`, incluindo o estado em `/api/health`.

Para iniciar o frontend, abre outro terminal e executa o comando de desenvolvimento definido em `package.json`. O Vite está configurado para encaminhar `/api` para a API local na porta 3002.

## Compilação

```powershell
npm.cmd run build
```

Os ficheiros de produção do frontend são gerados na pasta `dist`.

## Publicação

### API no Render

O ficheiro `render.yaml` define o serviço da API e o comando `npm run start:neon`.

Configura no Render estas variáveis de ambiente, usando os valores reais nos respectivos campos privados:

- `DATABASE_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CREATINA_ADMIN_PASSWORD`
- `NODE_ENV=production`

Define uma palavra-passe de administrador forte, com pelo menos 16 caracteres, e confirma que a API fica saudável em `/api/health`.

### Frontend na Vercel

Publica o frontend na Vercel depois de criares o serviço da API no Render. A configuração de encaminhamento `/api` deverá apontar para o URL público real do serviço Render. Não uses endereços `127.0.0.1` na publicação.

### Base de dados e imagens

A base de dados Neon e o Cloudinary devem estar configurados e acessíveis pelo serviço Render. Não publiques ficheiros `.env`, tokens, credenciais, dados de sessão ou imagens da pasta local `public/uploads`.

## Segurança e operação

- Utiliza HTTPS.
- Mantém as credenciais nas variáveis de ambiente do alojamento.
- Prepara cópias de segurança da base de dados.
- Testa criação e consulta de produtos, uploads, encomendas e acesso administrativo.
- Confirma as obrigações legais, fiscais, de privacidade, entrega e rotulagem aplicáveis.

## Rotas principais

- `GET /api/health` — estado da API.
- `GET /api/products` — produtos publicados.
- `POST /api/admin/login` — autenticação administrativa.
- Rotas administrativas de produtos e encomendas — acesso protegido por token.

A configuração final deve ser validada no ambiente publicado antes de receber encomendas reais.
