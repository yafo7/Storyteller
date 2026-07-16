# UI and Interaction Specification

## Support required product states

Implement title, loading, play, pause, save/resume, ending, and recoverable-error states. Within play, distinguish performance, exploration, conversation, inspection, choice, and transition. Prevent input intended for one state from leaking into another.

## Use a unified context action

Provide one remappable primary interaction action and show the specific verb:

- Talk
- Inspect
- Read
- Take
- Use
- Give
- Continue

Choose focus using reachability, distance, facing, and line of sight. Highlight the selected target. When valid targets overlap, allow focus cycling and never trigger an unseen nearest target.

## Present performance text

- Autoplay staged dialogue by default.
- Provide pause/resume, transcript history, text speed, and skip-seen controls.
- Keep speaker identity and direction legible without obscuring actors.
- Preserve authored pauses and interruptions; do not require confirmation after every line.
- Keep choices open until selected unless urgency is narratively required and accessible alternatives exist.

## Present exploration and evidence

Show a subtle current objective and a clear route back to the performance. Organize the journal into people, places, objects, events, and contradictions. Mark entries as testimony, evidence, inference, or confirmed fact. Hide undiscovered entries and post-reveal interpretations.

## Provide accessibility

Include:

- Keyboard and controller remapping
- Font size and text-speed controls
- High-contrast focus and captions
- Independent voice, music, ambience, and effects volume
- Reduced motion, camera shake, flashes, and hold-input requirements
- Directional sound captions when audio carries required information

Never encode a required clue only by color, sound, rapid timing, or small text.

## Build a director console for development

Expose behind a development flag:

- Current scene, beat, cue, flags, facts, and prop states
- Character knowledge and beliefs
- Stage anchors, navigation paths, collision, focus, and interaction ranges
- Jump-to-beat, step, replay-cue, save-state, and reset controls
- Timeout/fallback logs, low-confidence source spans, and missing assets

Keep the console unavailable in production builds unless explicitly requested.

## Verify layout

Inspect at minimum a small laptop viewport and the target viewport. Check safe areas, text wrapping, long names, CJK line breaks, choice overflow, subtitle contrast, focus clarity, and scene transitions. Verify play without a mouse when keyboard control is promised.
