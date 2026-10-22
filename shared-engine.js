import { io } from "/socket.io/socket.io.esm.min.js";
export { REGIONS, SEAT_LIMIT, CRISIS_THRESHOLD, ECONOMY_PENALTY, RESOURCE_CAP, DEVELOPMENT_STAGES, developmentFor, MAX_TEAMS, MAX_TEAM_CAPACITY, metadataFor, mapRegionsFor, capacityFor, totalCapacity, CREATOR_TEAM_ID, isCreatorTeam, regularTeams } from "./game-config.js";

export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const getToken = key => { try { return sessionStorage.getItem(key) || undefined; } catch { return undefined; } };
const setToken = (key, value) => { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {} };
const creatorToken=()=>{try{return localStorage.getItem('cq_creator_session_v1')||undefined}catch{return undefined}};
const saveCreatorToken=value=>{try{if(value)localStorage.setItem('cq_creator_session_v1',value);else localStorage.removeItem('cq_creator_session_v1')}catch{}};

export class GameEngine {
  constructor(mode = "student") {
    this.mode = mode;
    this.state = null;
    this.connected = false;
    this.error = "";
    this.offset = 0;
    this.listeners = new Set();
    this.chatListeners=new Set();this.chatMeta=null;this.chatView=null;
    this.socket = io({ autoConnect: false, auth: callback => callback({ playerToken: mode === "student" ? creatorToken()||getToken("cq_player_token_v2") : undefined, teacherToken: mode === "teacher" ? getToken("cq_teacher_token_v2") : undefined }) });
    this.socket.on("connect", () => { this.connected = true; this.error = ""; this.emit(); });
    this.socket.on("disconnect", () => { this.connected = false; this.emit(); });
    this.socket.on("connect_error", () => { this.connected = false; this.error = "Не удалось подключиться к серверу. Повторяем…"; this.emit(); });
    this.socket.on("state", state => {
      const previous=this.state?.viewer,changed=previous?.role!==state.viewer.role||previous?.player?.pid!==state.viewer.player?.pid||previous?.player?.regionId!==state.viewer.player?.regionId;
      this.state = state;
      if(changed){this.chatMeta=null;this.chatView=null;this.emitChat()}
      this.offset = state.serverTime - Date.now();
      if (mode === "student" && !state.viewer.player) {setToken("cq_player_token_v2", null);saveCreatorToken(null)}
      if (mode === "teacher" && state.viewer.role !== "teacher") setToken("cq_teacher_token_v2", null);
      this.emit();
    });
    this.socket.on('chat:meta',meta=>{this.chatMeta=meta;this.emitChat()});
    this.socket.on('chat:view',view=>{this.chatView=view;this.emitChat()});
    this.socket.on('chat:message',event=>{if(this.chatView?.room!==event.room)return;const messages=this.chatView.messages.filter(m=>m.id!==event.message.id).concat(event.message).sort((a,b)=>a.sequence-b.sequence).slice(-(this.chatMeta?.historyLimit||80));this.chatView={...this.chatView,messages,latestSequence:event.latestSequence};this.emitChat()});
    this.socket.connect();
  }
  onChange(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  onChat(listener){this.chatListeners.add(listener);listener(this.chatMeta,this.chatView);return()=>this.chatListeners.delete(listener)}
  emitChat(){for(const fn of this.chatListeners)fn(this.chatMeta,this.chatView)}
  subscribeChat(room){return this.request('chatSubscribe',{room})}
  sendChat(room,text,clientId){return this.request('chatSend',{room,text,clientId})}
  deleteChatMessage(messageId){return this.request('chatDelete',{messageId})}
  request(event, data = {}) {
    if (!this.connected) return Promise.reject(new Error("Нет связи с сервером. Дождитесь подключения."));
    return new Promise((resolve, reject) => this.socket.timeout(20000).emit(event, data, (error, response) => {
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
    saveCreatorToken(result.isCreator?result.playerToken:null);
    return result;
  }
  async teacherLogin(password) {
    const result = await this.request("teacherLogin", { password });
    setToken("cq_teacher_token_v2", result.teacherToken);
    return result;
  }
  async teacherLogout() { await this.request("teacherLogout"); setToken("cq_teacher_token_v2", null); }
  async leaveTeam() { await this.request("leaveTeam"); setToken("cq_player_token_v2", null);saveCreatorToken(null); }
  castVote(optionIdx) { return this.request("castVote", { optionIdx, roundId: this.state?.round?.id }); }
  teamSubmit() { return this.request("teamSubmit", { roundId: this.state?.round?.id }); }
  freeSlot(regionId, pid) { return this.request("freeSlot", { regionId, pid }); }
  startRound(questionId, duration) { return this.request("startRound", { questionId, duration }); }
  switchQuestion(questionId,duration) { return this.request("switchQuestion",{questionId,duration}); }
  pauseRound() { return this.request("pauseRound"); }
  resetTimer() { return this.request("resetTimer"); }
  resolveRound() { return this.request("resolveRound"); }
  endRound() { return this.request("endRound"); }
  adjustPoints(regionId, delta) { return this.request("adjustPoints", { regionId, delta }); }
  adjustEconomy(regionId, delta) { return this.request("adjustEconomy", { regionId, delta }); }
  addCustomQuestion(text, options, correctIdx, points) { return this.request("addCustomQuestion", { text, options, correctIdx, points }); }
  createTeam(name, baseRegionId, capacity, points, economy) { return this.request("createTeam",{name,baseRegionId,capacity,points,economy}); }
  expandTeams(count) { return this.request("expandTeams",{count}); }
  async planTeamCount(count) { return (await this.request("planTeamCount",{count})).plan; }
  setTeamCount(count,layoutToken) { return this.request("setTeamCount",{count,layoutToken}); }
  setTeamCapacity(teamId,capacity) { return this.request("setTeamCapacity",{teamId,capacity}); }
  setAllCapacities(capacity) { return this.request("setAllCapacities",{capacity}); }
  updateTeam(teamId,changes) { return this.request("updateTeam",{teamId,changes}); }
  movePlayer(pid,toTeamId) { return this.request("movePlayer",{pid,toTeamId}); }
  renamePlayer(pid,name) { return this.request("renamePlayer",{pid,name}); }
  updatePlayer(pid,name,toTeamId) { return this.request("updatePlayer",{pid,name,toTeamId}); }
  renameTeam(teamId,name,baseRegionId) { return this.request("renameTeam",{teamId,name,baseRegionId}); }
  removeTeam(teamId) { return this.request("removeTeam",{teamId}); }
  editQuestion(questionId,question,version) { return this.request("editQuestion",{questionId,question,version}); }
  deleteQuestion(questionId) { return this.request("deleteQuestion",{questionId}); }
  importQuestions(questions) { return this.request("importQuestions",{questions}); }
  async analyzeSyllabus(text) { return this.request("analyzeSyllabus",{text}); }
  async generateQuestions(text,topics,count) { return this.request("generateQuestions",{text,topics,count}); }
  resetGame() { return this.request("resetGame"); }
  applyRawState(snapshot) { return this.request("applyRawState", snapshot); }
  async getSnapshot() { return (await this.request("getSnapshot")).snapshot; }
  getHotfixBackup() { return this.request("getHotfixBackup"); }
  async exportSummary() { return (await this.request("exportSummary")).rows; }
}
