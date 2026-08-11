import globals from "globals";

export default [
  { ignores: ["reference/**"] },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        THREE: "readonly",
        QRCode: "readonly",
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn"
    }
  },
  {
    files: ["ws-server.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
