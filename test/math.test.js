import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../src/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Worked example used in the README
const shop = { price: 40, cogs: 12, fulfillment: 4, feeRate: 0.029, feeFixed: 0.3, refundRate: 0.08, restockRate: 0.7, returnCost: 3 };
const simple = { price: 100, cogs: 40 };

test("contribution: simple order is price − cogs", () => {
  near(B.contribution(simple), 60);
  near(B.contributionMarginRate(simple), 0.6);
});

test("contribution: worked example and its line items", () => {
  const b = B.breakdown(shop);
  near(b.revenue, 36.8);
  near(b.product, 11.328);
  near(b.payment, 1.46);
  near(b.returns, 0.24);
  near(b.contribution, 19.772);
  near(b.revenue - b.product - b.fulfillment - b.payment - b.returns, b.contribution);
});

test("contribution: no refunds ignores restock and return cost", () => {
  near(B.contribution({ ...shop, refundRate: 0 }), 40 - 12 - 4 - 40 * 0.029 - 0.3);
});

test("contribution: every order refunded and fully restocked still loses fees, shipping and handling", () => {
  near(B.contribution({ ...shop, refundRate: 1, restockRate: 1 }), -(4 + 1.46 + 3));
});

test("contribution: shipping charged is kept on refunds and carries the payment fee", () => {
  const withShip = B.contribution({ ...shop, shippingCharged: 5 });
  near(withShip - B.contribution(shop), 5 - 5 * 0.029);
});

test("contribution: negative margin when costs exceed price", () => {
  assert.ok(B.contribution({ price: 10, cogs: 12 }) < 0);
  near(B.contributionMarginRate({ price: 10, cogs: 12 }), -0.2);
});

test("contribution: zero price gives null margin rate", () => {
  assert.equal(B.contributionMarginRate({ price: 0, cogs: 5 }), null);
  near(B.contribution({ price: 0, cogs: 5, feeFixed: 0.3 }), -5.3);
});

test("payment fee and gross-up are inverses", () => {
  const fees = { feeRate: 0.029, feeFixed: 0.3 };
  near(B.paymentFee(40, fees), 1.46);
  const gross = B.grossUpForFees(100, fees);
  near(gross - B.paymentFee(gross, fees), 100);
  near(B.grossUpForFees(0, {}), 0);
});

test("markup and margin conversions", () => {
  near(B.markupToMargin(1), 0.5);
  near(B.marginToMarkup(0.4), 2 / 3);
  near(B.markupToMargin(B.marginToMarkup(0.37)), 0.37);
  assert.equal(B.marginToMarkup(1), Infinity);
  near(B.marginToMarkup(-0.5), -1 / 3);
});

test("break-even CPA and ROAS", () => {
  near(B.breakEvenCpa(simple), 60);
  near(B.breakEvenRoas(simple), 100 / 60);
  near(B.breakEvenCpa(shop, { profit: 5 }), 14.772);
  near(B.breakEvenRoas(shop), 40 / 19.772);
  near(B.breakEvenRoas(shop, { profit: 5 }), 40 / 14.772);
});

test("ROAS uses order value including shipping charged", () => {
  const o = { price: 50, cogs: 20, shippingCharged: 10 };
  near(B.breakEvenRoas(o), 60 / 40);
});

test("break-even ROAS is Infinity when there is no margin to spend", () => {
  assert.equal(B.breakEvenRoas({ price: 10, cogs: 10 }), Infinity);
  assert.equal(B.breakEvenRoas({ price: 10, cogs: 12 }), Infinity);
  assert.equal(B.breakEvenRoas(simple, { profit: 60 }), Infinity);
  assert.ok(B.breakEvenCpa({ price: 10, cogs: 12 }) < 0);
});

test("profit at a given ROAS; break-even ROAS gives zero", () => {
  near(B.profitAtRoas(simple, 2), 60 - 50);
  near(B.profitAtRoas(shop, B.breakEvenRoas(shop)), 0);
  assert.equal(B.profitAtRoas(simple, 0), -Infinity);
});

test("discounted price, including 0 % and 100 %", () => {
  near(B.discountedPrice(40, 0.25), 30);
  near(B.discountedPrice(40, 0), 40);
  near(B.discountedPrice(40, 1), 0);
});

test("volume lift needed: simple 20 % off a 60 % margin", () => {
  // 60 → 40 contribution: need 50 % more orders
  near(B.volumeLiftNeeded(simple, 0.2), 0.5);
  assert.equal(B.ordersNeeded(simple, 0.2, 100), 150);
});

test("volume lift needed: worked example matches the 10 % off case", () => {
  near(B.volumeLiftNeeded(shop, 0.1), 19.772 / 16.208 - 1);
  near(B.volumeLiftNeeded(shop, 0.1), 0.219891411648568, 1e-12);
});

test("volume lift needed: 0 % discount needs nothing", () => {
  near(B.volumeLiftNeeded(shop, 0), 0);
});

test("volume lift needed: discount that wipes out margin is Infinity", () => {
  assert.equal(B.volumeLiftNeeded(simple, 0.6), Infinity); // 40 - 40 = 0
  assert.equal(B.volumeLiftNeeded(simple, 1), Infinity);
  assert.equal(B.ordersNeeded(simple, 1, 100), Infinity);
});

test("volume lift needed: null when full price already loses money", () => {
  assert.equal(B.volumeLiftNeeded({ price: 10, cogs: 12 }, 0.1), null);
  assert.equal(B.ordersNeeded({ price: 10, cogs: 12 }, 0.1, 100), null);
});

test("max discount: simple case is the margin rate", () => {
  near(B.maxDiscount(simple), 0.6);
  near(B.maxDiscount(simple, { minContribution: 20 }), 0.4);
});

test("max discount lands exactly on the target contribution", () => {
  const d = B.maxDiscount(shop);
  near(B.contribution(B.applyDiscount(shop, d)), 0, 1e-9);
  const d10 = B.maxDiscount(shop, { minContribution: 10 });
  near(B.contribution(B.applyDiscount(shop, d10)), 10, 1e-9);
  near(B.discountedPrice(40, d), B.breakEvenPrice(shop), 1e-9);
});

test("max discount is 0 when the full price misses the target", () => {
  assert.equal(B.maxDiscount({ price: 10, cogs: 12 }), 0);
  assert.equal(B.maxDiscount(simple, { minContribution: 61 }), 0);
  assert.equal(B.maxDiscount({ price: 0, cogs: 0 }), 0);
});

test("max discount is 1 when even a free item meets the target", () => {
  // shipping charged covers everything
  assert.equal(B.maxDiscount({ price: 20, cogs: 2, shippingCharged: 10 }), 1);
  assert.equal(B.maxDiscount({ price: 20, cogs: 0 }), 1);
});

test("break-even price", () => {
  near(B.breakEvenPrice(simple), 40);
  near(B.contribution({ ...shop, price: B.breakEvenPrice(shop) }), 0, 1e-9);
  assert.equal(B.breakEvenPrice({ price: 5, cogs: 0 }), 0);
  // refunds + fees eat 100 % of every extra unit of price: no price breaks even
  assert.equal(B.breakEvenPrice({ price: 5, cogs: 1, refundRate: 0.5, feeRate: 0.5 }), null);
});

test("break-even orders for fixed costs", () => {
  assert.equal(B.breakEvenOrders(6000, simple), 100);
  assert.equal(B.breakEvenOrders(6001, simple), 101);
  assert.equal(B.breakEvenOrders(0, simple), 0);
  assert.equal(B.breakEvenOrders(100, { price: 10, cogs: 12 }), Infinity);
});

test("discount table rows agree with the single functions", () => {
  const rows = B.discountTable(shop, [0, 0.1, 0.5, 1]);
  assert.equal(rows.length, 4);
  near(rows[1].price, 36);
  near(rows[1].contribution, 16.208);
  near(rows[1].volumeLiftNeeded, B.volumeLiftNeeded(shop, 0.1));
  assert.equal(rows[3].price, 0);
  assert.equal(rows[3].marginRate, null);
  assert.equal(rows[3].volumeLiftNeeded, Infinity);
});

test("bundle: sums items, discounts the total, pays order costs once", () => {
  const costs = { fulfillment: 4, feeRate: 0.029, feeFixed: 0.3 };
  const b = B.bundle({ items: [{ price: 40, cogs: 12 }, { price: 25, cogs: 6 }], discount: 0.15, ...costs });
  near(b.listPrice, 65);
  near(b.price, 55.25);
  near(b.cogs, 18);
  near(b.contribution, 55.25 - 18 - 4 - (55.25 * 0.029 + 0.3));
  const separate = B.contribution({ price: 40, cogs: 12, ...costs }) + B.contribution({ price: 25, cogs: 6, ...costs });
  near(b.separateOrdersContribution, separate);
  near(b.vsSeparate, b.contribution - separate);
});

test("bundle: quantities and zero discount beat separate orders by the saved order costs", () => {
  const b = B.bundle({ items: [{ price: 10, cogs: 3, qty: 3 }], fulfillment: 5, feeFixed: 0.3 });
  near(b.listPrice, 30);
  near(b.vsSeparate, 2 * (5 + 0.3));
});

test("bundle: 100 % discount", () => {
  const b = B.bundle({ items: [{ price: 10, cogs: 3 }], discount: 1 });
  near(b.contribution, -3);
  assert.equal(b.marginRate, null);
});

test("BOGO free: effective 50 % off, lift vs one full-price unit", () => {
  const r = B.buyXGetY({ price: 40, cogs: 12, buy: 1, get: 1, fulfillment: 4 });
  near(r.effectiveDiscount, 0.5);
  near(r.promo.contribution, 40 - 24 - 4);
  near(r.baseline.contribution, 40 - 12 - 4);
  near(r.ordersLiftNeeded, 24 / 12 - 1);
  near(r.contributionPerUnit, 6);
});

test("buy 2 get 1 half price", () => {
  const r = B.buyXGetY({ price: 30, cogs: 10, buy: 2, get: 1, getDiscount: 0.5 });
  near(r.effectiveDiscount, 0.5 / 3);
  near(r.promo.orderValue, 75);
  near(r.promo.contribution, 75 - 30);
  near(r.baseline.contribution, 60 - 20);
  near(r.ordersLiftNeeded, 40 / 45 - 1); // negative: bigger order already pays more
  assert.ok(r.ordersLiftNeeded < 0);
});

test("BOGO that loses money on every promo order", () => {
  const r = B.buyXGetY({ price: 10, cogs: 6, buy: 1, get: 1 });
  near(r.promo.contribution, -2);
  assert.equal(r.ordersLiftNeeded, Infinity);
  assert.equal(B.buyXGetY({ price: 10, cogs: 12, buy: 1, get: 1 }).ordersLiftNeeded, null);
});

test("invalid input throws RangeError", () => {
  const bad = [
    () => B.contribution({ price: -1, cogs: 1 }),
    () => B.contribution({ price: 10 }),
    () => B.contribution({ price: NaN, cogs: 1 }),
    () => B.contribution({ price: 10, cogs: 1, feeRate: 1 }),
    () => B.contribution({ price: 10, cogs: 1, refundRate: 1.1 }),
    () => B.contribution({ price: 10, cogs: 1, restockRate: -0.1 }),
    () => B.contribution(null),
    () => B.discountedPrice(10, 1.5),
    () => B.discountedPrice(10, -0.1),
    () => B.volumeLiftNeeded(simple, 2),
    () => B.bundle({ items: [] }),
    () => B.bundle({ items: [{ price: 1, cogs: 1, qty: -1 }] }),
    () => B.buyXGetY({ price: 10, cogs: 1, buy: 0, get: 1 }),
    () => B.buyXGetY({ price: 10, cogs: 1, buy: 1, get: 1.5 }),
    () => B.buyXGetY({ price: 10, cogs: 1, buy: 1, get: 1, getDiscount: 2 }),
    () => B.breakEvenOrders(-1, simple),
    () => B.profitAtRoas(simple, -1),
    () => B.marginToMarkup(1.2),
  ];
  for (const f of bad) assert.throws(f, RangeError, f.toString());
});

test("inputs are not mutated", () => {
  const o = { ...shop };
  B.applyDiscount(o, 0.2);
  B.maxDiscount(o);
  B.discountTable(o);
  assert.deepEqual(o, shop);
});
