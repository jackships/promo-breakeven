#!/usr/bin/env node
// Usage: node examples/cli.js --price 40 --cogs 12 [--fulfillment 4] [--feeRate 0.029] [--feeFixed 0.3]
//        [--refundRate 0.08] [--restockRate 0.7] [--returnCost 3] [--shippingCharged 0]
import * as B from "../src/index.js";

const args = process.argv.slice(2);
const order = {};
for (let i = 0; i < args.length; i += 2) order[args[i].replace(/^--/, "")] = Number(args[i + 1]);
if (order.price === undefined) Object.assign(order, { price: 40, cogs: 12, fulfillment: 4, feeRate: 0.029, feeFixed: 0.3, refundRate: 0.08, restockRate: 0.7, returnCost: 3 });

const money = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const pct = (v) => (v === null ? "n/a" : Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "never");

try {
  const b = B.breakdown(order);
  console.log("Order:", JSON.stringify(order));
  console.log(`Contribution per order   ${money(b.contribution)}  (${pct(b.marginRate)} of price)`);
  console.log(`Break-even CPA           ${money(B.breakEvenCpa(order))}`);
  console.log(`Break-even ROAS          ${money(B.breakEvenRoas(order))}`);
  console.log(`Break-even price         ${money(B.breakEvenPrice(order))}`);
  console.log(`Max discount (no loss)   ${pct(B.maxDiscount(order))}`);
  console.log("\nDiscount  Price   Contribution  Extra orders needed");
  for (const r of B.discountTable(order)) {
    console.log(`${pct(r.discount).padStart(7)}  ${money(r.price).padStart(6)}  ${money(r.contribution).padStart(12)}  ${pct(r.volumeLiftNeeded).padStart(10)}`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
