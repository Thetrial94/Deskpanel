import timers from './time.js';
import meeting from './meeting.js';
import computer from './computer.js';
import remote from './remote.js';
import calendar from './calendar.js';
import home from './home.js';
import tv from './tv.js';
import overview from './overview.js';
import weather from './weather.js';
import music from './music.js';
import { createAgentScreen } from './agent.js';
import services from './services.js';
// Each screen owns mount(root, context) and returns a cleanup function.
// No screen owns navigation or the automatic rotation timer.
export const screens = [overview,weather,music,createAgentScreen('codex','Codex'),createAgentScreen('claude','Claude'),services,computer,remote,tv,calendar,home,timers,meeting];
export const screenById = new Map(screens.map(screen => [screen.id,screen]));
