-- ===== ESQUEMA PRINCIPAL DE PEDIDOLIST =====
-- Ejecutar en Supabase SQL Editor

-- ===== TABLAS DE USUARIOS Y NEGOCIOS =====

-- Usuarios (aprovechamos Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Negocios (preparado para multi-brand futuro)
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(50) UNIQUE,
  brand_id VARCHAR(50) DEFAULT 'generic',
  subscription_status VARCHAR(20) DEFAULT 'trial',
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Empleados
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'seller')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

-- Sucursales (por ahora solo 1)
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Principal',
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===== TABLAS DE PRODUCTOS Y PEDIDOS =====

-- Productos/Servicios
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  
  -- Datos del pedido
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(20),
  client_address TEXT,
  total DECIMAL(10,2) NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time TIME,
  notes TEXT,
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  
  -- Sincronización offline
  client_generated_id VARCHAR(255) UNIQUE, -- ID generado en el cliente
  last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_by UUID REFERENCES profiles(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Detalle de pedidos
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL, -- Guardamos el nombre por si el producto se elimina
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  notes TEXT
);

-- ===== TABLAS DE SINCRONIZACIÓN OFFLINE =====

-- Cola de sincronización
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('order', 'product')),
  entity_id TEXT NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  data JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retries INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Resolución de conflictos
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  local_version JSONB NOT NULL,
  server_version JSONB NOT NULL,
  resolution_type VARCHAR(20) NOT NULL CHECK (resolution_type IN ('local', 'server', 'merge')),
  resolved_data JSONB NOT NULL,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===== ÍNDICES PARA PERFORMANCE =====

-- Índices para pedidos
CREATE INDEX IF NOT EXISTS idx_orders_business_date ON orders(business_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_client_generated_id ON orders(client_generated_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Índices para sincronización
CREATE INDEX IF NOT EXISTS idx_sync_queue_business_status ON sync_queue(business_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);

-- Índices para conflictos
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_order_id ON conflict_resolutions(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_created_at ON conflict_resolutions(created_at);

-- ===== RLS (ROW LEVEL SECURITY) =====

-- Habilitar RLS en todas las tablas
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_resolutions ENABLE ROW LEVEL SECURITY;

-- ===== POLÍTICAS DE SEGURIDAD =====

-- Políticas para negocios
CREATE POLICY "Users can view their businesses" ON businesses
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = businesses.id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

CREATE POLICY "Owners can manage their businesses" ON businesses
  FOR ALL USING (owner_id = auth.uid());

-- Políticas para empleados
CREATE POLICY "Users can view employees in their businesses" ON employees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e2
      WHERE e2.business_id = employees.business_id 
      AND e2.user_id = auth.uid()
      AND e2.is_active = true
    )
  );

-- Políticas para sucursales
CREATE POLICY "Users can view branches in their businesses" ON branches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = branches.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Políticas para productos
CREATE POLICY "Users can manage products in their businesses" ON products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = products.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Políticas para pedidos
CREATE POLICY "Users can manage orders in their businesses" ON orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = orders.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Políticas para items de pedido
CREATE POLICY "Users can manage order items in their businesses" ON order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN employees e ON e.business_id = o.business_id
      WHERE o.id = order_items.order_id
      AND e.user_id = auth.uid()
      AND e.is_active = true
    )
  );

-- Políticas para cola de sincronización
CREATE POLICY "Users can manage sync queue in their businesses" ON sync_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.business_id = sync_queue.business_id 
      AND employees.user_id = auth.uid()
      AND employees.is_active = true
    )
  );

-- Políticas para resolución de conflictos
CREATE POLICY "Users can view conflict resolutions in their businesses" ON conflict_resolutions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN employees e ON e.business_id = o.business_id
      WHERE o.id = conflict_resolutions.order_id
      AND e.user_id = auth.uid()
      AND e.is_active = true
    )
  );

-- ===== FUNCIONES Y TRIGGERS =====

-- Función para actualizar last_modified_at
CREATE OR REPLACE FUNCTION update_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar last_modified_at en pedidos
CREATE TRIGGER update_orders_last_modified
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Función para limpiar datos antiguos (más de 30 días)
CREATE OR REPLACE FUNCTION cleanup_old_offline_data()
RETURNS void AS $$
BEGIN
  -- Limpiar pedidos de más de 30 días
  DELETE FROM orders 
  WHERE delivery_date < CURRENT_DATE - INTERVAL '30 days'
  AND status IN ('completed', 'cancelled');
  
  -- Limpiar cola de sincronización de más de 7 días
  DELETE FROM sync_queue 
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('completed', 'failed');
  
  -- Limpiar resoluciones de conflictos de más de 30 días
  DELETE FROM conflict_resolutions 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ===== DATOS INICIALES =====

-- Insertar sucursal por defecto para negocios existentes
INSERT INTO branches (business_id, name, is_active)
SELECT id, 'Principal', true
FROM businesses
WHERE NOT EXISTS (
  SELECT 1 FROM branches WHERE business_id = businesses.id
);

-- ===== COMENTARIOS =====

COMMENT ON TABLE profiles IS 'Perfiles de usuario que extienden auth.users de Supabase';
COMMENT ON TABLE businesses IS 'Negocios registrados en la plataforma';
COMMENT ON TABLE employees IS 'Empleados asociados a negocios';
COMMENT ON TABLE branches IS 'Sucursales de los negocios';
COMMENT ON TABLE products IS 'Productos y servicios ofrecidos';
COMMENT ON TABLE orders IS 'Pedidos de clientes';
COMMENT ON TABLE order_items IS 'Items individuales de cada pedido';
COMMENT ON TABLE sync_queue IS 'Cola de sincronización para datos offline';
COMMENT ON TABLE conflict_resolutions IS 'Registro de conflictos resueltos durante sincronización'; 