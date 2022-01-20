import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: 'src/index.ts',
    output: {
        dir: 'dist/umd',
        format: 'umd',
        name: 'imagine',
        sourcemap: true
    },
    plugins: [typescript({ 'module': 'es6' }), resolve()],
    //external: 'mobx'
};

export default config;