import { expect } from "chai";
import {
  resetScores,
  addPoints,
  getUserPoints,
  getUserAllTimePoints,
  getGuildScoresSorted,
  getTotalScore,
} from "../src/helpers/scoreStore.js";

describe("scoreStore regression", () => {
  it("returns 0 for unknown guild/user", () => {
    expect(getUserPoints("g_unknown", "u_unknown")).to.equal(0);
    expect(getUserAllTimePoints("g_unknown", "u_unknown")).to.equal(0);
    expect(getTotalScore("g_unknown")).to.equal(0);
    expect(getGuildScoresSorted("g_unknown")).to.deep.equal([]);
  });

  it("addPoints increments both current and all-time totals", () => {
    const g = "g_add_1";
    const u = "u_add_1";

    addPoints(g, u, 2);
    addPoints(g, u, 3);

    expect(getUserPoints(g, u)).to.equal(5);
    expect(getUserAllTimePoints(g, u)).to.equal(5);
    expect(getTotalScore(g)).to.equal(5);
  });

  it("resetScores resets current score but preserves all-time score", () => {
    const g = "g_reset_1";
    const u = "u_reset_1";

    addPoints(g, u, 4);
    expect(getUserPoints(g, u)).to.equal(4);
    expect(getUserAllTimePoints(g, u)).to.equal(4);

    resetScores(g);
    expect(getUserPoints(g, u)).to.equal(0);
    expect(getUserAllTimePoints(g, u)).to.equal(4);
  });

  it("getGuildScoresSorted sorts descending by points", () => {
    const g = "g_sort_1";
    resetScores(g);

    addPoints(g, "u1", 1);
    addPoints(g, "u2", 5);
    addPoints(g, "u3", 3);

    const sorted = getGuildScoresSorted(g);
    expect(sorted.map(([uid]) => uid)).to.deep.equal(["u2", "u3", "u1"]);
    expect(sorted.map(([, pts]) => pts)).to.deep.equal([5, 3, 1]);
  });

  it("getTotalScore sums all current user scores", () => {
    const g = "g_total_1";
    resetScores(g);

    addPoints(g, "a", 2);
    addPoints(g, "b", 7);
    addPoints(g, "c", 1);

    expect(getTotalScore(g)).to.equal(10);
  });
});