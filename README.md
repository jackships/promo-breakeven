# promo-breakeven

Small, dependency-free JavaScript functions for the numbers you need before running a discount or buying ads:

- **contribution margin** per order, with payment fees, shipping, refunds and returns
- **break-even ROAS and CPA** (and the targets for a given profit per order)
- **max discount** before an order stops making money
- **extra sales needed** after a discount to keep the same profit
- **bundles** and **buy X get Y** (BOGO) margins
- **payment fee** helpers: fee on an amount, and the price that nets a given amount

Pure functions, no I/O, ESM with TypeScript types. Node 18+ or any modern browser. Every formula is below with a worked example, and the tests cover the edge cases (zero and negative margins, 0 % and 100 % discounts, refund-heavy products).

```sh
git clone https://github.com/jackships/promo-breakeven.git
cd promo-breakeven
npm test
node examples/cli.js --price 40 --cogs 12 --fulfillment 4 --feeRate 0.029 --feeFixed 0.3
```

## Conventions

- Rates are decimals: `0.029` is 2.9 %, a `discount` of `0.2` is 20 % off.
- Money is per order, in one currency, **excluding sales tax / VAT**.
- Nothing is rounded. Round for display only.
- Bad input (negative price, `feeRate >= 1`, discount above 100 %, NaN...) throws a `RangeError` naming the field.

## The order model

Most functions take one `order` object. Only `price` and `cogs` are required.

| field | meaning | default |
|---|---|---|
| `price` | merchandise price of the order | required |
| `cogs` | landed product cost of that merchandise | required |
| `fulfillment` | shipping, packaging, pick/pack you pay per order | 0 |
| `shippingCharged` | shipping the customer pays you | 0 |
| `feeRate` | payment processing rate on the amount charged | 0 |
| `feeFixed` | fixed payment fee per order | 0 |
| `refundRate` | share of orders fully refunded | 0 |
| `restockRate` | share of product cost you recover on a refunded order | 0 |
| `returnCost` | extra cost per refunded order (label, inspection) | 0 |

The worked example used throughout:

```js
const order = {
  price: 40, cogs: 12, fulfillment: 4,
  feeRate: 0.029, feeFixed: 0.3,               // 2.9 % + 0.30
  refundRate: 0.08, restockRate: 0.7, returnCost: 3,
};
```

## Contribution margin

`contribution(order)`, `contributionMarginRate(order)`, `breakdown(order)`

With *r* = refundRate, *s* = restockRate, *g* = shippingCharged, *f* = feeRate, *F* = feeFixed:

```
contribution = price·(1 − r) + g           revenue you keep
             − cogs·(1 − r·s)              product cost, minus what refunds give back
             − fulfillment
             − (price + g)·f − F           payment fees (not returned on refunds)
             − r·returnCost

marginRate   = contribution / price
```

Refunds return the price but not the shipping the customer paid. Payment fees stay with the processor. This is contribution **before** ad spend and fixed costs.

Example: revenue 40 × 0.92 = 36.80; product 12 × (1 − 0.08 × 0.7) = 11.328; fulfillment 4; fees 40 × 0.029 + 0.30 = 1.46; returns 0.08 × 3 = 0.24.

```js
contribution(order);            // 19.772
contributionMarginRate(order);  // 0.4943
breakdown(order);               // { revenue: 36.8, product: 11.328, fulfillment: 4, payment: 1.46, returns: 0.24, contribution: 19.772, ... }
```

## Break-even CPA and ROAS

`breakEvenCpa(order, { profit = 0 })`, `breakEvenRoas(order, { profit = 0 })`, `profitAtRoas(order, roas)`

```
CPA  = contribution − profit
ROAS = (price + shippingCharged) / (contribution − profit)
profit at a ROAS = contribution − (price + shippingCharged) / ROAS
```

Order value in ROAS includes shipping charged, as ad platforms usually report purchase value that way. If `contribution <= profit`, no ROAS is enough and `breakEvenRoas` returns `Infinity`. A negative `breakEvenCpa` means the order loses money even with free traffic.

```js
breakEvenCpa(order);                  // 19.772  -> pay up to ~19.77 per order
breakEvenRoas(order);                 // 2.023   -> need ~2.02 in sales per 1 of ad spend
breakEvenRoas(order, { profit: 5 });  // 2.708   -> to keep 5 per order
profitAtRoas(order, 3);               // 6.439
```

Simple case: price 100, cogs 40 → contribution 60, break-even ROAS 100 / 60 = 1.67.

## Max discount before losing money

`maxDiscount(order, { minContribution = 0 })`, `breakEvenPrice(order)`

Contribution is linear in price: `C(p) = C(0) + p·(1 − r − f)`. So the lowest acceptable price and the deepest discount are:

```
p*          = (minContribution − C(0)) / (1 − r − f)
maxDiscount = 1 − p* / price               clamped to [0, 1]
breakEvenPrice = p* with minContribution = 0
```

It returns `0` if the full price already misses the target and `1` if even a free item meets it (for example when shipping charged covers every cost).

```js
breakEvenPrice(order);                          // 17.81
maxDiscount(order);                             // 0.5548 -> 55.5 % off is break-even
maxDiscount(order, { minContribution: 10 });    // 0.2742 -> keep at least 10 per order
```

Simple case: price 100, cogs 40, no fees → max discount 60 %, the gross margin.

## Extra sales needed after a discount

`volumeLiftNeeded(order, discount)`, `ordersNeeded(order, discount, currentOrders)`, `discountTable(order, discounts?)`

To earn the same total contribution, orders must grow by:

```
lift = C(full price) / C(discounted price) − 1
```

`Infinity` when the discounted order contributes nothing (no volume can make up for it). `null` when the full-price order already loses money (there is no profit to protect).

```js
volumeLiftNeeded(order, 0.10);       // 0.2199 -> 10 % off needs 22 % more orders
volumeLiftNeeded(order, 0.20);       // 0.5637
ordersNeeded(order, 0.20, 100);      // 157 orders instead of 100
volumeLiftNeeded(order, 1);          // Infinity
```

`discountTable(order)` gives the whole ladder (`node examples/cli.js` prints it):

| discount | price | contribution | extra orders needed |
|---|---|---|---|
| 5 % | 38.00 | 17.99 | 9.9 % |
| 10 % | 36.00 | 16.21 | 22.0 % |
| 20 % | 32.00 | 12.64 | 56.4 % |
| 30 % | 28.00 | 9.08 | 117.8 % |
| 50 % | 20.00 | 1.95 | 912.9 % |

The same lift applies if you think in conversion rate: with ad spend per visitor unchanged, the discounted price needs `lift` more conversion to keep profit per visitor.

## Bundles

`bundle({ items: [{ price, cogs, qty? }], discount, ...orderCosts })`

```
listPrice    = Σ price·qty
price        = listPrice·(1 − discount)
cogs         = Σ cogs·qty
contribution = contribution({ ...orderCosts, price, cogs })
vsSeparate   = contribution − Σ qty·contribution(each item as its own full-price order)
```

Order-level costs (fulfillment, fixed fee, return cost) are paid once per bundle, which is where a bundle discount can pay for itself.

```js
bundle({
  items: [{ price: 40, cogs: 12 }, { price: 25, cogs: 6 }],
  discount: 0.15, fulfillment: 4, feeRate: 0.029, feeFixed: 0.3,
});
// { listPrice: 65, price: 55.25, cogs: 18, contribution: 31.35,
//   separateOrdersContribution: 36.52, vsSeparate: -5.17, ... }
```

Here 15 % off costs more (9.75 of price) than the saved second shipment and fixed fee (4.30) plus the lower percentage fee (0.28), so the bundle earns 5.17 less than the same customer buying both items separately at full price. It wins only if it sells bundles to people who would otherwise have bought one item or nothing.

## Buy X, get Y (BOGO)

`buyXGetY({ price, cogs, buy, get, getDiscount = 1, ...orderCosts })`

```
units             = X + Y
effectiveDiscount = Y·getDiscount / (X + Y)
promo order       = price·(X + Y·(1 − getDiscount)) of merchandise, cogs·(X + Y)
baseline order    = X units at full price
ordersLiftNeeded  = C(baseline) / C(promo) − 1
```

```js
buyXGetY({ price: 40, cogs: 12, buy: 1, get: 1, fulfillment: 4, feeRate: 0.029, feeFixed: 0.3 });
// effectiveDiscount 0.5, promo.contribution 10.54, baseline.contribution 22.54,
// ordersLiftNeeded 1.14 -> you need 2.14x the orders to break even on the promo

buyXGetY({ price: 30, cogs: 10, buy: 2, get: 1, getDiscount: 0.5 });
// effectiveDiscount 0.167, promo.contribution 45, baseline.contribution 40,
// ordersLiftNeeded -0.11 -> negative: a customer who takes the deal is worth more
```

A negative `ordersLiftNeeded` means each promo order already earns more than the baseline order.

## Payment fees, markup and margin

```
paymentFee(amount)      = amount·f + F
grossUpForFees(net)     = (net + F) / (1 − f)        price that leaves `net` after fees
markupToMargin(k)       = k / (1 + k)
marginToMarkup(m)       = m / (1 − m)
discountedPrice(p, d)   = p·(1 − d)
breakEvenOrders(fixed, order) = ceil(fixed / contribution)   Infinity if contribution <= 0
```

```js
paymentFee(40, { feeRate: 0.029, feeFixed: 0.3 });       // 1.46
grossUpForFees(100, { feeRate: 0.029, feeFixed: 0.3 });  // 103.30
markupToMargin(1);     // 0.5   (100 % markup = 50 % margin)
marginToMarkup(0.4);   // 0.667
breakEvenOrders(5000, order);  // 253
```

## What this does not model

Sales tax, multiple currencies, inventory and cash timing, cannibalisation of full-price sales, or customer lifetime value. These are planning numbers built on your own estimates of cost and refund rates; check them against real order data.

## License

[MIT](LICENSE) © 2026 Jack Ships

---

Made by Jack, who also builds [Evenline](https://evenline.app), a Shopify app that runs this kind of break-even math on a store's own costs before a price change or promotion.
