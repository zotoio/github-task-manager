const babelParser = require('@babel/eslint-parser');
const {
    defineConfig,
} = require("eslint/config");

const globals = require("globals");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    extends: compat.extends("eslint:recommended", "plugin:prettier/recommended"),
    
    languageOptions: {
        parserOptions: {
            requireConfigFile: false,  // Prevents needing a separate Babel config file
            babelOptions: {
              plugins: ['@babel/plugin-syntax-import-assertions'],  // Ensure the plugin is enabled
            },
          },
        parser: babelParser,  // Set Babel as the parser
        globals: {
            ...globals.node,
        },

        ecmaVersion: 2017,
        sourceType: "module",
    },

    rules: {
        "no-console": 0,
        "no-unused-vars": "warn",
        "no-prototype-builtins": "warn",
        "no-async-promise-executor": "warn",
        indent: "off",
        "linebreak-style": ["error", "unix"],

        quotes: ["error", "single", {
            allowTemplateLiterals: true,
        }],

        semi: ["error", "always"],
    },
}]);