// babel.config.js
module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          browsers: ["> 1%", "last 2 versions", "not dead"],
          node: "current"
        },
        useBuiltIns: "usage", // Adds specific imports for polyfills when they are used
        corejs: { version: 3, proposals: true }, // Use core-js v3
        modules: process.env.MODULES || false // Can be set to 'commonjs' or false (for ESM)
      }
    ]
  ],
  plugins: [
    // Plugin to handle dynamic imports
    "@babel/plugin-syntax-dynamic-import",
    
    // Transform for optional chaining (?.) operator
    "@babel/plugin-proposal-optional-chaining",
    
    // Transform for nullish coalescing (??) operator
    "@babel/plugin-proposal-nullish-coalescing-operator",
    
    // Class properties & private methods support
    ["@babel/plugin-proposal-class-properties", { loose: true }],
    ["@babel/plugin-proposal-private-methods", { loose: true }],
    
    // Transform for the module resolver
    [
      "module-resolver",
      {
        root: ["./src"],
        alias: {
          "@": "./src"
        }
      }
    ]
  ],
  env: {
    // Production environment configuration
    production: {
      plugins: [
        // Remove console.log in production
        "transform-remove-console"
      ]
    },
    // Test environment configuration
    test: {
      presets: [
        [
          "@babel/preset-env",
          {
            targets: { node: "current" },
            modules: "commonjs" // Jest requires CommonJS
          }
        ]
      ],
      plugins: [
        "babel-plugin-add-module-exports",
        "babel-plugin-dynamic-import-node"
      ]
    },
    // CommonJS environment configuration
    commonjs: {
      presets: [
        [
          "@babel/preset-env",
          {
            modules: "commonjs"
          }
        ]
      ]
    }
  }
};