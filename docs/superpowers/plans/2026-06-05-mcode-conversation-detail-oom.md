# mcode Conversation Detail OOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove detail-page full-history processing from metadata and calibration paths so large conversations no longer trigger frontend out-of-memory errors.

**Architecture:** Keep the existing local-first detail page, but enforce that metadata-only flows never touch remote `turns`. Cold bootstrap may still use full remote detail once when no local turns exist. Realtime summary updates should use lightweight status mirroring instead of full detail calibration.

**Tech Stack:** Vue 3, Pinia, Uni App, TypeScript, local SQLite repository helpers

---
