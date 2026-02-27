import { expect } from "chai";
import {
  activeSessions,
  guildPrefs,
  getGenre,
  setGenre,
  getSession,
  setSession,
  clearSession,
  terminateSession,
} from "../src/gameState.js";

describe("gameState regression", () => {
  beforeEach(() => {
    activeSessions.clear();
    guildPrefs.clear();
  });

  it("getGenre defaults to random", () => {
    expect(getGenre("g1")).to.equal("random");
  });

  it("setGenre persists per guild", () => {
    setGenre("g1", "pop");
    setGenre("g2", "rock");
    expect(getGenre("g1")).to.equal("pop");
    expect(getGenre("g2")).to.equal("rock");
  });

  it("session set/get/clear works", () => {
    const g = "g_session";
    expect(getSession(g)).to.equal(null);

    setSession(g, { active: true, round: 1 });
    expect(getSession(g)).to.deep.include({ active: true, round: 1 });

    clearSession(g);
    expect(getSession(g)).to.equal(null);
  });

  it("terminateSession marks session inactive and terminated", () => {
    const g = "g_term";
    setSession(g, { active: true, terminated: false });

    terminateSession(g);

    const s = getSession(g);
    expect(s.active).to.equal(false);
    expect(s.terminated).to.equal(true);
  });
});