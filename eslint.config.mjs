<<<<<<< HEAD
import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
]);
=======
export default [
  {
    ignores: [
      "build/**",
      "logs/**",
      "node_modules/**"
    ]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-empty": "off",
      "no-unused-vars": "warn"
    }
  }
];
>>>>>>> f07f657 (Added general testing + regression tests)
