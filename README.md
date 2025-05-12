# Pulumi ESC Export Secrets Action

[Pulumi ESC](https://www.pulumi.com/docs/esc/) makes it easy to share
Environments, Secrets and Configuration with your team. It solves the problem of
outdated .env files, secrets sprawl caused by copy/pasting from one system to
another and secure access to shared services. Pulumi ESC fits seamlessly into
any developer workflow with support for popular secret stores, short-lived OIDC
tokens and integrations for popular developer tools and CI/CD platforms.

For example, you may have a CI/CD pipeline that builds, tests and deploys your
application. You may need API keys, Cloud provider credentials, or other secrets
to be able to test and release your application. You can use this action to
securely inject those secrets directly into the GitHub Action workflow where
they are needed, without needing to store them separately.

With ESC's support for dynamic credentials and automatic secret rotation, you
can be sure that the secrets you are injecting are valid at the time of use, but
are automatically expired after a certain time period.

## Functionality

This action makes it easy to export GitHub Actions secrets to ESC environments.

Running this action within a repository will create (if necessary) and update
one environment for organization secrets and another environment for repository
secrets. The export of organization secrets must be enabled explicitly using the
`export-organization-secrets` input.

If the repository in which the action runs does not have access to all
organization secrets or if the repository overrides any organization secrets,
the action will refuse to update the organization ESC environment and fail.

If the repository in which the action runs does not have any of its own secrets,
the action will not create or update the repository ESC environment.

## Permissions

This action needs additional permissions beyond those granted by `GITHUB_TOKEN`.
These permissions are:

- "Secrets" organization permissions (read)
- "Secrets" repository permissions (read)

These permissions can be granted using a fine-grained personal access token or a
GitHub App installtion access token. The examples in this README use a GitHub
App installation access token as described in the
[GitHub documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow#authenticating-with-a-github-app).

## Inputs

### `organization`

The Pulumi Organization that contains the environments.

### `export-organization-secrets`

True to update the organization environment as well as the repository
environment.

### `exclude-secrets`

A comma-separated list of secrets to exclude from the export.

### `org-environment`

**Optional** The name of the environment that contains organization secrets.
Defaults to `github-secrets/<owner>`

### `repo-environment`

**Optional** The name of the environment that contains repository secrets.
Defaults to `github-secrets/<owner>-<repo>`

### `github-token`

The GitHub Access Token to use to authenticate with the GitHub API.

### `cloud-url`

**Optional** The URL of the Pulumi Cloud API to use. If not specified, the
default URL of https://api.pulumi.com will be used.

### `oidc-auth`

**Optional** When this input is `true`, the action will exchange the GitHub
workflow's OIDC token for a Pulumi Access Token. This token is not available to
other steps. Requires `id-token: write` permission.

### `oidc-requested-token-type`

**Optional** The type of Pulumi Access Token to obtain. Reqiured if `oidc-auth`
is true.

### `oidc-scope`

**Optional** The requested scopes for the Pulumi Access Token.

### `oidc-expiration`

**Optional** The time-to-live for the Pulumi Access Token.

## Environment variables

The `GITHUB_SECRETS` environment variable must be set to
`${{ toJSON(secrets) }}`.

## Examples

Both of the examples below assume that a Pulumi Access Token is available in the
`PULUMI_ACCESS_TOKEN` environment variable. Instead of using long-lived tokens,
the action can also authenticate with the Pulumi Cloud using OIDC via the
`oidc-auth` and `oidc-requested-token-type` environment variables.

These examples are also configured as manually-triggered workflows with the
expectation that secrets will be exported irregularly (often once).

### Export organization and repository secrets

#### Actions YAML

```yaml
on: [workflow_dispatch]
jobs:
    export-secrets:
        steps:
            - name: Generate a token
              id: generate-token
              uses: actions/create-github-app-token@v1
              with:
                  app-id: ${{ vars.APP_ID }}
                  private-key: ${{ secrets.APP_PRIVATE_KEY }}
            - uses: pulumi/esc-export-secrets-action@v1
              with:
                  organization: my-org
                  export-organization-secrets: true
                  github-token: ${{ steps.generate-token.outputs.token }}
              env:
                  GITHUB_SECRETS: ${{ toJSON(secrets) }}
```

#### Organization secrets

```
FOO: foo
BAR: bar
BAZ: baz
```

#### Repository secrets

```
REPO: repo
```

#### Organization ESC environment, `github-secrets/my-org`

```
values:
  environmentVariables:
    BAR: bar
    BAZ: baz
    FOO: foo
```

#### Repository ESC environment, `github-secrets/my-org-repo`

```
imports:
  - github-secrets/my-org
values:
  environmentVariables:
    REPO: repo
```

### Export repository secrets only

```yaml
on: [workflow_dispatch]
jobs:
    export-secrets:
        steps:
            - name: Generate a token
              id: generate-token
              uses: actions/create-github-app-token@v1
              with:
                  app-id: ${{ vars.APP_ID }}
                  private-key: ${{ secrets.APP_PRIVATE_KEY }}
            - uses: pulumi/esc-export-secrets-action@v1
              with:
                  organization: my-org
                  github-token: ${{ steps.generate-token.outputs.token }}
              env:
                  GITHUB_SECRETS: ${{ toJSON(secrets) }}
```

#### Repository secrets

```
FOO: repo-foo
REPO: repo
```

#### Repository ESC environment, `github-secrets/my-org-repo`

```
imports:
  - github-secrets/my-org
values:
  environmentVariables:
    FOO: repo-foo
    REPO: repo
```
