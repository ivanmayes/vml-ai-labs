import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{html,ts,scss}',
    './src/**/*.component.html',
    './src/**/*.component.scss'
  ],
  theme: {
    extend: {}
  }
};

export default config;
