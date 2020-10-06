// rollup.config.js

import typescript from "@rollup/plugin-typescript"
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import globals from 'rollup-plugin-node-globals'
import builtins from 'rollup-plugin-node-builtins'

const plugins = [
  typescript({
    tsconfig: 'tsconfig.json',
    removeComments: true
  }),
  copy({
    targets: [
      { src: 'src/template.html', dest: 'dist' }
    ]
  }),
  nodeResolve({ preferBuiltins: false }),
  commonjs(),
  globals(),
  builtins()
]

export default [
  {
    input: 'src/client.ts',
    output: {
      file: 'dist/tiny-browser.js',
      format: 'cjs',
      name: 'client'
    },
    external: ['fs', 'http', 'net'],
    plugins
  },
  {
    input: 'src/server.ts',
    output: {
      file: 'dist/server.js',
      format: 'cjs',
      name: 'server'
    },
    external: ['fs', 'http', 'net'],
    plugins
  }
]