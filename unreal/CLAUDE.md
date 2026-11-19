# Sensei Hakuun — Unreal Engine 5.8 project brief

You are building Gabriel's game in Unreal Engine 5.8 through Epic's Unreal MCP plugin. Gabriel is the director; ask before big direction changes, otherwise build.

## The game
- Japanese spirit-world adventure. Solo first, friends can drop in (co-op later, design for it: replicate player state from day one).
- Open world. Start town = Sensei's valley (koi pond, tea house, castle on a hill, Kumo Peak, Mirror Lake, bamboo grove, night market, orchard, onsen, mini golf).
- Sensei Hakuun: a ghost koi monk, calm, dry humour, no exclamation marks. He teaches every ability through a questline: roll, climb, glide, possess a koi, spirit powers, skill tree, and finally the ōdachi (the sword in the stone at the bottom of the koi pond). Then he sends you on a long trek to the next village.
- Core twist: spirit possession. Put your spirit into living things (koi, crows, townspeople, animals) to solve puzzles and reach places. Your body stays behind and can be threatened.
- Gentle and cozy at first, then properly combat-heavy with Souls-style bosses (ramp like Another Crab's Treasure). Skill tree branches: Spirit · Combat · Movement · Abilities · HP.
- Map inspiration: Ghost of Tsushima (distant mountains you can actually reach), Breath of the Wild (long treks, climb anything that makes sense).
- Multiplayer matters: aim for something fun and clippable with friends (inspirations: R.E.P.O., Lethal Company, Soul Knight's quick co-op runs). Keep sessions short and chaotic-friendly; design every system so a second player can join.
- Later: night expeditions, physics chaos, water-powered ferries across a big lake, proximity voice, Mirror Lake lantern quest into a mirror world, sky islands with real purpose, interiors.

## Layout notes from Gabriel
- The castle is its own landmark on its own hill, set apart from the rest of the valley. One main entrance only, reached by crossing a moat on a bridge, so the approach feels legendary.
- No snow in the starting valley. The snowy onsen belongs in a future snow biome, not next to the castle.
- The Night Market is a real, normal-sized village, not a tiny cluster.

## North star: fun and clippability
- Every feature is judged by two questions: is it fun to play with friends, and does it create moments worth clipping (possessing a friend's enemy, trolling a friend's sleeping body, physics chaos)?
- Ship a complete, polished version with a reason to keep playing (progression, skill tree, unlocks, new villages), then put it in front of YouTubers and streamers.

## Look
- Breath of the Wild painterly: cel-shaded characters/foliage, a painterly post-process on top, excellent lighting (Lumen), atmospheric fog. Not photoreal.
- Water must be clear in the shallows, deep teal in the middle, fish visible.

## World rules (check these yourself after every change, like a QA pass)
1. Nothing floats; everything is planted in the ground or on a foundation.
2. Nothing overlaps or clips (trees through roofs, lanterns in walls, props in waterfalls).
3. Paths and stairs are no-build zones: no grass, props or trees on them.
4. Every path connects to the path network (bridges included).
5. Buildings sit on levelled ground, not on tall plinths over slopes.
6. Doors open on hinges without passing through anything.
7. The camera never clips inside objects; mouse-look with no cursor (BotW style).
8. Nothing "random and incoherent": every prop has a reason to be where it is.

## Reference
The browser prototype lives in ../web/garden-source.html (three.js). Use it for layout, story text and feature ideas, not for code.
