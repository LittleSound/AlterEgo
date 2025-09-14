import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  ignores: [
    'docs',
    'drizzle',
  ],
  stylistic: {
    indent: 2,
    quotes: 'single',
    rules: {
      'padded-blocks': 'off',
    },
  },
})
