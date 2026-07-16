# Gameplay Design Rules

## Consequence channels

Count a consequence only when the player can perceive or later use it:

- knowledge or interpretation
- possession or resource
- position or traversal
- access or topology
- relationship or actor intent
- danger or safety
- audiovisual world state
- time, schedule, or world layer

Text that merely describes an unchanged state does not count as a second consequence.

## Interaction grammar

Prefer a stable vocabulary:

- inspect, read, talk, listen
- take, drop, give, combine, equip
- open, close, pull, push, move, conceal, reveal
- light, extinguish, tune, interrupt, wait
- enter, leave, follow, avoid, switch layer

Effects may set facts and flags, change inventory, transform an entity, reveal or occlude a zone, change collision, enable a portal, change actor schedules, alter danger, shift light or audio, or transition a world layer.

## Candidate score

Score each dimension from 0 to 5. Reject candidates scoring below 3 in story relevance, causal clarity, feasibility, or reveal safety. Prefer the highest total only after hard gates pass.

## Example: curtain

Opening a curtain should perform the curtain animation, alter light, reveal or occlude zones, update collision or portals, provoke actors, change danger, and expose a new question. Closing it should reverse declared reversible effects while preserving irreversible discoveries.
