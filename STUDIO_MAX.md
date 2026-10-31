# ERADIS Studio Max

Studio uses the existing ERADIS game engine. Student and teacher pages remain separate.

## Entry points

- Accounts beta: Creator cabinet → Game builder; room settings → Appearance.
- Standalone game: the protected `studio.html` page, linked from the creator session. Teacher and guest accounts cannot read or write Studio documents.

## Authoring

The same viewport switches between game flow and room layout. Flow contains question cards, topic frames, economy triggers, defense checkpoints, media and connectors. Layout positions the original room widgets for teacher, projector and student surfaces. Mobile drawers, pointer panning, pinch zoom, long press, selection, resize, rotation, snapping, grouping and 50-step history are supported.

Question routes use `next`, `correct` and `wrong` edges. A configured team determines a branch; otherwise the majority of submitted answers does. Ties and no submitted answers take the wrong branch. Cycles are rejected. Defense checkpoints require a teacher command to continue. Existing scoring limits, recovery rules, achievements and city evolution remain authoritative.

PDF/DOCX/TXT input reuses the local syllabus generator. Generated topics become frames and questions become connected cards. Incomplete drafts stay editable and cannot be applied to the live game until complete. The runtime keeps its existing requirement of four distinct options and one correct answer. Original option order and provided answers are retained by the import module.

## Persistence and compatibility

`canvasData` is validated on the server and included in native game snapshots and backups. Questions are compiled to the standard bank format with stable IDs. Applying a changed flow requires the active round to finish; a layout-only update preserves the running round and match. Native teacher edits update already placed question cards. Other subject banks are preserved. Standalone presentation settings are restored with snapshots.

Local drafts and JSON import/export are available. Live resource widgets refresh from the room without replacing local authoring work. Concurrent game changes may require saving again; Studio does not provide simultaneous collaborative document editing.

Private question data is never included in the student layout payload. Embedded media is served separately and checked against the viewer's access, avoiding repeated image payloads in state broadcasts.

## Limits

- Up to 100 playable cards, 400 elements per canvas, 800 connectors; document maximum approximately 2 MB.
- Existing game limits remain: 30 teams, 20 seats per team and the game's overall participant limit.
- Images: embedded PNG/JPEG/WebP up to 300 KB each. Syllabus input: 10 MB, 120,000 text characters; scanned PDFs need an existing text layer/OCR.
- The canvas is viewport-culled. A local Chromium check with 183 objects rendered only visible objects; this does not establish performance on every phone.

## Verification

```sh
node beta-lobby/build.mjs
node --test tests/smoke.test.js tests/syllabus.test.js tests/studio.test.js tests/studio-server.test.js beta-lobby/tests/authoring.test.mjs beta-lobby/tests/studio.test.mjs
```

The accounts branch passed 47 automated checks. The main branch was checked against its own server and legacy game tests. Actual Chromium sessions covered inline editing, server saving, projector simulation, mobile drawers, frame dragging with a locked child, resize, protected Backspace, pinch zoom and long press. A physical iPhone/Safari has not been tested.

Production deployment is pending review; this change does not trigger a deployment by updating the existing production branches.
