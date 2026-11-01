import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadFx } from "../../src/config/fx.js";
import { getEnv } from "../../src/config/env.js";
import { ValidationError } from "../../src/core/errors.js";

const baseEnv = {
  LLM_BASE_URL: "https://example.com/v1",
  LLM_MODEL: "test-model"
};

describe("configuration", () => {
  it("applies defaults while accepting injected values", () => {
    const env = getEnv({ ...baseEnv, LLM_API_KEY: undefined });
    expect(env.AGENT_A_PORT).toBe(8001);
    expect(env.AGENT_B_PORT).toBe(8002);
    expect(env.PACK_DIR).toBe("./pack");
    expect(env.OUTPUT_DIR).toBe("./output");
    expect(env.THRESHOLD_PCT).toBe(15);
  });

  it("rejects an invalid port with a readable typed error", () => {
    expect(() => getEnv({ ...baseEnv, AGENT_A_PORT: "not-a-port" })).toThrow(ValidationError);
    expect(() => getEnv({ ...baseEnv, AGENT_A_PORT: "not-a-port" })).toThrow(/AGENT_A_PORT/);
  });

  it("loads and validates the checked-in FX rate", () => {
    const fx = loadFx(join(process.cwd(), "config", "fx-rates.json"));
    expect(fx).toEqual({
      rate: "1.0666",
      rateDate: "2022-12-30",
      source: "https://www.ecb.europa.eu/stats/exchange/eurofxref/shared/pdf/2022/12/20221230.pdf"
    });
  });
});