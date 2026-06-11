import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  theme: {
    maxWidth: {
      ...defaultTheme.maxWidth,
      '2560px': '2560px',
      'ultra': '2560px',
    },
  },
} satisfies Config
