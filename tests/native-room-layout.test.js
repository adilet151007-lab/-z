import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStudio,normalizeStudio,publicStudio} from '../studio-schema.js';
test('normal rooms retain the native ERADIS interface; custom layout requires explicit consent and round-trips',()=>{
  const doc=defaultStudio();assert.equal(doc.settings.customLayout,false);
  delete doc.settings.customLayout;
  assert.equal(normalizeStudio(doc).settings.customLayout,false);
  assert.equal(publicStudio(normalizeStudio(doc),true).settings.customLayout,false);
  doc.settings.customLayout=true;
  const restored=normalizeStudio(JSON.parse(JSON.stringify(doc)));
  assert.equal(restored.settings.customLayout,true);
  assert.equal(publicStudio(restored,true).settings.customLayout,true);
  assert.equal(restored.roomUiLayout.teacher.length,doc.roomUiLayout.teacher.length);
});
