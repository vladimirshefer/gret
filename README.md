
## Project Overview

Gret is a markdown full-text search tool using SQLite FTS5 (Full-Text Search).
It indexes markdown files in a directory, supports acronym expansion in queries,
and provides ranked search results with BM25 scoring.

## Commands

**Run search:**
```bash
ts-node gret.ts "search terms"
```

**Rebuild index:**
```bash
ts-node gret.ts --index
```

**Run tests:**
```bash
ts-node test.ts
```

## Key Implementation Details

- **Index location**: `~/.gret/.gret.db` (SQLite FTS5 virtual table)
- **Search scope**: `**/*.md` files (excludes `node_modules/`, `.git/`)
- **Tokenization**: Porter stemming algorithm for matching word variations
- **Section parsing**: Each H1 starts a new top-level group; H2-H6 create subsections with hierarchical headings
- **Ranking**: BM25 algorithm with custom column weights favoring title and heading matches
- **Acronym expansion**: Uses query trees with OR logic to match either acronym or expansion
