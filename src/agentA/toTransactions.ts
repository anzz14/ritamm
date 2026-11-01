import { ValidationError } from "../core/errors.js";
import { toNumber2 } from "../core/money.js";
import type { RawRow } from "./pdf/parseStatement.js";
import type { Categorized } from "./llm/categorize.js";

export interface Transaction {
	date: string;
	description: string;
	reference: string;
	debit: number;
	credit: number;
	balance: number;
	category: Categorized["category"];
	lp_code: string | null;
	company: string | null;
	categorized_by: Categorized["categorized_by"];
}

export function toTransactions(rows: RawRow[], categorized: Categorized[]): Transaction[] {
	const byIndex = new Map(categorized.map((item) => [item.index, item]));
	return rows.map((row, index) => {
		const category = byIndex.get(index);
		if (!category) throw new ValidationError(`Missing categorization for row ${index}`);
		return {
			date: row.date,
			description: row.description,
			reference: row.reference,
			debit: toNumber2(row.debit),
			credit: toNumber2(row.credit),
			balance: toNumber2(row.balance),
			category: category.category,
			lp_code: category.lp_code,
			company: category.company,
			categorized_by: category.categorized_by
		};
	});
}
