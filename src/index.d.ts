export interface Order {
  /** selling price of the order's merchandise (excl. tax) */
  price: number;
  /** landed product cost of that merchandise */
  cogs: number;
  /** shipping, packaging and pick/pack you pay per order */
  fulfillment?: number;
  /** shipping the customer pays you */
  shippingCharged?: number;
  /** payment processing rate, decimal (0.029) */
  feeRate?: number;
  /** fixed payment fee per order */
  feeFixed?: number;
  /** share of orders fully refunded, decimal */
  refundRate?: number;
  /** share of product cost recovered on a refunded order, decimal */
  restockRate?: number;
  /** extra cost per refunded order */
  returnCost?: number;
}

export interface Breakdown {
  orderValue: number;
  refunds: number;
  revenue: number;
  product: number;
  fulfillment: number;
  payment: number;
  returns: number;
  contribution: number;
  marginRate: number | null;
}

export type Fees = { feeRate?: number; feeFixed?: number };

export function normalize(o: Order): Required<Order>;
export function paymentFee(amount: number, fees?: Fees): number;
export function grossUpForFees(net: number, fees?: Fees): number;
export function discountedPrice(price: number, discount: number): number;
export function markupToMargin(markup: number): number;
export function marginToMarkup(margin: number): number;

export function breakdown(order: Order): Breakdown;
export function contribution(order: Order): number;
export function contributionMarginRate(order: Order): number | null;
export function breakEvenPrice(order: Order): number | null;
export function breakEvenOrders(fixedCosts: number, order: Order): number;

export function breakEvenCpa(order: Order, opts?: { profit?: number }): number;
export function breakEvenRoas(order: Order, opts?: { profit?: number }): number;
export function profitAtRoas(order: Order, roas: number): number;

export function applyDiscount(order: Order, discount: number): Required<Order>;
export function maxDiscount(order: Order, opts?: { minContribution?: number }): number;
export function volumeLiftNeeded(order: Order, discount: number): number | null;
export function ordersNeeded(order: Order, discount: number, currentOrders: number): number | null;
export function discountTable(
  order: Order,
  discounts?: number[],
): { discount: number; price: number; contribution: number; marginRate: number | null; volumeLiftNeeded: number | null }[];

export type OrderCosts = Omit<Order, "price" | "cogs">;

export function bundle(
  b: { items: { price: number; cogs: number; qty?: number }[]; discount?: number } & OrderCosts,
): Breakdown & { listPrice: number; price: number; cogs: number; separateOrdersContribution: number; vsSeparate: number };

export function buyXGetY(
  b: { price: number; cogs: number; buy: number; get: number; getDiscount?: number } & OrderCosts,
): { units: number; effectiveDiscount: number; promo: Breakdown; baseline: Breakdown; contributionPerUnit: number; ordersLiftNeeded: number | null };
