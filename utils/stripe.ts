// Stripe client for Deno using fetch API
const STRIPE_BASE_URL = 'https://api.stripe.com/v1';

interface StripeCustomer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  trial_end?: number;
  current_period_end: number;
}

interface StripePaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

export class StripeClient {
  private secretKey: string;

  constructor() {
    this.secretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!this.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
  }

  private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    const url = `${STRIPE_BASE_URL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && method !== 'GET') {
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      }
      options.body = formData.toString();
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Stripe API Error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // Crear o buscar cliente
  async createOrGetCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<StripeCustomer> {
    // Primero buscar si ya existe
    const existingCustomers = await this.makeRequest('/customers?email=' + encodeURIComponent(email));
    
    if (existingCustomers.data && existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Crear nuevo cliente
    const customerData: any = { email };
    if (name) customerData.name = name;
    if (metadata) customerData.metadata = metadata;

    return await this.makeRequest('/customers', 'POST', customerData);
  }

  // Crear método de pago
  async createPaymentMethod(type: string, cardData: any): Promise<StripePaymentMethod> {
    return await this.makeRequest('/payment_methods', 'POST', {
      type,
      card: cardData,
    });
  }

  // Adjuntar método de pago al cliente
  async attachPaymentMethodToCustomer(paymentMethodId: string, customerId: string): Promise<void> {
    await this.makeRequest(`/payment_methods/${paymentMethodId}/attach`, 'POST', {
      customer: customerId,
    });
  }

  // Crear suscripción con trial
  async createSubscriptionWithTrial(
    customerId: string, 
    priceId: string, 
    trialDays: number = 7,
    paymentMethodId?: string
  ): Promise<StripeSubscription> {
    const subscriptionData: any = {
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    };

    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    return await this.makeRequest('/subscriptions', 'POST', subscriptionData);
  }

  // Obtener precio por ID
  async getPrice(priceId: string): Promise<any> {
    return await this.makeRequest(`/prices/${priceId}`);
  }

  // Listar precios disponibles
  async listPrices(active: boolean = true): Promise<any> {
    return await this.makeRequest(`/prices?active=${active}`);
  }
}

// Singleton instance
let stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!stripeClient) {
    stripeClient = new StripeClient();
  }
  return stripeClient;
} 