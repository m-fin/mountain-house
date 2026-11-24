import { defaultState, allDone } from '../game.mjs';
import { chooseBed, taskSignature } from '../audio.mjs';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const s = defaultState();
assert(chooseBed(s) === 'porch_sunset', 'default sunset boot bed, got ' + chooseBed(s));

s.timeOfDay = 0.5;
s.player.x = 10; s.player.z = 14;
assert(chooseBed(s) === 'explore_day', 'day meadow, got ' + chooseBed(s));

s.timeOfDay = 0.08;
assert(chooseBed(s) === 'stargazing', 'starry night outdoors, got ' + chooseBed(s));

s.timeOfDay = 0.1;
s.player.x = 0; s.player.z = -1;
s.tasks.fire.lit = true;
assert(chooseBed(s) === 'hearth_night', 'lit hearth at night, got ' + chooseBed(s));

s.timeOfDay = 0.28;
s.player.x = 6.15; s.player.z = 3.1;
s.tasks.fire.lit = false;
assert(chooseBed(s) === 'garden_morning', 'garden in the morning, got ' + chooseBed(s));

s.near = 'porch';
s.hold = 1;
s.timeOfDay = 0.73;
s.player.x = -1.15; s.player.z = 4.15;
assert(chooseBed(s) === 'fixing_up', 'holding a task, got ' + chooseBed(s));

s.hold = 0;
s.near = null;
s.tasks.porch.done = true;
s.tasks.garden.planted = true;
s.tasks.garden.watered = true;
s.tasks.fire.lit = true;
s.complete = allDone(s);
assert(s.complete && chooseBed(s) === 'together', 'all done, got ' + chooseBed(s));

assert(taskSignature(s) === '1111', 'signature ' + taskSignature(s));
console.log('AUDIO LOGIC OK');
