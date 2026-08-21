# Changelog

## Unreleased

### Added

- Add opt-in policy decision tracing through the Cordis logger.
- Include the tool name, decision, matched rule number, and gated reason without copying tool arguments.

### Improved

- Keep trace output best-effort so a failing logger exporter cannot change allow, ask, or deny behavior.

### Documentation

- Document trace configuration and its boundary relative to Harness session audit and capability sandboxing.
- Clarify the next roadmap items for presets, real-world recipes, and stable Harness compatibility.
