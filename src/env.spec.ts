import * as yaml from 'yaml';
import { makeEnvironments } from './env';

describe('index.ts', () => {
    describe('makeEnvironments', () => {
        it('handles disjoint secret sets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO']),
                githubRepoSecrets: new Set(['BAR']),
                githubRepoOrgSecrets: new Set(['FOO']),
            });
            expect(orgYaml).toBe(
                yaml.stringify({
                    values: { environmentVariables: { FOO: 'secret-foo' } },
                }),
            );
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: { environmentVariables: { BAR: 'secret-bar' } },
                }),
            );
        });

        it('handles unavailable org secrets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO']),
                githubRepoSecrets: new Set(['BAR']),
                githubRepoOrgSecrets: new Set(),
            });
            expect(orgYaml).toBe(undefined);
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: { environmentVariables: { BAR: 'secret-bar' } },
                }),
            );
        });

        it('handles overridden org secrets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
                orgProject: 'import',
                orgEnvironment: 'org-secrets',
                githubSecrets: { FOO: 'secret-foo', BAR: 'secret-bar' },
                githubOrgSecrets: new Set(['FOO']),
                githubRepoSecrets: new Set(['FOO', 'BAR']),
                githubRepoOrgSecrets: new Set(['FOO']),
            });
            expect(orgYaml).toBe(undefined);
            expect(repoYaml).toBe(
                yaml.stringify({
                    imports: ['import/org-secrets'],
                    values: {
                        environmentVariables: {
                            BAR: 'secret-bar',
                            FOO: 'secret-foo',
                        },
                    },
                }),
            );
        });

        it('handles empty repo secrets', () => {
            const { orgYaml, repoYaml } = makeEnvironments({
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
                            BAR: 'secret-bar',
                            FOO: 'secret-foo',
                        },
                    },
                }),
            );
            expect(repoYaml).toBe(undefined);
        });
    });
});
