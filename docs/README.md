# Planty-wiki Documentation

planty-wiki is a lightweight note-taking app that runs entirely in a local environment.
It has no server-side application and stores notes in browser storage.

- Documentation: https://www.oshikiri.org/planty-wiki/#/pages/README
- [[planty-wiki specification]]
- [[planty-wiki markdown syntax]]
- [[coding-standards]]
- Repository: https://github.com/oshikiri/planty-wiki


## How I Count Lines of Code

```
$ git ls-files -- 'public/sqlite-opfs-worker.js' '*.ts' '*.tsx' ':!'*.test.ts |\
  xargs cloc
      47 text files.
      47 unique files.
       0 files ignored.

github.com/AlDanial/cloc v 1.98  T=0.01 s (3134.4 files/s, 286898.3 lines/s)
-------------------------------------------------------------------------------
Language                     files          blank        comment           code
-------------------------------------------------------------------------------
TypeScript                      46            261            317           3159
JavaScript                       1             37              3            525
-------------------------------------------------------------------------------
SUM:                            47            298            320           3684
-------------------------------------------------------------------------------
```