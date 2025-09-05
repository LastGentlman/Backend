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

  // Obtener precio por lookup key
  async getPriceByLookupKey(lookupKey: string): Promise<string> {
    try {
      const prices = await this.stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1
      });

      if (prices.data.length === 0) {
        throw new Error(`No se encontró un precio activo con lookup key: ${lookupKey}`);
      }

      return prices.data[0].id;
    } catch (error) {
      console.error(`Error obteniendo precio por lookup key ${lookupKey}:`, error);
      throw new Error(`Error obteniendo precio: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  // Listar precios disponibles
  async listPrices(active: boolean = true): Promise<Stripe.ApiList<Stripe.Price>> {
    return await this.stripe.prices.list({
      active,
      limit: 100
    });
  }

  // Obtener suscripción por ID
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.retrieve(subscriptionId);
  }

  // Extender trial de una suscripción existente
  async extendTrial(
    subscriptionId: string, 
    paymentMethodId: string, 
    additionalDays: number
  ): Promise<Stripe.Subscription> {
    // Obtener la suscripción actual
    const subscription = await this.getSubscription(subscriptionId);
    
    // Calcular la nueva fecha de fin del trial
    const currentTrialEnd = subscription.trial_end || Math.floor(Date.now() / 1000);
    const newTrialEnd = currentTrialEnd + (additionalDays * 24 * 60 * 60);

    // Actualizar la suscripción
    return await this.stripe.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId,
      trial_end: newTrialEnd,
      payment_behavior: 'default_incomplete'
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