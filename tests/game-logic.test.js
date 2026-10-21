import test from "node:test";
import assert from "node:assert/strict";
import { GameLogic, hashToken } from "../game-logic.js";

function fixture() {
  let now = 1000000;
  const game = new GameLogic(null, () => now);
  const a = game.joinTeam("saryarka", "Ернур"), b = game.joinTeam("saryarka", "Адлет");
  game.startRound("q1", 30);
  return { game, a, b, advance: ms => { now += ms; }, get round() { return game.state.round.id; } };
}
test("один игрок — один голос; повтор идемпотентен, выбор можно изменить", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  const revision = f.game.state.revision;
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  assert.deepEqual(f.game.votesFor("saryarka"), { 0: 1 });
  assert.equal(f.game.state.revision, revision);
  f.game.castVote("saryarka", f.a.player.pid, 2, f.round);
  assert.deepEqual(f.game.votesFor("saryarka"), { 2: 1 });
});
test("по таймеру правильное большинство засчитывается без ручной отправки", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.castVote("saryarka", f.b.player.pid, 0, f.round);
  f.advance(31000); f.game.resolveRound(); f.game.resolveRound();
  assert.equal(f.game.region("saryarka").points, 25);
  assert.equal(f.game.region("saryarka").economy, 100);
  assert.equal(f.game.state.round.submitted.saryarka, 0);
  assert.equal(f.game.region("jetisu").economy, 100);
});
test("пауза исключает время ожидания, в том числе после восстановления", () => {
  const f = fixture(); f.advance(10000); f.game.pauseRound();
  f.advance(60000);
  assert.equal(f.game.remainingMs(), 20000);
  const restarted = new GameLogic(f.game.state, f.game.now);
  assert.equal(restarted.remainingMs(), 20000);
  restarted.pauseRound(); f.advance(5000);
  assert.equal(restarted.remainingMs(), 15000);
});
test("лимит четыре человека; поддельный игрок и неправильный вариант отвергаются", () => {
  const f = fixture();
  f.game.joinTeam("saryarka", "Третий"); f.game.joinTeam("saryarka", "Четвёртый");
  assert.throws(() => f.game.joinTeam("saryarka", "Пятый"), /4\/4/);
  assert.throws(() => f.game.castVote("saryarka", "fake", 0, f.round));
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 7, f.round));
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, "old-round"));
});
test("равенство голосов требует обсуждения, по таймеру применяется один штраф", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.castVote("saryarka", f.b.player.pid, 1, f.round);
  assert.throws(() => f.game.teamSubmit("saryarka", f.a.player.pid, f.round), /поровну/);
  f.game.resolveRound(); f.game.resolveRound();
  assert.equal(f.game.region("saryarka").economy, 80);
  assert.equal(f.game.state.round.results.saryarka.reason, "tie");
});
test("во время паузы и после дедлайна нельзя голосовать или отправлять ответ", () => {
  const f = fixture(); f.game.pauseRound();
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, f.round));
  assert.throws(() => f.game.teamSubmit("saryarka", f.a.player.pid, f.round));
  f.game.pauseRound(); f.advance(31000);
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, f.round));
});
test("данные студента не содержат ключей, правильных и будущих ответов", () => {
  const f = fixture();
  const student = f.game.view({ playerHash: hashToken(f.a.playerToken) });
  assert.equal(student.viewer.player.name, "Ернур");
  assert.equal(student.questions.length, 0);
  assert.equal("correct" in student.round.question, false);
  assert.equal(JSON.stringify(student).includes("tokenHash"), false);
  assert.equal(JSON.stringify(student).includes("ballots"), false);
  assert.equal(f.game.view({ role: "teacher" }).questions[0].correct, 0);
  f.game.resolveRound();
  assert.equal(f.game.view().round.question.correct, 0);
});
test("удаление игрока освобождает слот и удаляет его неотправленный голос", () => {
  const f = fixture(); f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.leaveTeam("saryarka", f.a.player.pid);
  assert.deepEqual(f.game.votesFor("saryarka"), {});
  assert.equal(f.game.findPlayer(hashToken(f.a.playerToken)), null);
});
test("патч валидируется и требует актуальную ревизию", () => {
  const f = fixture();
  const patch = f.game.editorSnapshot(); patch.regions[0].points = 100;
  f.game.applyRawState(patch);
  assert.equal(f.game.region("saryarka").points, 100);
  assert.throws(() => f.game.applyRawState(patch), /изменилось/);
  const invalid = f.game.editorSnapshot(); invalid.regions[0].economy = -50;
  assert.throws(() => f.game.applyRawState(invalid));
  const editedActive = f.game.editorSnapshot(); editedActive.questions[0].correct = 2;
  assert.throws(() => f.game.applyRawState(editedActive), /Завершите/);
});
test("сброс сохраняет добавленные вопросы и инвалидирует игроков", () => {
  const f = fixture();
  f.game.addCustomQuestion("Новый вопрос?", ["Один", "Два", "Три", "Четыре"], 2, 25);
  f.game.resetGame();
  assert.equal(f.game.state.questions.length, 11);
  assert.equal(f.game.state.round, null);
  assert.equal(f.game.findPlayer(hashToken(f.a.playerToken)), null);
});
