import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: npm run tsdoc-extract -- <file>");
  process.exit(1);
}

const absolutePath = path.resolve(rootDir, inputPath);
const sourceText = fs.readFileSync(absolutePath, "utf8");
const functions = collectTopLevelFunctions(sourceText);

console.log(
  JSON.stringify({
    file: path.relative(rootDir, absolutePath),
    functions,
  }),
);

function collectTopLevelFunctions(source) {
  const result = [];
  let braceDepth = 0;
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      index = skipLineComment(source, index);
      continue;
    }

    if (source.startsWith("/*", index)) {
      index = skipBlockComment(source, index);
      continue;
    }

    if (isQuote(source[index])) {
      index = skipQuotedString(source, index);
      continue;
    }

    if (source[index] === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (source[index] === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }

    if (braceDepth === 0 && source.startsWith("export", index)) {
      const match = source.slice(index).match(
        /^export\b\s+(?:(?:default|async|declare)\s+)*function\s+([A-Za-z_$][\w$]*)/,
      );
      if (match) {
        result.push({
          name: match[1],
          exported: true,
          tsdoc: getLeadingTsDocComment(source, index),
        });
        index += match[0].length;
        continue;
      }
    }

    index += 1;
  }

  return result;
}

function getLeadingTsDocComment(source, position) {
  let cursor = position;

  while (cursor > 0) {
    cursor = skipWhitespaceBackwards(source, cursor);
    if (cursor === 0) {
      return null;
    }

    if (source[cursor - 1] === "/" && source[cursor - 2] === "*") {
      const start = source.lastIndexOf("/*", cursor - 2);
      if (start === -1) {
        return null;
      }

      const comment = source.slice(start, cursor);
      cursor = start;
      if (comment.startsWith("/**")) {
        return comment;
      }
      continue;
    }

    const lineStart = findLineStart(source, cursor);
    const line = source.slice(lineStart, cursor);
    if (line.trimStart().startsWith("//")) {
      cursor = lineStart;
      continue;
    }

    return null;
  }

  return null;
}

function skipWhitespaceBackwards(source, position) {
  let cursor = position;
  while (cursor > 0 && /\s/.test(source[cursor - 1])) {
    cursor -= 1;
  }
  return cursor;
}

function findLineStart(source, position) {
  const lineFeed = source.lastIndexOf("\n", position - 1);
  const carriageReturn = source.lastIndexOf("\r", position - 1);
  return Math.max(lineFeed, carriageReturn) + 1;
}

function isQuote(character) {
  return character === "'" || character === '"' || character.charCodeAt(0) === 96;
}

function skipQuotedString(source, start) {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
    index += 1;
  }

  return source.length;
}

function skipLineComment(source, start) {
  const lineFeed = source.indexOf("\n", start + 2);
  return lineFeed === -1 ? source.length : lineFeed + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}
