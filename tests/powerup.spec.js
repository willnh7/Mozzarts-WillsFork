import { expect } from "chai";
import powerupCmd, { consumeFreeze } from "../src/commands/powerup.js";
import { makeMockInteraction } from "./testUtils.js";

describe("powerup regression", () => {
  it("grants freeze once and prevents stacking; consumeFreeze consumes exactly once", async () => {
    const g = "g_powerup_1";
    const u = "u_powerup_1";
    const interaction = makeMockInteraction({ guildId: g, userId: u });

    await powerupCmd.execute(interaction);
    expect(interaction.reply.calls).to.have.lengthOf(1);
    expect(interaction.reply.last[0].content).to.include("Freeze Time");

    // second time should be blocked
    await powerupCmd.execute(interaction);
    expect(interaction.reply.calls).to.have.lengthOf(2);
    expect(interaction.reply.last[0].content).to.include("already have");

    // consume once => true, then false
    expect(consumeFreeze(g, u)).to.equal(true);
    expect(consumeFreeze(g, u)).to.equal(false);
  });

  it("consumeFreeze returns false for unknown guild/user", () => {
    expect(consumeFreeze("g_missing", "u_missing")).to.equal(false);
  });
});