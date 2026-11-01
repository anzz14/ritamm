import { ValidationError } from "../core/errors.js";
import { toNumber2 } from "../core/money.js";
import type { Categorized } from "./llm/categorize.js";

export interface Purchase {
	company: string;
	date: string;
	amount_usd: number;
}

export interface Sale {
	company: string;
	date: string;
	proceeds_usd: number;
}

export interface DerivedTrades {
	purchases: Purchase[];
	sales: Sale[];
}

export function deriveTrades(categorized: Categorized[]): DerivedTrades {
	const purchases: Purchase[] = [];
	const sales: Sale[] = [];
	for (const row of categorized) {
		if (row.category === "investment_purchase") {
			if (!row.company) throw new ValidationError(`Purchase at index ${row.index} requires company`);
			purchases.push({ company: row.company, date: row.date, amount_usd: toNumber2(row.debit) });
		}
		if (row.category === "sale_proceeds") {
			if (!row.company) throw new ValidationError(`Sale at index ${row.index} requires company`);
			sales.push({ company: row.company, date: row.date, proceeds_usd: toNumber2(row.credit) });
		}
	}
	purchases.sort((left, right) => left.date.localeCompare(right.date));
	sales.sort((left, right) => left.date.localeCompare(right.date));
	return { purchases, sales };
}
