# Gret

**Local full-text search for Markdown documentation.** Gret indexes Markdown files from multiple directories ("libraries") and searches their contents with SQLite FTS5. No server, network access, embeddings, or LLM is required.

## Features

- **Markdown-aware indexing:** splits documents into sections at headings, retaining the heading hierarchy and section text.
- **Ranked results:** SQLite FTS5 BM25 with field weights for paths (0.5), titles (5.0), headings (3.0), and bodies (1.0).
- **Acronym expansion:** configurable abbreviations and their expansions are considered during search.
- **Multiple libraries:** register directories and search their combined index.
- **Local storage:** configuration, index, and acronym definitions live under `~/.gret/`.
- **Stemming:** SQLite's Porter tokenizer matches related English word forms.

## Installation

Requires Node.js and a working installation of the `sqlite3` command-line executable on your PATH.

### From npm

```bash
npm install -g @vladimirshefer/gret
```

### From source

```bash
git clone https://github.com/vladimirshefer/gret.git
cd gret
npm install
npm run build
npm install -g .
```

## Quick start

```bash
# Register and index Markdown files in the current directory
cd ~/work/backend
gret --index

# Register and index another directory
gret --library ~/notes

# Search across all registered libraries
gret "kafka consumer retry"

# Search terms can also be passed separately
gret kafka consumer retry
```

## CLI reference

| Command | Description |
| --- | --- |
| `gret <query>` | Search all indexed libraries. Multiple arguments form one query. |
| `gret --index` | Register/index the current directory, or reindex its parent library if already registered. |
| `gret --library <path>` | Register/index the given directory, or reindex its parent library if already registered. |
| `gret --reindex` | Rebuild the complete index for all registered libraries. |
| `gret --acronym abc=expansion` | Add an acronym expansion rule. |
| `gret --acronym` | Print the acronym file (if present) and help. |
| `gret --help` | Show usage information. |
| `gret` | Show usage information. |

Search results are grouped by file, with section headings, line numbers, highlighted matching text, and BM25 ranks. The CLI shows up to five files and up to three matching sections per file.

### Libraries

A *library* is a directory of Markdown files. Gret keeps a list of registered library paths in `~/.gret/config.json`.

```bash
gret --library ~/work/backend/docs
gret --library ~/work/frontend/docs
gret --reindex
```

- Indexing a library replaces only that library's indexed entries.
- Running `--index` from inside an existing library reindexes the registered parent library.
- Registering a parent directory that contains an already registered library is rejected to avoid overlapping libraries.
- To unregister a library, edit `~/.gret/config.json` and then run `gret --reindex`. There is currently no dedicated remove command.

Gret indexes `*.md` files, including Markdown files in hidden directories. It excludes `.git/` and `node_modules/`.

### Acronym expansion

Define abbreviations to help searches match either the abbreviation or its expanded terms.

```bash
gret --acronym 'jwt=JSON Web Token'
gret --acronym 'db=database'
gret --acronym
```

Rules are stored in `~/.gret/acronyms.txt`, one per line:

```text
jwt > json web token
db > database
```

Rules are loaded when Gret runs a search. The acronym file is optional; if missing, Gret reports that it was not found.

## How search works

1. Gret parses Markdown into sections at H1–H6 headings.
2. Each section is stored in an SQLite FTS5 table with separate path, title, headings, and body columns.
3. Search input is normalized, expanded using acronym rules, and converted to an FTS5 query.
4. Matching sections are ranked with `bm25(notes, 0.5, 5.0, 3.0, 1.0)`, then grouped by file for display.

The index currently stores **absolute file paths**, and indexing rebuilds a library's entries rather than incrementally updating individual changed files.

## Data locations

| Path | Purpose |
| --- | --- |
| `~/.gret/config.json` | Registered libraries |
| `~/.gret/.gret.db` | SQLite FTS5 search index |
| `~/.gret/acronyms.txt` | Acronym expansion rules |

All indexed content and configuration stay on your machine.

## Development

```bash
npm install
npm run build
```

The project also contains a `test.ts` script, which can be run with a locally available `ts-node` installation:

```bash
npx ts-node test.ts
```

## License

MIT
