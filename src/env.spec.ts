import * as yaml from 'yaml';
import { makeEnvironments } from './env';

describe('index.ts', () => {
    describe('makeEnvironments', () => {
        it('handles disjoint secret sets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                exportOrganizationSecrets: true,
                excludeSecrets: new Set(),
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO']),
                githubRepoSecrets: new Set(['BAR']),
                githubRepoOrgSecrets: new Set(['FOO']),
            });
            expect(orgYaml).toBe(
                yaml.stringify({
                    values: {
                        environmentVariables: {
                            FOO: { 'fn::secret': 'secret-foo' },
                        },
                    },
                }),
            );
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: {
                        environmentVariables: {
                            BAR: { 'fn::secret': 'secret-bar' },
                        },
                    },
                }),
            );
        });

        it('handles unavailable org secrets', () => {
            expect(() => {
                makeEnvironments({
                    exportOrganizationSecrets: true,
                    excludeSecrets: new Set(),
                    orgProject: 'import',
                    orgEnvironment: 'org-secrets',
                    githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                    githubOrgSecrets: new Set(['FOO']),
                    githubRepoSecrets: new Set(['BAR']),
                    githubRepoOrgSecrets: new Set(),
                });
            }).toThrow();
        });

        it('handles overridden org secrets', () => {
            expect(() => {
                makeEnvironments({
                    exportOrganizationSecrets: true,
                    excludeSecrets: new Set(),
                    orgProject: 'import',
                    orgEnvironment: 'org-secrets',
                    githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                    githubOrgSecrets: new Set(['FOO']),
                    githubRepoSecrets: new Set(['FOO', 'BAR']),
                    githubRepoOrgSecrets: new Set(['FOO']),
                });
            }).toThrow();
        });

        it('handles empty repo secrets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                exportOrganizationSecrets: true,
                excludeSecrets: new Set(),
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO', 'BAR']),
                githubRepoSecrets: new Set(),
                githubRepoOrgSecrets: new Set(['FOO', 'BAR']),
            });
            expect(orgYaml).toBe(
                yaml.stringify({
                    values: {
                        environmentVariables: {
                            BAR: { 'fn::secret': 'secret-bar' },
                            FOO: { 'fn::secret': 'secret-foo' },
                        },
                    },
                }),
            );
            expect(repoYaml).toBe(undefined);
        });

        it('respects exportOrganizationSecrets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                exportOrganizationSecrets: false,
                excludeSecrets: new Set(),
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO']),
                githubRepoSecrets: new Set(['BAR']),
                githubRepoOrgSecrets: new Set(['FOO']),
            });
            expect(orgYaml).toBe(undefined);
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: {
                        environmentVariables: {
                            BAR: { 'fn::secret': 'secret-bar' },
                        },
                    },
                }),
            );
        });

        it('respects excludes', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                exportOrganizationSecrets: true,
                excludeSecrets: new Set(['GITHUB_TOKEN', 'APP_PRIVATE_KEY']),
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: {
                    FOO: 'secret-foo',
                    BAR: 'secret-bar',
                    GITHUB_TOKEN: 'token',
                    APP_PRIVATE_KEY: 'pk',
                },
                githubOrgSecrets: new Set(['FOO', 'APP_PRIVATE_KEY']),
                githubRepoSecrets: new Set(['BAR', 'GITHUB_TOKEN']),
                githubRepoOrgSecrets: new Set(['FOO', 'APP_PRIVATE_KEY']),
            });
            expect(orgYaml).toBe(
                yaml.stringify({
                    values: {
                        environmentVariables: {
                            FOO: { 'fn::secret': 'secret-foo' },
                        },
                    },
                }),
            );
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: {
                        environmentVariables: {
                            BAR: { 'fn::secret': 'secret-bar' },
                        },
                    },
                }),
            );
        });
    });
});
