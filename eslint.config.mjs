import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  ignores: [
    'docs',
  ],
  stylistic: {
    indent: 2,
    quotes: 'single',
    rules: {
      'padded-blocks': 'off',
    },
  },
})
