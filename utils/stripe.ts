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

  // Crear suscripción con trial (para casos con método de pago)
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
      expand: ['latest_invoice.payment_intent'],
    };

    if (paymentMethodId) {
      // Si hay método de pago, configurar para cobro automático después del trial
      subscriptionData.default_payment_method = paymentMethodId;
      subscriptionData.payment_behavior = 'default_incomplete';
    } else {
      // Si no hay método de pago, crear suscripción que requerirá método de pago al final del trial
      subscriptionData.payment_behavior = 'default_incomplete';
      subscriptionData.payment_settings = {
        save_default_payment_method: 'on_subscription'
      };
    }

    return await this.stripe.subscriptions.create(subscriptionData);
  }

  // Crear trial gratuito (sin suscripción, solo período de prueba)
  async createFreeTrial(
    customerId: string, 
    monthlyPriceId: string, 
    trialDays: number = 7
  ): Promise<{ id: string; trial_end: number | null; status: string; current_period_end: number }> {
    // Para trial gratuito, usar el precio mensual recurrente pero con trial
    // Esto evita el error de "one_time" price type que no es compatible con trials
    const subscriptionData: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: monthlyPriceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    };

    const subscription = await this.stripe.subscriptions.create(subscriptionData);
    
    return {
      id: subscription.id,
      trial_end: subscription.trial_end!,
      status: subscription.status,
      current_period_end: subscription.current_period_end
    };
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

  // Extender trial de una suscripción
  async extendTrial(
    subscriptionId: string, 
    paymentMethodId: string, 
    additionalDays: number
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    
    // Actualizar la suscripción con método de pago y extender trial
    return await this.stripe.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId,
      trial_end: subscription.trial_end! + (additionalDays * 24 * 60 * 60), // Convertir días a segundos
      payment_behavior: 'default_incomplete'
    });
  }

  // Cambiar plan de suscripción
  async changeSubscriptionPlan(
    subscriptionId: string, 
    newPriceId: string
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    
    // Actualizar el precio de la suscripción
    return await this.stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId,
      }],
      proration_behavior: 'create_prorations'
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