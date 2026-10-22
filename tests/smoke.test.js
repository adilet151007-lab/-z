import test from "node:test";
import assert from "node:assert/strict";
import { GameLogic, GameError, hashToken } from "../game-logic.js";

const firstQuestion = game => game.state.questions[0];

test("новая игра содержит базовые команды и банк вопросов", () => {
  const game = new GameLogic();
  assert.equal(game.state.phase, "lobby");
  assert.equal(game.state.regions.length, 4);
  assert.ok(game.state.questions.length >= 10);
});

test("универсальный формат создаёт десять областей с четырьмя местами", () => {
  const game = new GameLogic();
  game.enableUniversal();
  assert.equal(game.state.settings.mode, "team");
  assert.equal(game.state.regions.length, 10);
  assert.ok(game.state.regions.every(team => team.capacity === 4));
});

test("обычная команда не принимает пятого участника", () => {
  const game = new GameLogic();
  for (let i = 0; i < 4; i += 1) game.joinTeam("saryarka", `Игрок ${i + 1}`);
  assert.throws(() => game.joinTeam("saryarka", "Лишний игрок"), error => error instanceof GameError && error.code === "TEAM_FULL");
});

test("создатель может войти в заполненную область сверх обычного лимита", () => {
  const game = new GameLogic();
  game.enableUniversal();
  for (let i = 0; i < 4; i += 1) game.joinTeam("saryarka", `Участник ${i + 1}`);
  const joined = game.joinCreator("ernur", "saryarka");
  assert.equal(joined.isCreator, true);
  assert.equal(game.region("saryarka").members.length, 5);
});

test("правильный командный ответ начисляет 25 ресурсов", () => {
  const game = new GameLogic();
  game.enableUniversal();
  const joined = game.joinTeam("saryarka", "Алия");
  const question = firstQuestion(game);
  game.startRound(question.id, 30);
  const roundId = game.state.round.id;
  game.castVote("saryarka", joined.player.pid, question.correct, roundId);
  game.confirmVote("saryarka", joined.player.pid, joined.player.pid, roundId);
  game.teamSubmit("saryarka", joined.player.pid, roundId);
  game.resolveRound();
  assert.equal(game.region("saryarka").points, 25);
});

test("ошибочный ответ снижает экономику, но не ниже 15 процентов", () => {
  const game = new GameLogic();
  game.enableUniversal();
  const joined = game.joinTeam("saryarka", "Бек");
  const question = firstQuestion(game);
  game.region("saryarka").economy = 20;
  game.startRound(question.id, 30);
  const roundId = game.state.round.id;
  game.castVote("saryarka", joined.player.pid, (question.correct + 1) % 4, roundId);
  game.confirmVote("saryarka", joined.player.pid, joined.player.pid, roundId);
  game.teamSubmit("saryarka", joined.player.pid, roundId);
  game.resolveRound();
  assert.equal(game.region("saryarka").economy, 15);
});

test("solo-режим начисляет личный капитал без изменения экономики команды", () => {
  const game = new GameLogic();
  game.enableUniversal();
  game.setGameMode("solo");
  const joined = game.joinTeam("saryarka", "Вика");
  const question = firstQuestion(game);
  game.startRound(question.id, 30);
  const roundId = game.state.round.id;
  game.castVote("saryarka", joined.player.pid, question.correct, roundId);
  game.teamSubmit("saryarka", joined.player.pid, roundId);
  game.resolveRound();
  const player = game.state.regions.flatMap(team => team.members).find(member => member.pid === joined.player.pid);
  assert.equal(player.capital, 25);
  assert.equal(game.state.regions[0].economy, 100);
});

test("активный вопрос нельзя изменить через JSON-патч", () => {
  const game = new GameLogic();
  game.enableUniversal();
  const question = firstQuestion(game);
  game.startRound(question.id, 30);
  const raw = game.editorSnapshot();
  raw.questions[0].text = "Изменённый текст во время раунда";
  assert.throws(() => game.applyRawState(raw), /текущего раунда|текущий раунд/i);
});

test("правильный ответ виден преподавателю, но скрыт у гостя", () => {
  const game = new GameLogic();
  game.enableUniversal();
  const question = firstQuestion(game);
  game.startRound(question.id, 30);
  const teacherView = game.view({ role: "teacher" });
  const guestView = game.view();
  assert.equal(teacherView.round.question.correct, question.correct);
  assert.equal(Object.hasOwn(guestView.round.question, "correct"), false);
});

test("сброс обнуляет прогресс, но сохраняет банк вопросов и сессию создателя", () => {
  const game = new GameLogic();
  game.enableUniversal();
  const joined = game.joinCreator("adilet", "saryarka");
  const questionCount = game.state.questions.length;
  game.adjustPoints("saryarka", 250);
  game.resetGame();
  assert.equal(game.state.questions.length, questionCount);
  assert.equal(game.region("saryarka").points, 0);
  assert.equal(game.findPlayer(hashToken(joined.playerToken)).creatorId, "adilet");
});
