export default {
    collectCoverage: true,
    collectCoverageFrom: ['./src/**'],
    coverageDirectory: './coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
    coverageReporters: ['json-summary', 'text', 'lcov'],
    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: ['ts', 'js'],
    preset: 'ts-jest',
    reporters: ['default'],
    resolver: 'ts-jest-resolver',
    testEnvironment: 'node',
    testMatch: ['**/*.spec.ts'],
    testPathIgnorePatterns: ['/dist/', '/node_modules/'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.eslint.json',
                useESM: true,
            },
        ],
    },
    verbose: true,
};
