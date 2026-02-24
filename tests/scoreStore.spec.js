import assert from "assert";

describe("ScoreStore Regression Test", () => {
  it("should add scores correctly", () => {
    const scores = {};
    function addScore(user, amount) {
      if (!scores[user]) scores[user] = 0;
      scores[user] += amount;
    }

    addScore("Jayden", 5);
    addScore("Jayden", 10);

    assert.strictEqual(scores["Jayden"], 15);
  });
});