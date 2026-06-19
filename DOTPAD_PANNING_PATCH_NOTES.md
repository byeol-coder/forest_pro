# DotPad Panning Key Fix Notes

DotPad panning keys should move Lumi and be visible in the Debug Key Log.

Expected mapping:

- PanningLeft / LP + 0 -> move left
- PanningRight / RP + 0 -> move right
- LPF1 / LP + 8 -> move up
- RPF4 / RP + 1 -> move down
- PanningAll / AP + 0 -> resend current tactile frame
- F1-F4 -> position, surroundings, mission, map resend

If the SDK returns raw labels instead of canonical KeyCodes, normalize the physical key before passing it to the game handler.
