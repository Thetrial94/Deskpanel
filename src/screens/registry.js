import computer from './computer.js';
import remote from './remote.js';
import calendar from './calendar.js';
import home from './home.js';
import breaks from './breaks.js';
import overview from './overview.js';
import clock from './clock.js';
import weather from './weather.js';
import music from './music.js';
import { createAgentScreen } from './agent.js';
import focus from './focus.js';
import services from './services.js';
// Each screen owns mount(root, context) and returns a cleanup function.
// No screen owns navigation or the automatic rotation timer.
export const screens = [overview,clock,weather,music,createAgentScreen('codex','Codex'),createAgentScreen('claude','Claude'),focus,services,computer,remote,calendar,home,breaks];
export const screenById = new Map(screens.map(screen => [screen.id,screen]));
