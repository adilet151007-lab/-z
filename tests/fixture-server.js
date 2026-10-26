// Unrelated regression tests use the public demo bank and an open local classroom.
// Security simulations import the production factory directly and exercise its secure defaults.
import {createGameServer as createProductionServer} from '../server.js';
export const createGameServer=options=>createProductionServer({requireAdmission:false,allowDemoQuestions:true,...options});
