
Opinionated search tool specifically designed for markdown files.
The tool is designed to best fit with markdown-based knowledge bases.
The tool is 100% local and does not require internet access.
The tool is smart to understand markdown syntax and provide relevant results.

## Project Overview

Gret is a markdown full-text search tool using SQLite FTS5 (Full-Text Search).
It indexes markdown files in a directory, supports acronym expansion in queries,
and provides ranked search results with BM25 scoring.

## Setup

**Option 1: Install from npm**
```bash
npm install -g @vladimirshefer/gret
```

**Option 2: Build from source**
```bash
git clone https://github.com/vladimirshefer/gret.git
cd gret
npm install
npm run build
npm install -g .
```

## Commands

**Index files in current directory:**
```bash
gret --index
```

**Index another library:**
```bash
gret --library ~/work/project/docs
```

**Reindex all registered libraries:**
```bash
gret --reindex
```

**Run search:**
```bash
gret "search terms"
# also:
# gret search terms
# gret "search" "terms"
```

**Manage acronym expansions:**
```bash
gret --acronym 'jwt=JSON Web Token'
gret --acronym  # Show saved rules and help
```

**Show help:** `gret --help` (or run `gret` without arguments).

## Libraries

Each indexed directory is a library. Registered paths are saved in `~/.gret/config.json`.
Search runs across all registered libraries. Indexing one library replaces only its indexed entries.
Running `--index` inside an existing library reindexes its registered parent directory.
Overlapping parent libraries are rejected. To remove a library, edit `config.json`
and run `gret --reindex` (source files are not deleted).

## Key Implementation Details

- **Index location**: `~/.gret/.gret.db` (SQLite FTS5 virtual table)
- **Search scope**: `**/*.md` files (excludes `node_modules/`, `.git/`)
- **Tokenization**: Porter stemming algorithm for matching word variations
- **Section parsing**: Each H1 starts a new top-level group; H2-H6 create subsections with hierarchical headings
- **Ranking**: BM25 column weights: path=0.5, title=5.0, headings=3.0, body=1.0
- **Acronym expansion**: Uses query trees with OR logic to match either acronym or expansion; rules live in `~/.gret/acronyms.txt` (`acronym > expansion`)
- **Results**: Groups matches by file, showing up to 5 files and 3 matching sections per file, with highlighted snippets and line numbers
- **Paths**: The index currently stores absolute file paths


## Dev Setup

**Run tests:**
```bash
ts-node test.ts
```
