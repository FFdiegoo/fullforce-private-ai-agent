// Prettier configuration for consistent code formatting
module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  doubleQuote: false,
  quoteProps: 'as-needed',
  
  // Indentation
  tabWidth: 2,
  useTabs: false,
  
  // Line length
  printWidth: 100,
  
  // Spacing
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',
  
  // JSX specific
  jsxSingleQuote: true,
  jsxBracketSameLine: false,
  
  // Other
  endOfLine: 'lf',
  insertPragma: false,
  requirePragma: false,
  proseWrap: 'preserve',
  htmlWhitespaceSensitivity: 'css',
  
  // File-specific overrides
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
        tabWidth: 2
      }
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80
      }
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false
      }
    },
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
        printWidth: 100,
        semi: true,
        singleQuote: true,
        trailingComma: 'es5'
      }
    }
  ]
};