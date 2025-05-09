import * as core from '@actions/core';
import * as yaml from 'yaml';

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
