// Simplified ESLint configuration for Next.js compatibility
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'next/core-web-vitals'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  rules: {
    // Basic code quality
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': 'error',
    'no-alert': 'warn',
    'no-var': 'error',
    'prefer-const': 'error',
    
    // React specific
    'react/jsx-key': 'error',
    'react/jsx-no-duplicate-props': 'error',
    'react/jsx-no-undef': 'error',
    'react/jsx-uses-react': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    
    // Next.js specific
    '@next/next/no-img-element': 'error',
    '@next/next/no-html-link-for-pages': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'out/',
    'build/',
    'dist/',
    '*.config.js',
    'supabase/migrations/'
  ]
};