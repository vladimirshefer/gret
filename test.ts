import {FileParser, SearchConfig, SearchLogic} from "./gret";
import assert from "assert";

const gret = require("./gret")

function test(fn: () => void) {
    fn();
}
function assertEquals(expected: any, actual: any) {
    if (actual != expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
    }
}

test(() => {
    console.error("hello")
    const acr = SearchConfig.getAcronymRules;
    SearchConfig.getAcronymRules = () => {
        return [{ acronym: "nasa", expansion: "national aeronautics and space administration"}]
    }
    assert.equal("(scientist OR of OR (nasa OR nasa OR national aeronautics space administration))", SearchLogic.expandAcronyms(["scientist", "of", "nasa"]).get());
})

test(() => {
    // Mock Markdown content
    const mockContent = `
# Project Alpha
Some intro text for Project Alpha.

## Overview
This section describes the project overview.

### Goals
- Goal 1
- Goal 2

## Timeline
The project timeline goes here.

# Project Beta
Introduction for Project Beta.

## Summary
Summary text for Beta.

### Details
Details about Beta project.
`;

// Run parser
    const results = FileParser.parseFile("mock/path/Projects.md", mockContent);

    assert.deepStrictEqual(
        results,
        [
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Alpha",
                headings: [],
                body: "Some intro text for Project Alpha.",
                line: 1
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Alpha",
                headings: ["Overview"],
                body: "This section describes the project overview.",
                line: 4
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Alpha",
                headings: ["Overview", "Goals"],
                body: "- Goal 1\n- Goal 2",
                line: 7
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Alpha",
                headings: ["Timeline"],
                body: "The project timeline goes here.",
                line: 11
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Beta",
                headings: [],
                body: "Introduction for Project Beta.",
                line: 14
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Beta",
                headings: ["Summary"],
                body: "Summary text for Beta.",
                line: 17
            },
            {
                path: "mock/path/Projects.md",
                title: "Projects Project Beta",
                headings: ["Summary", "Details"],
                body: "Details about Beta project.",
                line: 20
            }
        ]
    )
})
