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
    currentPeriodEnd: number;
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