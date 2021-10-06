import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: 'src/index.ts',
    output: {
        dir: 'dist/umd',
        format: 'umd',
        name: 'imagine'
    },
    plugins: [typescript({ 'module': 'es6' }), terser()],
    external: 'mobx'
};

export default config;