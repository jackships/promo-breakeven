/**
 * promo-breakeven: pure, dependency-free unit economics for discounts and paid ads.
 *
 * Conventions
 * - Rates are decimals: 0.029 means 2.9 %, 0.2 means 20 % off.
 * - Money is per order, in any single currency, excluding sales tax / VAT.
 * - Nothing is rounded. Round for display only.
 * - Invalid input throws a RangeError naming the field.
 */

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function num(name, v, { min = 0, max = Infinity, maxExclusive = false } = {}) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
  if (v < min) throw new RangeError(`${name} must be >= ${min}`);
  if (maxExclusive ? v >= max : v > max) throw new RangeError(`${name} must be ${maxExclusive ? "<" : "<="} ${max}`);
  return v;
}

/**
 * Normalise a cost model. Only `price` and `cogs` are required.
 * @typedef {object} Order
 * @property {number} price            selling price of the order's merchandise
 * @property {number} cogs             product cost of that merchandise (landed)
 * @property {number} [fulfillment]    shipping, packaging and pick/pack you pay per order
 * @property {number} [shippingCharged] shipping the customer pays you (fees apply to it)
 * @property {number} [feeRate]        payment processing rate on the amount charged
 * @property {number} [feeFixed]       fixed payment fee per order
 * @property {number} [refundRate]     share of orders fully refunded
 * @property {number} [restockRate]    share of product cost recovered on a refunded order
 * @property {number} [returnCost]     extra cost per refunded order (label, inspection)
 */
export function normalize(o) {
  if (!o || typeof o !== "object") throw new RangeError("order must be an object");
  return {
    price: num("price", o.price),
    cogs: num("cogs", o.cogs),
    fulfillment: num("fulfillment", o.fulfillment ?? 0),
    shippingCharged: num("shippingCharged", o.shippingCharged ?? 0),
    feeRate: num("feeRate", o.feeRate ?? 0, { max: 1, maxExclusive: true }),
    feeFixed: num("feeFixed", o.feeFixed ?? 0),
    refundRate: num("refundRate", o.refundRate ?? 0, { max: 1 }),
    restockRate: num("restockRate", o.restockRate ?? 0, { max: 1 }),
    returnCost: num("returnCost", o.returnCost ?? 0),
  };
}

const checkDiscount = (d) => num("discount", d, { max: 1 });

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

/** Payment fee on an amount: amount × feeRate + feeFixed. */
export function paymentFee(amount, { feeRate = 0, feeFixed = 0 } = {}) {
  num("amount", amount);
  num("feeRate", feeRate, { max: 1, maxExclusive: true });
  num("feeFixed", feeFixed);
  return amount * feeRate + feeFixed;
}

/** What to charge so that `net` is left after payment fees: (net + feeFixed) / (1 − feeRate). */
export function grossUpForFees(net, { feeRate = 0, feeFixed = 0 } = {}) {
  num("net", net);
  num("feeRate", feeRate, { max: 1, maxExclusive: true });
  num("feeFixed", feeFixed);
  return (net + feeFixed) / (1 - feeRate);
}

/** Price after a discount: price × (1 − discount). */
export function discountedPrice(price, discount) {
  return num("price", price) * (1 - checkDiscount(discount));
}

/** Gross margin rate from markup: m = k / (1 + k). 0.5 markup → 33.3 % margin. */
export function markupToMargin(markup) {
  num("markup", markup, { min: -1 });
  if (markup === -1) return -Infinity;
  return markup / (1 + markup);
}

/** Markup from gross margin rate: k = m / (1 − m). 0.4 margin → 66.7 % markup. */
export function marginToMarkup(margin) {
  num("margin", margin, { min: -Infinity, max: 1 });
  return margin === 1 ? Infinity : margin / (1 - margin);
}

// ---------------------------------------------------------------------------
// Contribution margin
// ---------------------------------------------------------------------------

/**
 * Expected contribution per order, before ad spend and fixed costs, as line items.
 *
 *   contribution = price × (1 − r) + g
 *                − cogs × (1 − r × s)
 *                − fulfillment
 *                − (price + g) × feeRate − feeFixed
 *                − r × returnCost
 *
 * r = refundRate, s = restockRate, g = shippingCharged. Refunds give back the price but
 * not shipping paid by the customer, and payment fees are not returned.
 */
export function breakdown(order) {
  const o = normalize(order);
  const r = o.refundRate;
  const g = o.shippingCharged;
  const revenue = o.price * (1 - r) + g;
  const product = o.cogs * (1 - r * o.restockRate);
  const payment = (o.price + g) * o.feeRate + o.feeFixed;
  const returns = r * o.returnCost;
  const contribution = revenue - product - o.fulfillment - payment - returns;
  return {
    orderValue: o.price + g,
    refunds: o.price * r,
    revenue,
    product,
    fulfillment: o.fulfillment,
    payment,
    returns,
    contribution,
    marginRate: o.price > 0 ? contribution / o.price : null,
  };
}

/** Expected contribution per order (see `breakdown`). */
export function contribution(order) {
  return breakdown(order).contribution;
}

/** Contribution as a share of the merchandise price, or null when the price is 0. */
export function contributionMarginRate(order) {
  return breakdown(order).marginRate;
}

/**
 * Contribution is linear in price: C(p) = C(0) + p × (1 − refundRate − feeRate).
 * Returns { intercept: C(0), slope }.
 */
function linear(o) {
  const intercept = contribution({ ...o, price: 0 });
  return { intercept, slope: 1 - o.refundRate - o.feeRate };
}

/** Lowest price with zero contribution: −C(0) / (1 − r − f). Null if no price breaks even. */
export function breakEvenPrice(order) {
  const o = normalize(order);
  const { intercept, slope } = linear(o);
  if (intercept >= 0) return 0;
  if (slope <= 0) return null;
  return -intercept / slope;
}

/** Orders needed to cover fixed costs: ceil(fixedCosts / contribution). Infinity if contribution ≤ 0. */
export function breakEvenOrders(fixedCosts, order) {
  num("fixedCosts", fixedCosts);
  const c = contribution(order);
  if (fixedCosts === 0) return 0;
  return c > 0 ? Math.ceil(fixedCosts / c - 1e-9) : Infinity;
}

// ---------------------------------------------------------------------------
// Advertising
// ---------------------------------------------------------------------------

/**
 * Most you can pay in ads per order and still make `profit` per order:
 *   CPA = contribution − profit
 * A negative result means the order loses money even with free traffic.
 */
export function breakEvenCpa(order, { profit = 0 } = {}) {
  num("profit", profit, { min: -Infinity });
  return contribution(order) - profit;
}

/**
 * Minimum ROAS (order value per unit of ad spend) to make `profit` per order:
 *   ROAS = (price + shippingCharged) / (contribution − profit)
 * Order value includes shipping charged, as ad platforms usually report it.
 * Infinity when no amount of ad spend can work (contribution ≤ profit).
 */
export function breakEvenRoas(order, { profit = 0 } = {}) {
  const b = breakdown(order);
  const room = b.contribution - num("profit", profit, { min: -Infinity });
  if (room <= 0) return Infinity;
  return b.orderValue / room;
}

/** Profit per order after ads, given an actual ROAS: contribution − orderValue / roas. */
export function profitAtRoas(order, roas) {
  num("roas", roas);
  const b = breakdown(order);
  if (roas === 0) return -Infinity;
  return b.contribution - b.orderValue / roas;
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

/** The order with `discount` taken off the merchandise price (shipping charged is untouched). */
export function applyDiscount(order, discount) {
  const o = normalize(order);
  return { ...o, price: discountedPrice(o.price, discount) };
}

/**
 * Largest discount that still leaves `minContribution` per order.
 *   p* = (minContribution − C(0)) / (1 − r − f)
 *   maxDiscount = 1 − p* / price, clamped to [0, 1]
 * Returns 0 when the full price already misses the target, 1 when even a free item meets it.
 */
export function maxDiscount(order, { minContribution = 0 } = {}) {
  const o = normalize(order);
  num("minContribution", minContribution, { min: -Infinity });
  if (contribution(o) < minContribution || o.price === 0) return 0;
  const { intercept, slope } = linear(o);
  if (intercept >= minContribution || slope <= 0) return 1;
  const p = (minContribution - intercept) / slope;
  return Math.min(1, Math.max(0, 1 - p / o.price));
}

/**
 * Extra sales needed after a discount to keep the same total contribution:
 *   lift = C(full price) / C(discounted) − 1
 * 0.25 means you need 25 % more orders. Returns Infinity when the discounted order
 * makes no contribution, and null when the full-price order doesn't either (there is
 * no profit to protect).
 */
export function volumeLiftNeeded(order, discount) {
  const before = contribution(order);
  const after = contribution(applyDiscount(order, discount));
  if (before <= 0) return null;
  if (after <= 0) return Infinity;
  return before / after - 1;
}

/** Orders needed at the discounted price to match `currentOrders` at full price (rounded up). */
export function ordersNeeded(order, discount, currentOrders) {
  num("currentOrders", currentOrders);
  const lift = volumeLiftNeeded(order, discount);
  if (lift === null) return null;
  if (lift === Infinity) return Infinity;
  return Math.ceil(currentOrders * (1 + lift) - 1e-9);
}

/** One row per discount: price, contribution, margin rate and lift needed. */
export function discountTable(order, discounts = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
  const o = normalize(order);
  return discounts.map((d) => {
    const b = breakdown(applyDiscount(o, d));
    return { discount: d, price: discountedPrice(o.price, d), contribution: b.contribution, marginRate: b.marginRate, volumeLiftNeeded: volumeLiftNeeded(o, d) };
  });
}

// ---------------------------------------------------------------------------
// Bundles and BOGO
// ---------------------------------------------------------------------------

/**
 * A bundle sold as one order: the list prices and costs of its items are summed and
 * `discount` comes off the total. Order-level costs (fulfillment, fixed fee, returns)
 * are paid once, which is why bundles can beat separate orders.
 *
 * @param {{items: {price:number, cogs:number, qty?:number}[], discount?: number} & Partial<Order>} b
 */
export function bundle({ items, discount = 0, ...costs }) {
  if (!Array.isArray(items) || items.length === 0) throw new RangeError("items must be a non-empty array");
  checkDiscount(discount);
  let list = 0;
  let cogs = 0;
  items.forEach((it, i) => {
    const qty = num(`items[${i}].qty`, it.qty ?? 1);
    list += num(`items[${i}].price`, it.price) * qty;
    cogs += num(`items[${i}].cogs`, it.cogs) * qty;
  });
  const order = { ...costs, price: list * (1 - discount), cogs };
  const b = breakdown(order);
  // the same items bought as separate full-price orders, each paying order-level costs
  const separate = items.reduce((t, it) => t + (it.qty ?? 1) * contribution({ ...costs, price: it.price, cogs: it.cogs }), 0);
  return { listPrice: list, price: order.price, cogs, ...b, separateOrdersContribution: separate, vsSeparate: b.contribution - separate };
}

/**
 * "Buy X, get Y at `getDiscount` off" (getDiscount 1 = free). One order of X + Y units.
 *
 *   effective discount = Y × getDiscount / (X + Y)
 *   promo order price  = price × (X + Y × (1 − getDiscount))
 *
 * The baseline is a full-price order of X units: the purchase the customer was going to
 * make anyway. `ordersLiftNeeded` is how many more promo orders you need, relative to
 * baseline orders, to keep the same contribution.
 */
export function buyXGetY({ price, cogs, buy, get, getDiscount = 1, ...costs }) {
  num("price", price);
  num("cogs", cogs);
  if (!Number.isInteger(buy) || buy < 1) throw new RangeError("buy must be a whole number >= 1");
  if (!Number.isInteger(get) || get < 1) throw new RangeError("get must be a whole number >= 1");
  num("getDiscount", getDiscount, { max: 1 });
  const units = buy + get;
  const promo = breakdown({ ...costs, price: price * (buy + get * (1 - getDiscount)), cogs: cogs * units });
  const baseline = breakdown({ ...costs, price: price * buy, cogs: cogs * buy });
  const lift = baseline.contribution <= 0 ? null : promo.contribution <= 0 ? Infinity : baseline.contribution / promo.contribution - 1;
  return {
    units,
    effectiveDiscount: (get * getDiscount) / units,
    promo,
    baseline,
    contributionPerUnit: promo.contribution / units,
    ordersLiftNeeded: lift,
  };
}
