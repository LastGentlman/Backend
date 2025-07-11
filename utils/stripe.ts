import Stripe from "npm:stripe";

// Official Stripe client for Deno
export class StripeClient {
  private stripe: Stripe;

  constructor() {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  // Crear o buscar cliente
  async createOrGetCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<Stripe.Customer> {
    // Primero buscar si ya existe
    const existingCustomers = await this.stripe.customers.list({
      email,
      limit: 1
    });
    
    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Crear nuevo cliente
    return await this.stripe.customers.create({
      email,
      name,
      metadata
    });
  }

  // Crear método de pago
  async createPaymentMethod(type: string, cardData: Stripe.PaymentMethodCreateParams.Card1): Promise<Stripe.PaymentMethod> {
    return await this.stripe.paymentMethods.create({
      type: type as Stripe.PaymentMethodCreateParams.Type,
      card: cardData,
    });
  }

  // Adjuntar método de pago al cliente
  async attachPaymentMethodToCustomer(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    return await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  // Crear suscripción con trial
  async createSubscriptionWithTrial(
    customerId: string, 
    priceId: string, 
    trialDays: number = 7,
    paymentMethodId?: string
  ): Promise<Stripe.Subscription> {
    const subscriptionData: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    };

    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    return await this.stripe.subscriptions.create(subscriptionData);
  }

  // Obtener precio por ID
  async getPrice(priceId: string): Promise<Stripe.Price> {
    return await this.stripe.prices.retrieve(priceId);
  }

  // Listar precios disponibles
  async listPrices(active: boolean = true): Promise<Stripe.ApiList<Stripe.Price>> {
    return await this.stripe.prices.list({
      active,
      limit: 100
    });
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