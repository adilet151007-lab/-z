import 'dotenv/config';
import {createGameServer} from '../server.js';
import {createStore} from '../storage.js';
import {createLobbyRouter} from './account-server.mjs';

// This entry point deliberately ignores the live game's DATABASE_URL.
const publicOrigin = process.env.LOBBY_PUBLIC_ORIGIN || 'http://localhost:3000';
const lobbyRouter = createLobbyRouter({
  publicOrigin,
  sessionSecret:process.env.LOBBY_SESSION_SECRET,
  clientId:process.env.GOOGLE_CLIENT_ID,
  clientSecret:process.env.GOOGLE_CLIENT_SECRET,
  trustProxy:process.env.RENDER==='true'
});
const store=await createStore({databaseUrl:process.env.LOBBY_DATABASE_URL||null,stateFile:process.env.LOBBY_STATE_FILE||'./beta-lobby/data/game-state.json'});
const server = await createGameServer({lobbyRouter,store});
const port = await server.listen();
console.log('Beta lobby listening on port '+port+'.');
let stopping = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{
  if (stopping) return;
  stopping = true;
  try {await server.close();process.exitCode=0;} catch {process.exitCode=1;}
});
