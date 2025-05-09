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
    def.values = {
        environmentVariables: Object.fromEntries(
            Object.entries(secrets).map(([k, v]) => [k, { 'fn::secret': v }]),
        ),
    };
    return yaml.stringify(def);
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set(Array.from(a.values()).filter(k => b.has(k)));
}

function difference<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set(Array.from(a.values()).filter(k => !b.has(k)));
}

export interface MakeEnvironmentsArgs {
    exportOrganizationSecrets: boolean;
    excludeSecrets: Set<string>;
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
        exportOrganizationSecrets,
        excludeSecrets,
        orgProject,
        orgEnvironment,
        githubSecrets,
        githubOrgSecrets,
        githubRepoSecrets,
        githubRepoOrgSecrets,
    } = args;

    const filteredSecrets = Object.fromEntries(
        Object.entries(githubSecrets).filter(
            ([key]) => !excludeSecrets.has(key),
        ),
    );

    // Check for access to all org secrets. If this repository does not have access to all of the org's secrets, we will only update the repository's environment.
    const repoHasAccessToAllOrgSecrets =
        intersect(githubRepoOrgSecrets, githubOrgSecrets).size ==
        githubOrgSecrets.size;
    if (exportOrganizationSecrets && !repoHasAccessToAllOrgSecrets) {
        const vars = Array.from(
            difference(githubOrgSecrets, githubRepoOrgSecrets),
        ).join('\n');
        core.error(
            `This repository does not have access to the following organization secrets:\n\n${vars}`,
        );
        core.error(
            'As a result, this action will not export organization secrets. Please run this action from a repository that has access to all organization secrets in order to export organization secrets',
        );
        throw new Error();
    }

    // Check for overridden organization secrets. If this repository overrides organization secrets, we will only update the repository's environment.
    const overriddenSecrets = intersect(githubOrgSecrets, githubRepoSecrets);
    const repoOverridesOrgSecrets = overriddenSecrets.size != 0;
    if (exportOrganizationSecrets && repoOverridesOrgSecrets) {
        const vars = Array.from(overriddenSecrets.values()).join('\n');
        core.error(
            `This repository overrides the following organization secrets:\n\n${vars}`,
        );
        core.error(
            'As a result, this action will not export organization secrets. Please run this action from a repository that does not override organization secrets in order to export organization secrets',
        );
        throw new Error();
    }

    const orgSecrets: any = Object.fromEntries(
        Object.entries(filteredSecrets)
            .filter(([key]) => githubOrgSecrets.has(key))
            .sort(),
    );
    const repoSecrets: any = Object.fromEntries(
        Object.entries(filteredSecrets)
            .filter(([key]) => githubRepoSecrets.has(key))
            .sort(),
    );

    // Update the organization env if this repo can access all organization secrets and does not override any organization secrets.
    const orgYaml = exportOrganizationSecrets
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
