const npmDependencyTypes = [
  "npm",
  "npm-bundled",
  "npm-dev",
  "npm-no-pkg",
  "npm-optional",
  "npm-peer",
  "npm-unknown",
];

function createNoNpmDependencyRule({ name, comment, fromPath }) {
  return {
    name,
    severity: "error",
    comment,
    from: {
      path: fromPath,
    },
    to: {
      dependencyTypes: npmDependencyTypes,
    },
  };
}

/** @type {import("dependency-cruiser").IConfiguration} */
const config = {
  forbidden: [
    {
      name: "domain-isolated-from-app-layers",
      severity: "error",
      comment:
        "Domain modules must stay independent from application layers and only depend on domain modules or built-in modules.",
      from: {
        path: "^src/domain(?:/|$)",
      },
      to: {
        path: "^src/(?!domain(?:/|$)).+",
      },
    },
    createNoNpmDependencyRule({
      name: "domain-does-not-depend-on-npm",
      comment:
        "Domain modules must not depend on npm packages because those dependencies couple the core model to external implementation details.",
      fromPath: "^src/domain(?:/|$)",
    }),
    {
      name: "usecases-only-depend-on-domain-or-ports",
      severity: "error",
      comment:
        "Use case modules may depend on domain modules, use case modules, and shared type definitions only.",
      from: {
        path: "^src/usecases(?:/|$)",
      },
      to: {
        path: "^src/(?!domain(?:/|$)|types(?:/|$)|usecases(?:/|$)).+",
      },
    },
    createNoNpmDependencyRule({
      name: "usecases-do-not-depend-on-npm",
      comment:
        "Use case modules should remain framework-agnostic and must not depend on npm packages.",
      fromPath: "^src/usecases(?:/|$)",
    }),
    {
      name: "hooks-do-not-depend-on-components",
      severity: "error",
      comment:
        "Hooks belong to an inner layer than components, so they must not depend on component modules.",
      from: {
        path: "^src/hooks(?:/|$)",
      },
      to: {
        path: "^src/components(?:/|$)",
      },
    },
    {
      name: "hooks-do-not-depend-on-app",
      severity: "error",
      comment:
        "Hooks must not depend on the app layer because the dependency direction would be reversed.",
      from: {
        path: "^src/hooks(?:/|$)",
      },
      to: {
        path: "^src/app[.]tsx$",
      },
    },
    {
      name: "components-do-not-depend-on-app",
      severity: "error",
      comment:
        "Components must not depend on the app layer because app is the outermost layer in the UI stack.",
      from: {
        path: "^src/components(?:/|$)",
      },
      to: {
        path: "^src/app[.]tsx$",
      },
    },
    {
      name: "app-is-not-imported-by-inner-layers",
      severity: "error",
      comment:
        "Inner layers must not import the app module because that reverses the declared architecture dependency flow.",
      from: {
        path: "^src/(?!app[.]tsx$|main[.]tsx$).+",
      },
      to: {
        path: "^src/app[.]tsx$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    includeOnly: "^src",
    tsConfig: {
      fileName: "./tsconfig.json",
    },
    tsPreCompilationDeps: true,
  },
};

export default config;
