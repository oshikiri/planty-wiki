import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const rootDir = process.cwd();
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: npm run tsdoc:extract -- <file>");
  process.exit(1);
}

const absolutePath = path.resolve(rootDir, inputPath);
const sourceText = fs.readFileSync(absolutePath, "utf8");
const scriptKind = absolutePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

const functions = collectTopLevelFunctions(sourceFile);

console.log(
  JSON.stringify({
    file: path.relative(rootDir, absolutePath),
    functions,
  }),
);

function collectTopLevelFunctions(source) {
  const result = [];

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && hasExportModifier(statement)) {
      result.push(toEntry(source, statement.name.text, statement, true));
    }
  }

  return result;
}

function toEntry(source, name, node, exported) {
  const tsdoc = getLeadingTsDocComment(source, node);

  return {
    name,
    exported,
    tsdoc,
  };
}

function getLeadingTsDocComment(source, node) {
  const ranges = ts.getLeadingCommentRanges(source.getFullText(), node.pos) ?? [];

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    const text = source.getFullText().slice(range.pos, range.end);
    if (text.startsWith("/**")) {
      return text;
    }
  }

  return null;
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}
