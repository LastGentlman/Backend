// Local Stripe type definitions to avoid external dependency issues
export interface Stripe {
  customers: {
    list(params: { email: string; limit: number }): Promise<{ data: Customer[] }>;
    create(params: { email: string; name?: string; metadata?: Record<string, string> }): Promise<Customer>;
  };
  paymentMethods: {
    create(params: { type: PaymentMethodCreateParamsType; card: CardData }): Promise<PaymentMethod>;
    attach(id: string, params: { customer: string }): Promise<PaymentMethod>;
  };
  subscriptions: {
    create(params: SubscriptionCreateParams): Promise<Subscription>;
  };
  prices: {
    retrieve(id: string): Promise<Price>;
    list(params: { active: boolean; limit: number }): Promise<ApiList<Price>>;
  };
}

export interface Customer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CardData {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
}

export interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

export interface Subscription {
  id: string;
  customer: string;
  status: string;
  trial_end?: number;
  current_period_end: number;
}

export interface Price {
  id: string;
  nickname?: string;
  unit_amount?: number;
  currency: string;
  recurring?: {
    interval: string;
  };
  active: boolean;
}

export interface ApiList<T> {
  data: T[];
  has_more: boolean;
  url: string;
}

export type PaymentMethodCreateParamsType = 'card' | 'sepa_debit' | 'ideal' | 'sofort';

export interface SubscriptionCreateParams {
  customer: string;
  items: Array<{ price: string }>;
  trial_period_days?: number;
  payment_behavior?: string;
  expand?: string[];
  default_payment_method?: string;
}

export default Stripe; 