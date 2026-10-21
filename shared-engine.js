import { io } from "/socket.io/socket.io.esm.min.js";
export { REGIONS, SEAT_LIMIT, CRISIS_THRESHOLD, ECONOMY_PENALTY } from "./game-config.js";

export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const getToken = key => { try { return sessionStorage.getItem(key) || undefined; } catch { return undefined; } };
const setToken = (key, value) => { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {} };

export class GameEngine {
  constructor(mode = "student") {
    this.mode = mode;
    this.state = null;
    this.connected = false;
    this.error = "";
    this.offset = 0;
    this.listeners = new Set();
    this.socket = io({ autoConnect: false, auth: callback => callback({ playerToken: mode === "student" ? getToken("cq_player_token_v2") : undefined, teacherToken: mode === "teacher" ? getToken("cq_teacher_token_v2") : undefined }) });
    this.socket.on("connect", () => { this.connected = true; this.error = ""; this.emit(); });
    this.socket.on("disconnect", () => { this.connected = false; this.emit(); });
    this.socket.on("connect_error", () => { this.connected = false; this.error = "Не удалось подключиться к серверу. Повторяем…"; this.emit(); });
    this.socket.on("state", state => {
      this.state = state;
      this.offset = state.serverTime - Date.now();
      if (mode === "student" && !state.viewer.player) setToken("cq_player_token_v2", null);
      if (mode === "teacher" && state.viewer.role !== "teacher") setToken("cq_teacher_token_v2", null);
      this.emit();
    });
    this.socket.connect();
  }
  onChange(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  request(event, data = {}) {
    if (!this.connected) return Promise.reject(new Error("Нет связи с сервером. Дождитесь подключения."));
    return new Promise((resolve, reject) => this.socket.timeout(12000).emit(event, data, (error, response) => {
      if (error) { reject(new Error("Сервер не подтвердил действие. Проверьте состояние перед повтором.")); return; }
      if (!response?.ok) {
        if (response?.code === "FORBIDDEN" && this.mode === "teacher") { setToken("cq_teacher_token_v2", null); this.socket.disconnect().connect(); }
        reject(new Error(response?.error || "Действие не выполнено.")); return;
      }
      resolve(response);
    }));
  }
  allQuestions() { return this.state?.questions || []; }
  remainingSeconds() {
    const round = this.state?.round;
    if (!round || round.resolved) return 0;
    return Math.max(0, Math.ceil((round.paused ? round.remainingMs : round.deadline - (Date.now() + this.offset)) / 1000));
  }
  async joinTeam(regionId, name) {
    const result = await this.request("joinTeam", { regionId, name });
    setToken("cq_player_token_v2", result.playerToken);
    return result;
  }
  async teacherLogin(password) {
    const result = await this.request("teacherLogin", { password });
    setToken("cq_teacher_token_v2", result.teacherToken);
    return result;
  }
  async teacherLogout() { await this.request("teacherLogout"); setToken("cq_teacher_token_v2", null); }
  async leaveTeam() { await this.request("leaveTeam"); setToken("cq_player_token_v2", null); }
  castVote(optionIdx) { return this.request("castVote", { optionIdx, roundId: this.state?.round?.id }); }
  teamSubmit() { return this.request("teamSubmit", { roundId: this.state?.round?.id }); }
  freeSlot(regionId, pid) { return this.request("freeSlot", { regionId, pid }); }
  startRound(questionId, duration) { return this.request("startRound", { questionId, duration }); }
  pauseRound() { return this.request("pauseRound"); }
  resetTimer() { return this.request("resetTimer"); }
  resolveRound() { return this.request("resolveRound"); }
  endRound() { return this.request("endRound"); }
  adjustPoints(regionId, delta) { return this.request("adjustPoints", { regionId, delta }); }
  adjustEconomy(regionId, delta) { return this.request("adjustEconomy", { regionId, delta }); }
  addCustomQuestion(text, options, correctIdx, points) { return this.request("addCustomQuestion", { text, options, correctIdx, points }); }
  resetGame() { return this.request("resetGame"); }
  applyRawState(snapshot) { return this.request("applyRawState", snapshot); }
  async getSnapshot() { return (await this.request("getSnapshot")).snapshot; }
  async exportSummary() { return (await this.request("exportSummary")).rows; }
}
