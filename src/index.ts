import * as core from '@actions/core';
import * as github from '@actions/github';
import * as parsers from 'actions-parsers';
import * as rt from 'runtypes';
import * as yaml from 'yaml';
import {
    type OidcLoginConfig,
    OidcLoginConfigRuntype,
    ensureAccessToken,
} from '@pulumi/actions-helpers/auth';
import * as esc from '@pulumi/esc-sdk';

function getOidcLoginConfig(
    organization: string,
    cloudUrl: string,
): rt.Result<OidcLoginConfig> {
    return OidcLoginConfigRuntype.validate({
        organizationName: organization,
        requestedTokenType: core.getInput('oidc-requested-token-type', {
            required: true,
        })!,
        scope: core.getInput('oidc-scope') || undefined,
        expiration:
            parsers.getNumberInput('oidc-token-expiration') || undefined,
        cloudUrl: cloudUrl || 'https://api.pulumi.com',
        exportEnvironmentVariables: false,
    });
}

function parseEnvName(qualifiedName: string): [string, string] {
    const slash = qualifiedName.indexOf('/');
    if (slash === -1) {
        return ['default', qualifiedName];
    }
    const [project, name] = [
        qualifiedName.slice(0, slash),
        qualifiedName.slice(slash + 1),
    ];
    return [project, name];
}

async function ensureEnvironment(
    client: esc.EscApi,
    org: string,
    project: string,
    name: string,
): Promise<void> {
    // Attempt to create the environment. If this call returns a 409, the environment already exists.
    const resp = await client.rawApi.createEnvironment(org, { project, name });
    switch (resp.status) {
        case 200:
        case 409:
            // OK
            break;
        default:
            throw new Error(`Failed to create environment: ${resp.statusText}`);
    }
}

function makeEnvironmentDefinition(
    secrets: Record<string, string>,
    imports?: string[],
): string {
    const def: any = {};
    if (imports) {
        def.imports = imports;
    }
    def.values = { environmentVariables: secrets };
    return yaml.stringify(def);
}

interface ListSecretsResponse {
    total_count: number;
    secrets: { name: string }[];
}

async function collectSecrets(
    get: (page: number) => Promise<{ data: ListSecretsResponse }>,
): Promise<Set<string>> {
    const all = new Set<string>();
    for (let page = 1; ; page++) {
        const resp = await get(page);
        if (!resp.data.secrets.length) {
            return all;
        }
        resp.data.secrets.forEach(s => all.add(s.name));
    }
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set(Array.from(a.values()).filter(k => b.has(k)));
}

function difference<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set(Array.from(a.values()).filter(k => !b.has(k)));
}

export interface MakeEnvironmentsArgs {
    orgProject: string;
    orgEnvironment: string;
    githubSecrets: any;
    githubOrgSecrets: Set<string>;
    githubRepoSecrets: Set<string>;
    githubRepoOrgSecrets: Set<string>;
}

export interface MakeEnvironmentsResult {
    orgYaml?: string;
    repoYaml?: string;
}

export function makeEnvironments(
    args: MakeEnvironmentsArgs,
): MakeEnvironmentsResult {
    const {
        orgProject,
        orgEnvironment,
        githubSecrets,
        githubOrgSecrets,
        githubRepoSecrets,
        githubRepoOrgSecrets,
    } = args;

    // Check for access to all org secrets. If this repository does not have access to all of the org's secrets, we will only update the repository's environment.
    const repoHasAccessToAllOrgSecrets =
        intersect(githubRepoOrgSecrets, githubOrgSecrets).size ==
        githubOrgSecrets.size;
    if (!repoHasAccessToAllOrgSecrets) {
        const vars = Array.from(
            difference(githubOrgSecrets, githubRepoOrgSecrets),
        ).join('\n');
        core.warning(
            `This repository does not have access to the following organization secrets:\n\n${vars}`,
        );
        core.warning(
            'As a result, this action will not import organization secrets. Please run this action from a repository that has access to all organization secrets in order to import organization secrets',
        );
    }

    // Check for overridden organization secrets. If this repository overrides organization secrets, we will only update the repository's environment.
    const overriddenSecrets = intersect(githubOrgSecrets, githubRepoSecrets);
    const repoOverridesOrgSecrets = overriddenSecrets.size != 0;
    if (repoOverridesOrgSecrets) {
        const vars = Array.from(overriddenSecrets.values()).join('\n');
        core.warning(
            `This repository overrides the following organization secrets:\n\n${vars}`,
        );
        core.warning(
            'As a result, this action will not import organization secrets. Please run this action from a repository that does not override organization secrets in order to import organization secrets',
        );
    }

    const orgSecrets: any = Object.fromEntries(
        Object.entries(githubSecrets)
            .filter(([key]) => githubOrgSecrets.has(key))
            .sort(),
    );
    const repoSecrets: any = Object.fromEntries(
        Object.entries(githubSecrets)
            .filter(([key]) => githubRepoSecrets.has(key))
            .sort(),
    );

    // Update the organization env if this repo can access all organization secrets and does not override any organization secrets.
    const updateOrganizationEnvironment =
        repoHasAccessToAllOrgSecrets && !repoOverridesOrgSecrets;
    const orgYaml = updateOrganizationEnvironment
        ? makeEnvironmentDefinition(orgSecrets)
        : undefined;
    const updateRepoEnvironment = Object.keys(repoSecrets).length != 0;
    const repoYaml = updateRepoEnvironment
        ? makeEnvironmentDefinition(repoSecrets, [
              `${orgProject}/${orgEnvironment}`,
          ])
        : undefined;

    return { orgYaml, repoYaml };
}

async function run(): Promise<void> {
    try {
        const { owner, repo } = github.context.repo;

        // Parse inputs
        const organization = core.getInput('organization', { required: true })!;
        const [orgProject, orgEnvironment] = parseEnvName(
            core.getInput('org-environment') || `github-secrets/${owner}`,
        );
        const [repoProject, repoEnvironment] = parseEnvName(
            core.getInput('repo-environment') ||
                `github-secrets/${owner}-${repo}`,
        );
        const githubToken = core.getInput('github-token', { required: true });
        const githubSecrets = JSON.parse(
            core.getInput('github-secrets', { required: true })!,
        );
        const cloudUrl = core.getInput('cloud-url') || 'https://api.pulumi.com';

        const octokit = github.getOctokit(githubToken!);

        let accessToken = process.env.PULUMI_ACCESS_TOKEN;
        const useOidcAuth = core.getBooleanInput('oidc-auth');
        if (useOidcAuth) {
            const oidcConfig = getOidcLoginConfig(organization, cloudUrl);
            if (!oidcConfig.success) {
                throw new Error('Invalid OIDC configuration');
            }
            accessToken = await ensureAccessToken(oidcConfig.value);
        }
        if (!accessToken) {
            throw new Error(
                'A Pulumi Access Token is required. Please set the PULUMI_ACCESS_TOKEN environment variable or configure OIDC authentication',
            );
        }
        core.setSecret(accessToken);

        // Create the ESC client
        const escClient = new esc.EscApi(
            new esc.Configuration({ accessToken }),
        );

        // Fetch organization, repository, and repository-organization secret key sets
        const githubOrgSecrets = await collectSecrets((page: number) =>
            octokit.rest.actions.listOrgSecrets({ org: owner, page }),
        );
        const githubRepoSecrets = await collectSecrets((page: number) =>
            octokit.rest.actions.listRepoSecrets({ owner, repo, page }),
        );
        const githubRepoOrgSecrets = await collectSecrets((page: number) =>
            octokit.rest.actions.listRepoOrganizationSecrets({
                owner,
                repo,
                page,
            }),
        );

        // Compute environment defs
        const { orgYaml, repoYaml } = makeEnvironments({
            orgProject,
            orgEnvironment,
            githubSecrets,
            githubOrgSecrets,
            githubRepoSecrets,
            githubRepoOrgSecrets,
        });

        // If we're updating an org or repo environment, ensure that the organization environment exists. We need it to exist in the latter
        // case because the repo environment will import the org environment.
        if (orgYaml !== undefined || repoYaml !== undefined) {
            await ensureEnvironment(
                escClient,
                organization,
                orgProject,
                orgEnvironment,
            );
        }

        // Update the organization env if this repo can access all organization secrets and does not override any organization secrets.
        if (orgYaml !== undefined) {
            const diags = await escClient.updateEnvironmentYaml(
                organization,
                orgProject,
                orgEnvironment,
                orgYaml!,
            );
            if (diags?.diagnostics?.length) {
                throw new Error(
                    `updating ${orgProject}/${orgEnvironment}:\n\n${diags.diagnostics.join('\n')}`,
                );
            }
        }

        // Update the repository env.
        if (repoYaml !== undefined) {
            await ensureEnvironment(
                escClient,
                organization,
                repoProject,
                repoEnvironment,
            );
            const diags = await escClient.updateEnvironmentYaml(
                organization,
                repoProject,
                repoEnvironment,
                repoYaml,
            );
            if (diags?.diagnostics?.length) {
                throw new Error(
                    `updating ${repoProject}/${repoEnvironment}:\n\n${diags.diagnostics.join('\n')}`,
                );
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(String(error));
        }
    }
}

run();
