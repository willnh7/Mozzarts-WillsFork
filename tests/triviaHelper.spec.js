import { expect } from "chai";
import { createTriviaQuestion, createResultEmbed, makeSongQuestion } from "../src/helpers/triviaHelper.js";
import { makeHint } from "../src/helpers/hintHelper.js";

describe("triviaHelper regression (the helper used by /trivia)", () => {
  it("createTriviaQuestion builds 4 buttons with stable numeric customIds", () => {
    const q = {
      question: "Test?",
      difficulty: "easy",
      points: 1,
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
    };

    const { actionRow } = createTriviaQuestion(q);
    expect(actionRow.components).to.have.lengthOf(4);

    actionRow.components.forEach((btn, idx) => {
      expect(btn.data.custom_id).to.equal(`trivia_answer_${idx}`);
      expect(btn.data.label).to.equal(q.options[idx]);
    });
  });

  it("makeSongQuestion (easy) falls back from missing artist to genre and includes type", async () => {
    const track = {
      artistName: "", // force artist invalid
      primaryGenreName: "Pop",
      trackName: "Some Song",
      collectionName: "Some Album",
      releaseDate: "2020-01-01",
    };

    const fakeOther = async () => ({
      artistName: "Other A",
      primaryGenreName: "Rock",
      trackName: "Other Song",
      collectionName: "Other Album",
      releaseDate: "2019-01-01",
    });

    const q = await makeSongQuestion(track, "easy", fakeOther);
    expect(q.difficulty).to.equal("easy");
    expect(q.points).to.equal(1);
    expect(q.type).to.equal("genre");
    expect(q.correctAnswer).to.equal("Pop");
    expect(q.options).to.have.lengthOf(4);
    expect(q.options).to.include("Pop");
  });

  it("makeSongQuestion (medium) falls back from missing album to title and includes type", async () => {
    const track = {
      collectionName: "", // force album invalid
      trackName: "Real Title",
      artistName: "Artist",
      primaryGenreName: "Hip Hop",
      releaseDate: "2021-06-06",
    };

    const fakeOther = async () => ({
      trackName: "Other Title",
      collectionName: "Other Album",
      artistName: "Other Artist",
      primaryGenreName: "Rock",
      releaseDate: "2018-01-01",
    });

    const q = await makeSongQuestion(track, "medium", fakeOther);
    expect(q.points).to.equal(2);
    expect(q.type).to.equal("title");
    expect(q.correctAnswer).to.equal("Real Title");
    expect(q.options).to.have.lengthOf(4);
    expect(q.options).to.include("Real Title");
  });

  it("makeSongQuestion (hard) with invalid year falls back to title", async () => {
    const track = {
      releaseDate: "not-a-date", // year getter => null
      trackName: "Fallback Title",
      artistName: "Artist",
      primaryGenreName: "Rock",
      collectionName: "Album",
    };

    const fakeOther = async () => ({
      releaseDate: "also-bad",
      trackName: "Other",
      artistName: "Other Artist",
      primaryGenreName: "Pop",
      collectionName: "Other Album",
    });

    const q = await makeSongQuestion(track, "hard", fakeOther);
    expect(q.points).to.equal(3);
    expect(q.type).to.equal("title");
    expect(q.correctAnswer).to.equal("Fallback Title");
    expect(q.options).to.have.lengthOf(4);
    expect(q.options).to.include("Fallback Title");
  });

  it("createResultEmbed marks correct vs wrong and keeps points text consistent", () => {
    const q = {
      question: "Q?",
      difficulty: "easy",
      points: 2,
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
      type: "title",
    };

    const user = { username: "Tester" };

    const correct = createResultEmbed(q, "A", user).toJSON();
    expect(correct.title).to.include("Correct");
    expect(correct.fields.find((f) => f.name === "Points Earned").value).to.include("+2");

    const wrong = createResultEmbed(q, "B", user).toJSON();
    expect(wrong.title).to.include("Wrong");
    expect(wrong.fields.find((f) => f.name === "Points Earned").value).to.include("+0");
  });

  it("makeHint uses type-specific hinting and is robust to missing fields", () => {
    const track = {
      artistName: "Adele",
      trackName: "Hello",
      collectionName: "25",
      primaryGenreName: "Pop",
      releaseDate: "2015-10-23",
    };

    expect(makeHint(track, "artist")).to.include("Artist starts with");
    expect(makeHint(track, "genre")).to.include("Genre starts with");
    expect(makeHint(track, "album")).to.include("Album starts with");
    expect(makeHint(track, "title")).to.include("Title starts with");
    expect(makeHint(track, "year")).to.include("Year of release starts with");

    // missing fields should not crash
    expect(makeHint({}, "artist")).to.be.a("string");
    expect(makeHint({}, "year")).to.be.a("string");
  });
});