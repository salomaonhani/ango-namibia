BEGIN;

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    category TEXT,
    image TEXT,
    tag TEXT,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    sold_out BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    zone TEXT,
    payment TEXT,
    total NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS whatsapp_numbers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    phone TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app_counters (
    name TEXT PRIMARY KEY,
    next_value INTEGER NOT NULL CHECK (next_value > 0)
);

COMMIT;