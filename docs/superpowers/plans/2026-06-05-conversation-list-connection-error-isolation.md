# Conversation List Connection Error Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent one failed connection from breaking the entire conversation list, and expose per-connection failure details beside the connection title.

**Architecture:** Keep the current connection-group overview structure, but add connection-scoped error state to each group and switch overview loading from all-or-nothing aggregation to per-connection recovery. Render a small error affordance in the group header and show the stored message on demand.

**Tech Stack:** Vue 3, TypeScript, uni-app

---
