import { expect } from "chai";
import { MessageFlags } from "discord.js";
import interactionCreate from "../src/events/interactionCreate.js";
import { makeSpy } from "./testUtils.js";

describe("interactionCreate regression", () => {
  it("replies ephemeral on command failure if not deferred/replied", async () => {
    const reply = makeSpy();
    const editReply = makeSpy();

    const client = {
      commands: new Map([
        [
          "boom",
          {
            execute: async () => {
              throw new Error("fail");
            },
          },
        ],
      ]),
    };

    const interaction = {
      isChatInputCommand: () => true,
      commandName: "boom",
      client,
      deferred: false,
      replied: false,
      reply,
      editReply,
    };

    await interactionCreate.execute(interaction);

    expect(reply.calls).to.have.lengthOf(1);
    expect(reply.last[0].content).to.equal("❌ Failed");
    expect(reply.last[0].flags).to.equal(MessageFlags.Ephemeral);
    expect(editReply.calls).to.have.lengthOf(0);
  });

  it("editReply on command failure if deferred or already replied", async () => {
    const reply = makeSpy();
    const editReply = makeSpy();

    const client = {
      commands: new Map([
        [
          "boom",
          {
            execute: async () => {
              throw new Error("fail");
            },
          },
        ],
      ]),
    };

    const interaction = {
      isChatInputCommand: () => true,
      commandName: "boom",
      client,
      deferred: true,
      replied: false,
      reply,
      editReply,
    };

    await interactionCreate.execute(interaction);

    expect(editReply.calls).to.have.lengthOf(1);
    // editReply("❌ Failed") => spy stores args array: ["❌ Failed"]
    expect(editReply.last).to.deep.equal(["❌ Failed"]);
    expect(reply.calls).to.have.lengthOf(0);
  });

  it("ignores non-chat-input interactions", async () => {
    const reply = makeSpy();

    const interaction = {
      isChatInputCommand: () => false,
      reply,
      client: { commands: new Map() },
    };

    await interactionCreate.execute(interaction);
    expect(reply.calls).to.have.lengthOf(0);
  });
});