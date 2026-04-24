# Profile Default Model Design

## Goal

Profiles can optionally carry a default Codex model and reasoning effort. Activating a profile applies those values to the live Codex `config.toml`.

## Confirmed Behavior

- Save optional profile fields `model` and `modelReasoningEffort`.
- When a profile has `model`, activation writes the top-level `model = "<value>"`.
- When a profile has `modelReasoningEffort`, activation writes the top-level `model_reasoning_effort = "<value>"`.
- When either field is empty, activation leaves the existing live config value unchanged.
- Existing profiles remain valid; missing optional fields normalize to empty values for the UI/API.

## Approach

Store the two new fields alongside the existing profile fields in `codex-manager.profiles.json`. Use camelCase in the JSON/API (`modelReasoningEffort`) and TOML's native snake_case key (`model_reasoning_effort`) when writing `config.toml`.

Profile activation continues to update provider, base URL, and API key, then conditionally rewrites top-level model settings only when the selected profile has explicit values. Current config reporting will include the current model and reasoning effort when present so the profile page can show what is active.

## Testing

- Add backend tests for persisting optional fields.
- Add backend activation tests for writing model settings.
- Add backend activation tests for preserving current settings when profile fields are blank.
- Add frontend model validation tests ensuring optional fields are allowed.
