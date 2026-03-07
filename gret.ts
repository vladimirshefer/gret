#!/usr/bin/env node
import {execSync} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import {glob} from 'glob';

// --------------------------------------------------
// Configuration
// --------------------------------------------------
const GRET_DIR = path.join(os.homedir(), ".gret");
const DB_FILE = path.join(GRET_DIR, ".gret.db");           // SQLite database file
const ACRONYMS_FILE = path.join(GRET_DIR, "acronyms.txt"); // Acronym definitions
const SRC_DIR = ".";             // Where to search for markdown files
const FILE_PATTERN = "**/*.md";  // Glob pattern for indexed files
const GRET_IGNORE = ['**/node_modules/**', "**/.git/**"];

// --------------------------------------------------
// Usage Examples:
//
//   ts-node gret.ts --index
//       Rebuilds the full-text search index.
//
//   ts-node gret.ts "some search terms"
//       Performs a non-interactive search.
// --------------------------------------------------


/**
 * --------------------------------------------------
 * Search Configuration Namespace
 * --------------------------------------------------
 */
export namespace SearchConfig {
    export interface AcronymRule {
        acronym: string;
        expansion: string;
    }

    let acronymRules: AcronymRule[] = [];

    /**
     * Loads acronym definitions from the acronyms file.
     * Format: "acronym > expansion text"
     */
    export function loadAcronyms(): void {
        if (!fs.existsSync(ACRONYMS_FILE)) {
            console.error("Acronym file " + ACRONYMS_FILE + " not found")
            return;
        }

        const content = fs.readFileSync(ACRONYMS_FILE, 'utf-8');
        acronymRules = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                const parts = line.split('>').map(p => p.trim());
                if (parts.length !== 2) return null;
                const [acronym, expansion] = parts;
                return {acronym, expansion};
            })
            .filter((rule): rule is AcronymRule => rule !== null);

        console.log(`Loaded ${acronymRules.length} acronym rules.`);
    }

    export function getAcronymRules(): AcronymRule[] {
        return acronymRules;
    }
}

/**
 * --------------------------------------------------
 * File Parser Namespace
 * --------------------------------------------------
 */
export namespace FileParser {
    export function parseFile(filePath: string, content: string): SearchLogic.SearchEntry[] {
        const lines = content.split('\n');
        const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
        const result: SearchLogic.SearchEntry[] = [];
        let currentBody: string[] = [];
        let stack: { level: number, title: string, line: number }[] = [];
        let currentH1 = '';
        let currentH1Line = 0;

        function pushSection() {
            if (!currentH1 && !stack.length && currentBody.length === 0) return;

            result.push({
                path: filePath,
                title: `${fileName} ${currentH1}`.trim(),
                headings: stack.map(h => h.title),
                body: currentBody.join('\n').trim(),
                line: stack.length ? stack[stack.length - 1].line : currentH1Line || 1
            });

            currentBody = [];
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '') continue;

            const h1Match = line.match(/^#\s+(.*)/);
            const hOtherMatch = line.match(/^(#{2,6})\s+(.*)/);

            if (h1Match) {
                // push previous section
                pushSection();
                stack = []; // reset hierarchy
                currentH1 = h1Match[1].trim();
                currentH1Line = i;
            } else if (hOtherMatch) {
                pushSection();
                const level = hOtherMatch[1].length;
                const headerText = hOtherMatch[2].trim();

                while (stack.length && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }
                stack.push({ level, title: headerText, line: i });
            } else {
                currentBody.push(line);
            }
        }

        pushSection();
        return result;
    }
}

export namespace SearchEngine {
    export namespace Tokenizers {
        export interface Tokenizer {
            tokenize(text: string): string[];
        }

        export const SimpleTokenizer: Tokenizer = {
            tokenize(text: string): string[] {
                return text.split(/\W+/).filter(word => word.length > 0);
            }
        }
    }

    export namespace Filters {
        export interface Filter {
            filter(tokens: string[]): string[];
        }

        export const LowercaseFilter: Filter = {
            filter(tokens: string[]): string[] {
                return tokens.map(token => token.toLowerCase());
            }
        }
    }
}

/**
 * --------------------------------------------------
 * Search Logic Namespace
 * --------------------------------------------------
 */
export namespace SearchLogic {

    export interface SearchEntry {
        path: string;
        title: string;
        headings: string[];
        body: string;
        line: number;
    }

    export interface SearchResult {
        path: string;
        rank: number;
        preview: string;
        line: number;
        headings: string;
    }

    const tokenizer = SearchEngine.Tokenizers.SimpleTokenizer;
    const filters = [
        SearchEngine.Filters.LowercaseFilter
    ];

    function analyze(text: string): string[] {
        let tokens = tokenizer.tokenize(text);
        for (const filter of filters) {
            tokens = filter.filter(tokens);
        }
        return tokens;
    }

    /**
     * Expands acronyms in the given text using case-insensitive matching.
     * @param text - The text to process.
     * @returns The text with acronyms expanded.
     */
    export function expandAcronyms(text: string[]): SynonymExpander.QueryTree {
        const rules = SearchConfig.getAcronymRules();
        // [synonym groups [synonym1 [tokens], synonym2 [tokens] ]
        let map: string[][][] = rules.map(rule => [analyze(rule.acronym), analyze(rule.expansion)]);
        let synonymGroupsSortedByLengthDesc: string[][][] = map.flatMap(synonymGroup => synonymGroup.map(synonym => [synonym, ...synonymGroup]))
            .sort((a, b) => b[0].length - a[0].length);

        function findSubarray<T>(arr: T[], sub: T[]): number {
            if (sub.length === 0) return 0;
            if (sub.length > arr.length) return -1;
            for (let i = 0; i <= arr.length - sub.length; i++) {
                let match = true;
                for (let j = 0; j < sub.length; j++) {
                    if (arr[i + j] !== sub[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) return i;
            }
            return -1;
        }

        let result: (string | SearchLogic.SynonymExpander.QueryTree)[] = [...text];

        for (const synonymGroup of synonymGroupsSortedByLengthDesc) {
            const [synonym, ...replacements] = synonymGroup;

            let index = findSubarray(result, synonym);
            if (index >= 0) {
                // replace subarray
                result.splice(
                    index,
                    synonym.length,
                    SearchLogic.SynonymExpander.or([
                        SearchLogic.SynonymExpander.or(synonym.map(t => SearchLogic.SynonymExpander.term(t))),
                        ...replacements.map(sg =>
                            SearchLogic.SynonymExpander.and(
                                sg.map(t =>
                                    SearchLogic.SynonymExpander.term(t)
                                )
                            )
                        )
                    ])
                );
            }
        }

        const queryTree = SearchLogic.SynonymExpander.or(result.map(t =>
            typeof t === "string" ? SearchLogic.SynonymExpander.term(t) : t
        ));

        return queryTree;
    }

    /**
     * Saves search entries to the database.
     * @param entries - Array of search entries to save.
     */
    export function save(entries: SearchEntry[]): void {
        // Start clean every time
        if (fs.existsSync(DB_FILE)) {
            fs.unlinkSync(DB_FILE);
        }

        if (!fs.existsSync(GRET_DIR)) {
            fs.mkdirSync(GRET_DIR, { recursive: true });
        }

        const db = new Database(DB_FILE);

        // Create FTS5 (Full-Text Search) virtual table
        // FTS5 is SQLite's advanced full-text search module that enables fast text queries
        // tokenize='porter' uses the Porter stemming algorithm (e.g., "running" matches "run")
        db.exec(`
            CREATE VIRTUAL TABLE notes USING fts5(
                path,
                title,
                headings,
                body,
                line UNINDEXED,
                tokenize='porter'
            );
        `);

        const insertStmt = db.prepare(
            'INSERT INTO notes (path, title, headings, body, line) VALUES (?, ?, ?, ?, ?)'
        );

        for (const entry of entries) {
            let titleStr = entry.title;
            let headingsStr = entry.headings.join(" > ");
            let bodyStr = entry.body;
            insertStmt.run(
                entry.path,
                titleStr,
                headingsStr,
                bodyStr,
                entry.line
            );
        }

        db.close();
    }

    export namespace SynonymExpander {
        export interface QueryTree {
            get(): string;

            children(): QueryTree[];
        }

        export function and(queries: QueryTree[]): QueryTree {
            return {
                get(): string {
                    return "(" + queries.map(q => q.get()).join(' AND ') + ")";
                },
                children(): QueryTree[] {
                    return queries;
                }
            }
        }

        export function term(term: string): QueryTree {
            return {
                get(): string {
                    return term;
                },
                children(): QueryTree[] {
                    return [];
                }
            }
        }

        export function plain(queries: QueryTree[]): QueryTree {
            return {
                get(): string {
                    return queries.map(q => q.get()).join(' ');
                },
                children(): QueryTree[] {
                    return queries;
                }
            }
        }

        export function or(queries: QueryTree[]): QueryTree {
            return {
                get(): string {
                    return "(" + queries.map(q => q.get()).join(' OR ') + ")";
                },
                children(): QueryTree[] {
                    return queries;
                }
            }
        }

    }

    /**
     * Parses a query string into FTS5 format.
     * @param query - The raw search terms.
     * @returns The FTS5-formatted query.
     */
    export function parseQuery(query: string[]): string {
        const expandedQuery = expandAcronyms(query);
        return expandedQuery.get();
    }

    /**
     * Executes a search against the database.
     * @param query - The FTS5-formatted query.
     * @returns Array of search results.
     */
    export function executeSearch(query: string): SearchResult[] {
        console.error("Query: " + query)
        const ftsQuery = SearchLogic.parseQuery(analyze(query));
        console.error("FTS Query: " + ftsQuery)

        const db = new Database(DB_FILE, { readonly: true });

        // FTS5 search query with BM25 ranking and snippet generation
        // - bm25(notes, 0.5, 5.0, 3.0, 1.0): BM25 is a ranking algorithm that scores relevance
        //   Parameters are column weights: path=0.5, title=5.0, headings=3.0, body=1.0
        //   Higher weight means matches in that column rank higher (title matches are most important)
        // - snippet(notes, 3, '[', ']', '...', 15): Generates a text preview of matches
        //   Parameters: column=3 (body), prefix='[', suffix=']', ellipsis='...', tokens=15
        //   Shows ~15 words around the match with '[match]' highlighting
        const stmt = db.prepare(`
            SELECT
                path,
                rank,
                preview,
                line,
                headings
            FROM (SELECT path,
                         bm25(notes, 0.5, 5.0, 3.0, 1.0)        AS rank,
                         snippet(notes, 3, '[', ']', '...', 30) AS preview,
                         line,
                         headings
                  FROM notes
                WHERE notes MATCH ?
            )
            ORDER BY rank
            LIMIT 5;
        `);

        const results: SearchResult[] = stmt.all(ftsQuery) as any[];
        db.close();

        return results;
    }
}

/**
 * Display/Formatting Namespace
 */
namespace Display {
    const colors = {
        cyan: '\x1b[36m',
        yellow: '\x1b[33m',
        gray: '\x1b[90m',
        reset: '\x1b[0m'
    };

    /**
     * Formats and prints search results as a list.
     * @param results - The search results to display.
     */
    export function printResults(results: SearchLogic.SearchResult[]): void {
        if (results.length === 0) {
            console.log("No results found.");
            return;
        }

        // group results by path
        const groupedResults: { [path: string]: SearchLogic.SearchResult[] } = {};
        const topRankByPath: { [path: string]: number } = {};
        results.forEach(result => {
            if (!groupedResults[result.path]) {
                groupedResults[result.path] = [];
            }
            groupedResults[result.path].push(result);
            topRankByPath[result.path] = Math.min(topRankByPath[result.path] || 0, result.rank); // bm25 returns negative ranks
        })

        // Sort results within each path group by rank (descending)
        Object.keys(groupedResults).forEach(path => {
            groupedResults[path].sort((a, b) => b.rank - a.rank);
        });
        const sortedPaths = Object.keys(groupedResults).sort((a, b) => topRankByPath[a] - topRankByPath[b]);

        sortedPaths.forEach((currentPath, index) => {
            if (index > 0) {
                console.log('');
            }
            const pathResults = groupedResults[currentPath];
            const topRank = topRankByPath[currentPath];
            console.log(`${colors.cyan}${currentPath}${colors.reset} ${colors.gray}(rank: ${topRank.toFixed(2)})${colors.reset}`);

            pathResults.forEach(row => {
                const headingDisplay = row.headings ? ` ${colors.gray}[${row.headings}]${colors.reset}` : '';
                console.log(`  ${colors.yellow}${row.line}${colors.reset}${headingDisplay}: ${row.preview.replace(/\n/g, ' ')}`);
            });
        });
    }
}


export namespace Cli {

    /**
     * Indexes all markdown files in the source directory.
     * It creates a new SQLite database with an FTS5 table containing the
     * file path, title, headings, and body of each file.
     */
    export async function indexFiles(): Promise<void> {
        console.log(`Indexing markdown files in ${SRC_DIR}...`);

        const files = await glob(FILE_PATTERN, {cwd: SRC_DIR, nodir: true, ignore: GRET_IGNORE, dot: true});
        console.log(`Found ${files.length} files to index.`);

        const resultEntries: SearchLogic.SearchEntry[] = [];
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            const entries = FileParser.parseFile(path.resolve(file), content);
            entries.forEach(entry => resultEntries.push(entry))
        }

        SearchLogic.save(resultEntries);
        console.log("Index complete.");
    }


    /**
     * Performs a non-interactive search using the provided query terms.
     * @param query - The search terms.
     */
    export function searchNonInteractive(query: string): void {
        if (!fs.existsSync(DB_FILE)) {
            console.error("Database file not found. Please run --index first.");
            return;
        }

        const results = SearchLogic.executeSearch(query);
        Display.printResults(results);
    }

    /**
     * Checks if required shell commands are available in the system's PATH.
     * @param commands - A list of command names to check.
     */
    export function checkDependencies(commands: string[]): void {
        console.log("Checking for dependencies...");
        for (const cmd of commands) {
            try {
                execSync(`command -v ${cmd}`, {stdio: 'ignore'});
            } catch (error) {
                console.error(`Error: Required command '${cmd}' not found in PATH.`);
                console.error("Please install it and try again.");
                process.exit(1);
            }
        }
        console.log("All dependencies found.");
    }
}

/**
 * Main function to parse arguments and run the corresponding mode.
 */
async function main() {
    const args = process.argv.slice(2);

    Cli.checkDependencies(['sqlite3']);
    SearchConfig.loadAcronyms()

    if (args.includes('--index')) {
        await Cli.indexFiles();
    } else if (args.length > 0) {
        Cli.searchNonInteractive(args.join(' '));
    } else {
        console.error('Please provide search terms or use --index to rebuild the index.');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
