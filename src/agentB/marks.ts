import { toNumber2 } from "../core/money.js";
import type { AgentBData } from "../pack/loadAgentBData.js";

export interface MarksArtifact {
  artifactId: string;
  fund: string;
  valuation_date: string;
  marks: Array<{
    company: string;
    currency: string;
    fair_value: number;
    valuation_method: string;
    valuation_date: string;
  }>;
  notes: AgentBData["notes"];
}

export function buildMarksArtifact(agentBData: AgentBData): MarksArtifact {
  return {
    artifactId: `marks-${agentBData.fundCode}-${agentBData.valuationDate}`,
    fund: agentBData.fundName,
    valuation_date: agentBData.valuationDate,
    marks: agentBData.marks.map((mark) => ({
      company: mark.company,
      currency: mark.currency,
      fair_value: toNumber2(mark.fairValue),
      valuation_method: mark.method,
      valuation_date: mark.valuationDate
    })),
    notes: agentBData.notes
  };
}