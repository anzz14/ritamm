import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { toNumber2 } from "../../src/core/money.js";
import { loadAgentBData } from "../../src/pack/loadAgentBData.js";
import { loadCvpQ3 } from "../../src/pack/loadCvpQ3.js";
import { resolveAgentBData } from "../../src/pack/workbook.js";
import { reviewMarks } from "../../src/agentB/review.js";

const packDir = join(process.cwd(), "pack");

describe("review with supplied pack loaders", () => {
  it("flags the expected real companies in local currency", async () => {
    const q3 = await loadCvpQ3(packDir);
    const data = loadAgentBData(resolveAgentBData(packDir));
    const purchases = data.purchases.map((purchase) => ({ company: purchase.company, date: purchase.date, amount_usd: toNumber2(purchase.amount) }));
    const sales = data.sales.map((sale) => ({ company: sale.company, date: sale.date, proceeds_usd: toNumber2(sale.proceeds) }));
    const heldAtQ4 = new Set(q3.filter((position) => !sales.some((sale) => sale.company === position.company)).map((position) => position.company));
    purchases.forEach((purchase) => heldAtQ4.add(purchase.company));
    const result = reviewMarks({ q3, q4Marks: data.marks, heldAtQ4, purchases, sales, fxRate: "1.0666", thresholdPct: new Decimal("15") });
    const flags = new Map(result.entries.map((entry) => [entry.company, entry.flags]));
    expect(flags.get("Bluetarn Software Inc")).toContain("R1");
    expect(flags.get("Cedar Health Holdings")).toContain("R1");
    expect(flags.get("Harbor Analytics Inc")).toContain("R1");
    expect(flags.get("Delta Agritech Ltd")).toContain("R2");
    expect(flags.get("Ionmere Materials Ltd")).toContain("R3");
    expect(flags.get("Ember Retail GmbH")).toEqual([]);
    expect(flags.get("Fjord Payments AS")).toEqual([]);
  });
});
