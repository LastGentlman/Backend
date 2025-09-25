// Types for business trial activation

export interface TrialActivationRequest {
  // Datos del negocio
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  businessAddress?: string;
  
  // Datos de facturación
  billingName: string;
  taxId?: string; // RFC, CIF, NIF, etc.
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  
  // Configuración del negocio
  currency: 'USD' | 'EUR' | 'MXN' | 'COP' | 'ARS' | 'BRL';
  taxRegime: string; // Código del régimen fiscal (ej: "601", "612", etc.)
  
  // Método de pago (opcional para trial)
  paymentMethod?: {
    type: 'card';
    card: {
      number: string;
      exp_month: number;
      exp_year: number;
      cvc: string;
    };
  };
}

export interface TrialActivationResponse {
  success: boolean;
  business: {
    id: string;
    name: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    trialEndsAt: string;
    currency: string;
    taxRegime: {
      code: string;
      name: string;
      type: "fisica" | "moral" | "especial";
    };
  };
  subscription: {
    id: string;
    status: string;
    trialEnd: number;
    currentPeriodEnd: number | null;
  };
}

export interface BusinessSettings {
  currency: string;
  taxRegime: string;
  notifications: {
    email: boolean;
    push: boolean;
  };
  timezone: string;
}

// ===== TIPOS PARA CÓDIGOS DE INVITACIÓN =====

export interface BusinessInvitationCode {
  id: string;
  business_id: string;
  code: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  status: 'active' | 'used' | 'expired' | 'disabled';
  role: 'admin' | 'seller';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessInvitationUsage {
  id: string;
  invitation_code_id: string;
  used_by: string;
  used_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface CreateInvitationCodeRequest {
  business_id: string;
  role: 'admin' | 'seller';
  max_uses?: number;
  expires_in_hours?: number;
  notes?: string;
}

export interface JoinBusinessRequest {
  businessCode: string;
}

export interface JoinBusinessResponse {
  success: boolean;
  business: {
    id: string;
    name: string;
    role: string;
  };
  message: string;
}

export interface InvitationCodeStats {
  total_codes: number;
  active_codes: number;
  used_codes: number;
  expired_codes: number;
  disabled_codes: number;
} 