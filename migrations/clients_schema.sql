-- ===== ESQUEMA DE CLIENTES =====
-- Ejecutar en Supabase SQL Editor

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  notes TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  last_order_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_clients_business_id ON clients(business_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);

-- Habilitar RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para clientes
CREATE POLICY "Users can view clients in their businesses" ON clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = clients.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

CREATE POLICY "Users can insert clients in their businesses" ON clients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = clients.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

CREATE POLICY "Users can update clients in their businesses" ON clients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = clients.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

CREATE POLICY "Users can delete clients in their businesses" ON clients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = clients.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Función para actualizar estadísticas de clientes
CREATE OR REPLACE FUNCTION update_client_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar total_orders y total_spent del cliente
  UPDATE clients 
  SET 
    total_orders = (
      SELECT COUNT(*) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    total_spent = (
      SELECT COALESCE(SUM(total), 0) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    last_order_date = (
      SELECT MAX(delivery_date) 
      FROM orders 
      WHERE client_name = clients.name 
      AND business_id = clients.business_id
    ),
    updated_at = NOW()
  WHERE business_id = NEW.business_id 
  AND name = NEW.client_name;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar estadísticas cuando se crea/actualiza un pedido
CREATE TRIGGER update_client_stats_trigger
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_client_stats();

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER update_clients_updated_at_trigger
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at(); 