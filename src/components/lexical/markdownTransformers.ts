import { CHECK_LIST, TRANSFORMERS, type Transformer } from "@lexical/markdown";

const CHECKLIST_TRANSFORMERS: Transformer[] = [CHECK_LIST, ...TRANSFORMERS];

export const BASIC_TRANSFORMERS = CHECKLIST_TRANSFORMERS;
