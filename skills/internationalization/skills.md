# Internationalization Skill

## Overview

This skill covers i18n implementation and localization for the Agent Replay CLI and web UI.

## Scope

- Extracting translatable strings
- Locale-aware formatting (dates, numbers, durations)
- RTL language support (future)
- Translation workflow and tooling

## Standards

- Use `i18next` or `react-intl` for translation keys
- All user-facing strings must use translation keys, not hardcoded text
- Translation files in `locales/{lang}.json`
- English (`en`) is the source of truth and fallback

## Resources

- [i18next Documentation](https://www.i18next.com/)
- [Mozilla i18n Guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-23
