import assert from "assert";

describe("Basic Math Regression", () => {
  it("should never break core math", () => {
    assert.strictEqual(2 + 2, 4);
  });
});