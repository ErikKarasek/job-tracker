# Job Tracker

A kanban board for a job hunt: every role is a card moved through the stages, with an AI agent assisting.

Instructions for coding agents working in this repo. `CLAUDE.md` points here, so this file is the single source of truth.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `ErikKarasek/job-tracker` (public, so issue bodies are public), managed with the `gh` CLI. The conventions live in the `gh-issue-conventions` skill: **load it before any issue operation.** Repo-specific notes are in `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. All five exist on the repo, so apply them rather than creating any. See the `gh-issue-conventions` skill, and `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, neither of which exists yet. Load the `agent-domain-docs` skill; see `docs/agents/domain.md`.

## Language

Everything that goes to GitHub is written in English, even when the task or the conversation is in Czech: commit messages, pull request titles and bodies, issue titles and bodies, comments, review replies, release notes, docs and code comments. Czech stays only where it is the product itself: app and site copy, and UI strings or messages quoted verbatim.

## Committing

Commit messages and PR descriptions carry **no** `Co-Authored-By: Claude` and no "Generated with Claude Code" line. The repo shows Erik as the only author. A squash merge copies co-author trailers out of the branch commits, so they have to be gone before the PR is merged.
