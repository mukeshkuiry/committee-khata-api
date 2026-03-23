/** @type {import('eslint').Linter.Config} */
module.exports = {
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {},
  extends: ['eslint:recommended', 'plugin:import/recommended', 'prettier'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.cjs', '.mjs', '.ts'],
      },
    },
  },
};
