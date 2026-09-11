# Friiigooo Agent Handoff

This repository is the firmware side of Friiigooo, Jean-Claude's family
dashboard running on a LilyGo T5 4.7 inch e-paper display.

The main product code lives in `examples/liste_frigo`. Start with
`examples/liste_frigo/AI_HANDOFF.md` before changing this project. The rest of
the repository is mostly the upstream LilyGo EPD47 SDK and examples.

Important rules for future agents:

- Do not print, commit, or copy secrets. Real credentials live in ignored local
  files such as `examples/liste_frigo/secrets.h`.
- Keep unrelated upstream files untouched. This worktree may contain local
  changes outside `examples/liste_frigo`.
- The website/server lives in a separate checkout at
  `/Users/jeanclaude/Documents/LilyGo-EPD47-site-boats`.
- The firmware consumes the website aggregate endpoint; it must not connect to
  AISStream directly.
- Use PlatformIO environment `T5-ePaper-S3` for Jean-Claude's current device.
