// Shared types for PedidoList

export interface Profile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  subdomain?: string;
  brand_id: string;
  subscription_status: 'trial' | 'active' | 'cancelled';
  trial_ends_at: string;
  settings: Record<string, any>;
  created_at: string;
}

export interface Employee {
  id: string;
  business_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'seller';
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  price: number;
  category?: string;
  is_active: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string;
}

export interface Order {
  id: string;
  business_id: string;
  branch_id: string;
  employee_id: string;
  client_name: string;
  client_phone?: string;
  total: number;
  delivery_date: string;
  delivery_time?: string;
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  client_generated_id?: string;
  last_modified_at: string;
  modified_by?: string;
  created_at: string;
  items?: OrderItem[];
}

// API Request/Response types
export interface CreateOrderRequest {
  client_name: string;
  client_phone?: string;
  delivery_date: string;
  delivery_time?: string;
  notes?: string;
  items: {
    product_id?: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    notes?: string;
  }[];
}

export interface UpdateOrderRequest {
  status?: Order['status'];
  notes?: string;
  delivery_date?: string;
  delivery_time?: string;
}

export interface CreateProductRequest {
  name: string;
  price: number;
  category?: string;
}

export interface SyncQueueItem {
  id?: number;
  entityType: 'order' | 'product';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  timestamp: string;
  retries?: number;
  lastError?: string;
}

// Offline sync types
export interface OfflineOrder extends Omit<Order, 'id'> {
  id?: string;
  clientGeneratedId: string;
  syncStatus: 'pending' | 'synced' | 'error';
}

// WhatsApp receipt types
export interface ReceiptData {
  order: Order;
  business: Business;
  items: OrderItem[];
}

// App state types
export interface AppState {
  user: Profile | null;
  business: Business | null;
  branch: Branch | null;
  isOwner: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingSyncCount: number;
}

// Form types
export interface OrderFormData {
  clientName: string;
  clientPhone?: string;
  deliveryDate: string;
  deliveryTime?: string;
  notes?: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }[];
} 