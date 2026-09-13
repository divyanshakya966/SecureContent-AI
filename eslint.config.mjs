import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript — strict but pragmatic for a security product
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/ban-ts-comment": ["warn", { "ts-ignore": "allow-with-description" }],
    "@typescript-eslint/no-require-imports": "off",

    // Console is allowed only via warn; debugger is never allowed in production
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    "no-debugger": "error",

    // React — pragmatic for dashboard data-fetching patterns
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/purity": "off",
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "warn",

    // Next.js — keep but don't block build on stylistic rules
    "react/no-unescaped-entities": "off", // intentional in security report markdown
    "@next/next/no-img-element": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "mini-services/**"]
}];

export default eslintConfig;
