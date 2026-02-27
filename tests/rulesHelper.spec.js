import { expect } from "chai";
import { getRules } from "../src/helpers/rulesHelper.js";

describe("rulesHelper regression", () => {
  it("loads rules.json and includes expected fields", () => {
    const rules = getRules();
    expect(rules).to.be.an("object");
    expect(rules).to.have.property("intro");
    expect(rules).to.have.property("difficulties");
    expect(rules).to.have.property("gameplay");

    expect(rules.difficulties).to.be.an("array").that.is.not.empty;
    expect(rules.gameplay).to.be.an("array").that.is.not.empty;
  });
});