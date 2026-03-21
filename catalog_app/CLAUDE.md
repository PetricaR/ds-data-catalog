# Claude Global Instructions

## context-hub

Always use [context-hub](https://github.com/andrewyng/context-hub) to fetch curated, versioned documentation before implementing features that rely on external libraries or APIs. This reduces hallucinations and ensures you're using up-to-date docs.

**Workflow:**
1. Before writing code that uses an external library/API, run `chub search <library>` to check if docs are available.
2. If found, run `chub get <id> --lang py` (or `--lang js` etc.) to fetch current docs.
3. Use the fetched docs as the authoritative reference for that library.
4. After a session, run `chub annotate <id> <note>` to attach any useful notes for future sessions.

**Commands reference:**
- `chub search <query>` — search available docs
- `chub get <id> [--lang py|js] [--file <file>] [--full]` — fetch docs
- `chub annotate <id> <note>` — add persistent notes (survive across sessions)
- `chub feedback <id> up|down` — rate doc quality
